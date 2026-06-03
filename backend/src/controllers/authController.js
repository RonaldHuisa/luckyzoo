const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../config/db");
const { grantInternshipTree } = require("../services/greenVestTreeService");

const { addAlchemyAddressToNetworkWebhooks } = require("../services/alchemyWebhookService");

const { generateUniqueReferralCode } = require("../utils/referralUtil");
const { getClientIp, ensureSecuritySchema, captureRegisterIp, captureLoginIp, ensureIpCanRegister, logSecurityEvent } = require("../services/securityService");


const {
    generateReferralCode,
    generateBep20Wallet,
} = require("../utils/walletUtil");


function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}


function createToken(user) {
    return jwt.sign(
        {
            userId: user.id,
            email: user.email,
        },
        process.env.JWT_SECRET,
        {
            expiresIn: process.env.JWT_EXPIRES_IN || "7d",
        }
    );
}

async function register(req, res) {
    const { email, password, securityPassword, referralCode } = req.body;

    if (!email || !password || !securityPassword) {
        return res.status(400).json({
            message: "Correo, contraseña y contraseña de seguridad son obligatorios.",
        });
    }

    if (!isValidEmail(email)) {
        return res.status(400).json({
            message: "Ingresa un correo electrónico válido.",
        });
    }

    const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

    if (!strongPasswordRegex.test(password)) {
        return res.status(400).json({
            message: "La contraseña debe tener mínimo 8 caracteres, una mayúscula, una minúscula y un número.",
        });
    }

    if (password !== securityPassword) {
        return res.status(400).json({
            message: "Las contraseñas no coinciden.",
        });
    }

    const client = await pool.connect();

    try {
        await client.query("BEGIN");
        await ensureSecuritySchema(client);
        const requestIp = getClientIp(req);

        const existingUser = await client.query(
            "SELECT id FROM users WHERE email = $1",
            [email]
        );

        if (existingUser.rows.length > 0) {
            await client.query("ROLLBACK");
            return res.status(409).json({
                message: "Este correo ya está registrado.",
            });
        }

        const ipRegisterCheck = await ensureIpCanRegister(client, requestIp);

        if (!ipRegisterCheck.ok) {
            if (requestIp) {
                await logSecurityEvent(client, {
                    userId: null,
                    eventType: "REGISTER_IP_LIMIT_BLOCKED",
                    reason: `Registro bloqueado: ${ipRegisterCheck.totalAccounts} cuentas existentes desde la misma IP. Límite: ${ipRegisterCheck.limit}.`,
                    ipAddress: requestIp,
                });
            }

            await client.query("ROLLBACK");
            return res.status(429).json({
                message: ipRegisterCheck.message,
            });
        }

        let referredById = null;

        const usersCountResult = await client.query(
            "SELECT COUNT(*)::int AS total FROM users"
        );

        const isFirstUser = usersCountResult.rows[0].total === 0;
        const allowFirstUserWithoutReferral = String(process.env.ALLOW_FIRST_USER_WITHOUT_REFERRAL || "false").toLowerCase() === "true";
        const canSkipReferral = isFirstUser && allowFirstUserWithoutReferral;

        if (!canSkipReferral) {
            if (!referralCode || !referralCode.trim()) {
                await client.query("ROLLBACK");
                return res.status(400).json({
                    message: "El código de invitación es obligatorio.",
                });
            }

            const sponsorResult = await client.query(
                `
                SELECT id 
                FROM users 
                WHERE referral_code = $1
                `,
                [referralCode.trim()]
            );

            if (sponsorResult.rows.length === 0) {
                await client.query("ROLLBACK");
                return res.status(400).json({
                    message: "Código de invitación inválido.",
                });
            }

            referredById = sponsorResult.rows[0].id;
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const securityPasswordHash = await bcrypt.hash(securityPassword, 10);

        let myReferralCode = generateReferralCode();

        let referralExists = await client.query(
            "SELECT id FROM users WHERE referral_code = $1",
            [myReferralCode]
        );

        while (referralExists.rows.length > 0) {
            myReferralCode = generateReferralCode();

            referralExists = await client.query(
                "SELECT id FROM users WHERE referral_code = $1",
                [myReferralCode]
            );
        }

        const newUser = await client.query(
            `
            INSERT INTO users 
            (
                email, 
                password_hash, 
                security_password_hash, 
                referral_code, 
                referred_by_id,
                is_admin
            )
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id, email, referral_code, referred_by_id, is_admin, created_at
            `,
            [
                email,
                passwordHash,
                securityPasswordHash,
                myReferralCode,
                referredById,
                isFirstUser,
            ]
        );

        const user = newUser.rows[0];

        await captureRegisterIp(client, user.id, requestIp);

        // GreenVest Árboles V1.0: entrega automática de Pasantía gratis.
        // La Pasantía dura 3 días exactos desde la creación de la cuenta.
        await grantInternshipTree(client, user.id, user.created_at);

        const generatedWallet = generateBep20Wallet();

        // Una misma wallet EVM puede recibir fondos en BSC y Polygon.
        // Guardamos una fila por red para que los webhooks puedan identificar
        // correctamente si la recarga llegó por BEP20-USDT o POLYGON-USDT.
        const wallets = await client.query(
            `
            INSERT INTO wallets
            (
                user_id, 
                network, 
                address, 
                public_key, 
                private_key_encrypted
            )
            VALUES
                ($1, 'BEP20-USDT', $2, $3, $4),
                ($1, 'POLYGON-USDT', $2, $3, $4)
            RETURNING id, network, address, public_key
            `,
            [
                user.id,
                generatedWallet.address,
                generatedWallet.publicKey,
                generatedWallet.privateKeyEncrypted,
            ]
        );

        await client.query("COMMIT");

        // Sincroniza la wallet nueva con Alchemy sin bloquear el registro.
        // Si Alchemy falla o faltan variables, el usuario igual queda creado y
        // Moralis/pending sigue funcionando como respaldo.
        addAlchemyAddressToNetworkWebhooks(generatedWallet.address, [
            "BEP20-USDT",
            "POLYGON-USDT",
        ]).then((result) => {
            console.log("ALCHEMY REGISTER WALLET SYNC:", {
                userId: user.id,
                address: generatedWallet.address,
                result,
            });
        }).catch((syncError) => {
            console.warn("ALCHEMY REGISTER WALLET SYNC SKIPPED/FAILED:", {
                userId: user.id,
                address: generatedWallet.address,
                message: syncError.message,
            });
        });

        const token = createToken(user);
        const primaryWallet = wallets.rows.find((item) => item.network === "BEP20-USDT") || wallets.rows[0];

        return res.status(201).json({
            message: "Usuario registrado correctamente.",
            token,
            user,
            wallet: primaryWallet,
            wallets: wallets.rows,
        });
    } catch (error) {
        await client.query("ROLLBACK");

        console.error("REGISTER ERROR:", error);

        return res.status(500).json({
            message: "Error interno al registrar usuario.",
            detail: error.message,
        });
    } finally {
        client.release();
    }
}

async function login(req, res) {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({
            message: "Correo y contraseña son obligatorios.",
        });
    }

    if (!isValidEmail(email)) {
        return res.status(400).json({
            message: "Ingresa un correo electrónico válido.",
        });
    }

    try {
        await ensureSecuritySchema(pool);
        const requestIp = getClientIp(req);
        const userResult = await pool.query(
            `
      SELECT id, email, password_hash, referral_code, created_at, is_banned, banned_reason, is_suspicious, suspicious_reason
      FROM users
      WHERE email = $1
      `,
            [email]
        );

        if (userResult.rows.length === 0) {
            return res.status(401).json({
                message: "Credenciales incorrectas.",
            });
        }

        const user = userResult.rows[0];

        const validPassword = await bcrypt.compare(password, user.password_hash);

        if (!validPassword) {
            return res.status(401).json({
                message: "Credenciales incorrectas.",
            });
        }

        await captureLoginIp(pool, user.id, requestIp);

        const walletResult = await pool.query(
            `
            SELECT id, network, address, public_key
            FROM wallets
            WHERE user_id = $1
            ORDER BY CASE WHEN network = 'BEP20-USDT' THEN 0 ELSE 1 END, id ASC
            `,
            [user.id]
        );

        const token = createToken(user);

        delete user.password_hash;

        return res.json({
            message: "Login correcto.",
            token,
            user,
            wallet: walletResult.rows[0] || null,
            wallets: walletResult.rows,
        });
    } catch (error) {
        console.error("LOGIN ERROR:", error);

        return res.status(500).json({
            message: "Error interno al iniciar sesión.",
        });
    }
}


async function changePassword(req, res) {
    const userId = req.user?.userId;
    const { currentPassword, newPassword } = req.body;

    if (!userId) {
        return res.status(401).json({
            message: "No autorizado.",
        });
    }

    if (!currentPassword || !newPassword) {
        return res.status(400).json({
            message: "La contraseña actual y la nueva contraseña son obligatorias.",
        });
    }

    if (String(newPassword).length < 6) {
        return res.status(400).json({
            message: "La nueva contraseña debe tener mínimo 6 caracteres.",
        });
    }

    if (currentPassword === newPassword) {
        return res.status(400).json({
            message: "La nueva contraseña debe ser diferente a la contraseña actual.",
        });
    }

    try {
        await ensureSecuritySchema(pool);
        const requestIp = getClientIp(req);
        const userResult = await pool.query(
            `
            SELECT id, email, password_hash
            FROM users
            WHERE id = $1
            LIMIT 1
            `,
            [userId]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({
                message: "Usuario no encontrado.",
            });
        }

        const user = userResult.rows[0];
        const validPassword = await bcrypt.compare(currentPassword, user.password_hash);

        if (!validPassword) {
            return res.status(401).json({
                message: "La contraseña actual es incorrecta.",
            });
        }

        const newPasswordHash = await bcrypt.hash(newPassword, 10);

        await pool.query(
            `
            UPDATE users
            SET password_hash = $1
            WHERE id = $2
            `,
            [newPasswordHash, userId]
        );

        return res.json({
            message: "Contraseña actualizada correctamente.",
        });
    } catch (error) {
        console.error("CHANGE PASSWORD ERROR:", error);

        return res.status(500).json({
            message: "Error interno al actualizar contraseña.",
            detail: error.message,
        });
    }
}

module.exports = {
    register,
    login,
    changePassword,
};
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const pool = require("../config/db");
const { normalizePhone, normalizeCountryCode, getUserProfileBundle, validateWithdrawalAccountPayload } = require("../services/profileService");
const { ensureRouletteSchema, normalizePrize, normalizeSpin, pickPrize } = require("../services/rouletteService");
const { addAlchemyAddressToNetworkWebhooks } = require("../services/alchemyWebhookService");

const { generateUniqueReferralCode } = require("../utils/referralUtil");
const { getClientIp, ensureSecuritySchema, captureRegisterIp, captureLoginIp, ensureIpCanRegister, logSecurityEvent } = require("../services/securityService");


const {
    generateReferralCode,
    generateBep20Wallet,
} = require("../utils/walletUtil");



function getCaptchaSecret() {
    return process.env.CAPTCHA_SECRET || process.env.JWT_SECRET || "royal-imperial-ai-captcha-secret";
}

function signCaptchaPayload(payloadPart) {
    return crypto
        .createHmac("sha256", getCaptchaSecret())
        .update(payloadPart)
        .digest("base64url");
}

function createCaptchaToken(answer) {
    const salt = crypto.randomBytes(10).toString("hex");
    const answerHash = crypto
        .createHmac("sha256", getCaptchaSecret())
        .update(`${String(answer).trim()}:${salt}`)
        .digest("hex");

    const payload = {
        exp: Date.now() + 5 * 60 * 1000,
        salt,
        answerHash,
    };

    const payloadPart = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = signCaptchaPayload(payloadPart);
    return `${payloadPart}.${signature}`;
}

function verifyCaptchaToken(token, answer) {
    if (!token || answer === undefined || answer === null || String(answer).trim() === "") {
        return false;
    }

    const [payloadPart, signature] = String(token).split(".");
    if (!payloadPart || !signature) return false;

    const expectedSignature = signCaptchaPayload(payloadPart);
    const signatureBuffer = Buffer.from(signature);
    const expectedSignatureBuffer = Buffer.from(expectedSignature);
    if (signatureBuffer.length !== expectedSignatureBuffer.length || !crypto.timingSafeEqual(signatureBuffer, expectedSignatureBuffer)) {
        return false;
    }

    let payload;
    try {
        payload = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8"));
    } catch (_) {
        return false;
    }

    if (!payload.exp || Date.now() > payload.exp || !payload.salt || !payload.answerHash) {
        return false;
    }

    const answerHash = crypto
        .createHmac("sha256", getCaptchaSecret())
        .update(`${String(answer).trim()}:${payload.salt}`)
        .digest("hex");

    const answerBuffer = Buffer.from(answerHash);
    const expectedAnswerBuffer = Buffer.from(payload.answerHash);
    return answerBuffer.length === expectedAnswerBuffer.length && crypto.timingSafeEqual(answerBuffer, expectedAnswerBuffer);
}

function captcha(req, res) {
    const a = Math.floor(Math.random() * 8) + 2;
    const b = Math.floor(Math.random() * 8) + 1;
    const answer = a + b;

    return res.json({
        question: `${a} + ${b}`,
        token: createCaptchaToken(answer),
    });
}

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
    const { email, password, securityPassword, referralCode, captchaToken, captchaAnswer } = req.body;


    if (!verifyCaptchaToken(captchaToken, captchaAnswer)) {
        return res.status(400).json({
            message: "Verificación no válida. Inténtalo nuevamente.",
        });
    }

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

        // Royal Imperial AI:
        // - El primer usuario de una base limpia puede registrarse sin código de invitación.
        // - Ese primer usuario se crea automáticamente como administrador.
        // - Desde el segundo usuario en adelante, el código de invitación es obligatorio.
        const canSkipReferral = isFirstUser;

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
      SELECT id, email, password_hash, referral_code, created_at, is_admin, is_banned, banned_reason, is_suspicious, suspicious_reason
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


async function getMe(req, res) {
    try {
        const userId = req.user.userId;
        const bundle = await getUserProfileBundle(userId);
        if (!bundle.profile) {
            return res.status(404).json({ message: "Usuario no encontrado." });
        }
        return res.json(bundle);
    } catch (error) {
        console.error("GET ME PROFILE ERROR:", error);
        return res.status(500).json({ message: "Error al cargar datos de cuenta.", detail: error.message });
    }
}

async function updateProfile(req, res) {
    const userId = req.user.userId;
    const {
        fullName,
        phoneCountryIso,
        phoneCountryName,
        phoneCountryCode,
        phoneNumber,
    } = req.body || {};

    const cleanFullName = String(fullName || "").trim().slice(0, 160);
    const cleanCountryIso = String(phoneCountryIso || "").trim().toUpperCase().slice(0, 8);
    const cleanCountryName = String(phoneCountryName || "").trim().slice(0, 80);
    const cleanCountryCode = normalizeCountryCode(phoneCountryCode);
    const cleanPhone = normalizePhone(phoneNumber);

    if (cleanFullName.length < 3) {
        return res.status(400).json({ message: "Ingresa tu nombre completo." });
    }
    if (!cleanCountryCode || cleanPhone.length < 6) {
        return res.status(400).json({ message: "Ingresa un número de celular válido." });
    }

    try {
        await pool.query(
            `
            UPDATE users
            SET
                full_name = $1,
                phone_country_iso = $2,
                phone_country_name = $3,
                phone_country_code = $4,
                phone_number = $5
            WHERE id = $6
            `,
            [cleanFullName, cleanCountryIso, cleanCountryName, cleanCountryCode, cleanPhone, userId]
        );

        const bundle = await getUserProfileBundle(userId);
        return res.json({ message: "Datos actualizados correctamente.", ...bundle });
    } catch (error) {
        console.error("UPDATE PROFILE ERROR:", error);
        return res.status(500).json({ message: "Error al actualizar datos personales.", detail: error.message });
    }
}

async function saveWithdrawalAccount(req, res) {
    const userId = req.user.userId;
    const validation = validateWithdrawalAccountPayload(req.body || {});
    if (!validation.ok) {
        return res.status(400).json({ message: validation.message });
    }

    const { network, withdrawalAddress, label, isDefault } = validation.account;
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        if (isDefault) {
            await client.query(
                `UPDATE user_withdrawal_accounts SET is_default = false WHERE user_id = $1`,
                [userId]
            );
        }
        const existingCount = await client.query(
            `SELECT COUNT(*)::int AS total FROM user_withdrawal_accounts WHERE user_id = $1`,
            [userId]
        );
        const shouldDefault = isDefault || Number(existingCount.rows[0]?.total || 0) === 0;

        await client.query(
            `
            INSERT INTO user_withdrawal_accounts
              (user_id, network, label, withdrawal_address, is_default, updated_at)
            VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
            ON CONFLICT (user_id, network)
            DO UPDATE SET
              label = EXCLUDED.label,
              withdrawal_address = EXCLUDED.withdrawal_address,
              is_default = EXCLUDED.is_default,
              updated_at = CURRENT_TIMESTAMP
            `,
            [userId, network, label, withdrawalAddress, shouldDefault]
        );

        await client.query("COMMIT");
        const bundle = await getUserProfileBundle(userId);
        return res.json({ message: "Cuenta de retiro guardada correctamente.", ...bundle });
    } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        console.error("SAVE WITHDRAWAL ACCOUNT ERROR:", error);
        return res.status(500).json({ message: "Error al guardar cuenta de retiro.", detail: error.message });
    } finally {
        client.release();
    }
}

async function deleteWithdrawalAccount(req, res) {
    const userId = req.user.userId;
    const accountId = Number(req.params.accountId);
    if (!accountId) return res.status(400).json({ message: "Cuenta inválida." });

    try {
        const result = await pool.query(
            `DELETE FROM user_withdrawal_accounts WHERE id = $1 AND user_id = $2 RETURNING id`,
            [accountId, userId]
        );
        if (!result.rows.length) return res.status(404).json({ message: "Cuenta de retiro no encontrada." });
        const bundle = await getUserProfileBundle(userId);
        return res.json({ message: "Cuenta de retiro eliminada.", ...bundle });
    } catch (error) {
        console.error("DELETE WITHDRAWAL ACCOUNT ERROR:", error);
        return res.status(500).json({ message: "Error al eliminar cuenta de retiro.", detail: error.message });
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

async function redeemCode(req, res) {
    const userId = req.user.userId;
    const rawCode = String(req.body?.code || "").trim().toUpperCase();

    if (!rawCode) {
        return res.status(400).json({ message: "Ingresa un código válido." });
    }

    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        const codeResult = await client.query(
            `
            SELECT *
            FROM redeem_codes
            WHERE UPPER(code) = $1
            FOR UPDATE
            `,
            [rawCode]
        );

        if (!codeResult.rows.length) {
            await client.query("ROLLBACK");
            return res.status(404).json({ message: "Código no válido." });
        }

        const code = codeResult.rows[0];

        if (!code.is_active) {
            await client.query("ROLLBACK");
            return res.status(400).json({ message: "Código no disponible." });
        }

        if (code.expires_at && new Date(code.expires_at).getTime() < Date.now()) {
            await client.query("ROLLBACK");
            return res.status(400).json({ message: "Código no disponible." });
        }

        if (Number(code.used_count || 0) >= Number(code.max_uses || 1)) {
            await client.query("ROLLBACK");
            return res.status(400).json({ message: "Código sin usos disponibles." });
        }

        const existing = await client.query(
            `SELECT id FROM redeem_code_redemptions WHERE code_id = $1 AND user_id = $2 LIMIT 1`,
            [code.id, userId]
        );

        if (existing.rows.length) {
            await client.query("ROLLBACK");
            return res.status(400).json({ message: "Ya usaste este código." });
        }

        const amount = Number(code.amount_usdt || 0);
        if (!Number.isFinite(amount) || amount <= 0) {
            await client.query("ROLLBACK");
            return res.status(400).json({ message: "Código no válido." });
        }

        const balanceType = String(code.balance_type || "").toLowerCase();
        if (balanceType === "recharge") {
            await client.query(
                `
                UPDATE users
                SET
                  balance_usdt = COALESCE(balance_usdt,0) + $1,
                  recharge_balance_usdt = COALESCE(recharge_balance_usdt,0) + $1
                WHERE id = $2
                `,
                [amount, userId]
            );
        } else if (balanceType === "withdrawable") {
            await client.query(
                `
                UPDATE users
                SET
                  withdrawable_usdt = COALESCE(withdrawable_usdt,0) + $1,
                  earnings_balance_usdt = COALESCE(earnings_balance_usdt,0) + $1
                WHERE id = $2
                `,
                [amount, userId]
            );
        } else {
            await client.query("ROLLBACK");
            return res.status(400).json({ message: "Código no válido." });
        }

        const redemption = await client.query(
            `
            INSERT INTO redeem_code_redemptions(code_id, user_id, balance_type, amount_usdt)
            VALUES ($1, $2, $3, $4)
            RETURNING id
            `,
            [code.id, userId, balanceType, amount]
        );

        await client.query(
            `
            UPDATE redeem_codes
            SET used_count = COALESCE(used_count,0) + 1,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
            `,
            [code.id]
        );

        await client.query(
            `
            INSERT INTO account_ledger(user_id,balance_type,direction,type,title,amount_usdt,description,reference_type,reference_id,metadata,status)
            VALUES ($1,$2,'credit','redeem_code',$3,$4,$5,'redeem_code',$6,$7::jsonb,'completed')
            `,
            [
                userId,
                balanceType,
                balanceType === "recharge" ? "Código aplicado a saldo de garantía" : "Código aplicado a saldo retirable",
                amount,
                `Código ${code.code} aplicado correctamente.`,
                redemption.rows[0].id,
                JSON.stringify({ codeId: code.id, code: code.code }),
            ]
        );

        await client.query("COMMIT");

        const bundle = await getUserProfileBundle(userId);
        return res.json({
            message: "Código canjeado correctamente.",
            amountUsdt: amount,
            balanceType,
            ...bundle,
        });
    } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        console.error("REDEEM CODE ERROR:", error);
        if (String(error.code) === "23505") {
            return res.status(400).json({ message: "Ya usaste este código." });
        }
        return res.status(500).json({ message: "Error al canjear código.", detail: error.message });
    } finally {
        client.release();
    }
}

async function getRouletteStatus(req, res) {
    const userId = req.user.userId;
    const client = await pool.connect();
    try {
        await ensureRouletteSchema(client);
        const [userResult, prizesResult, spinsResult] = await Promise.all([
            client.query(`SELECT id, COALESCE(roulette_points,0) AS roulette_points FROM users WHERE id=$1`, [userId]),
            client.query(`SELECT * FROM roulette_prizes WHERE is_active=true ORDER BY sort_order ASC, id ASC`),
            client.query(`SELECT * FROM roulette_spins WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20`, [userId]),
        ]);

        return res.json({
            points: Number(userResult.rows[0]?.roulette_points || 0),
            prizes: prizesResult.rows.map(normalizePrize),
            history: spinsResult.rows.map(normalizeSpin),
        });
    } catch (error) {
        console.error("GET ROULETTE STATUS ERROR:", error);
        return res.status(500).json({ message: "Error al cargar ruleta.", detail: error.message });
    } finally {
        client.release();
    }
}

async function spinRoulette(req, res) {
    const userId = req.user.userId;
    const client = await pool.connect();
    try {
        await ensureRouletteSchema(client);
        await client.query("BEGIN");

        const userResult = await client.query(
            `SELECT id, COALESCE(roulette_points,0) AS roulette_points FROM users WHERE id=$1 FOR UPDATE`,
            [userId]
        );
        if (!userResult.rows.length) {
            await client.query("ROLLBACK");
            return res.status(404).json({ message: "Usuario no encontrado." });
        }

        const currentPoints = Number(userResult.rows[0].roulette_points || 0);
        if (currentPoints <= 0) {
            await client.query("ROLLBACK");
            return res.status(400).json({ message: "No tienes giros disponibles." });
        }

        const prizesResult = await client.query(`SELECT * FROM roulette_prizes WHERE is_active=true ORDER BY sort_order ASC, id ASC`);
        const prize = pickPrize(prizesResult.rows);
        if (!prize) {
            await client.query("ROLLBACK");
            return res.status(400).json({ message: "Ruleta no disponible." });
        }

        const amount = Number(prize.amount_usdt || 0);
        const creditPoints = Number(prize.credit_points || 0);
        const prizeType = prize.prize_type || "withdrawable";

        await client.query(`UPDATE users SET roulette_points = GREATEST(COALESCE(roulette_points,0)-1,0) WHERE id=$1`, [userId]);

        if (prizeType === "withdrawable" && amount > 0) {
            await client.query(
                `UPDATE users SET withdrawable_usdt=COALESCE(withdrawable_usdt,0)+$1, earnings_balance_usdt=COALESCE(earnings_balance_usdt,0)+$1 WHERE id=$2`,
                [amount, userId]
            );
        } else if (prizeType === "recharge" && amount > 0) {
            await client.query(
                `UPDATE users SET balance_usdt=COALESCE(balance_usdt,0)+$1, recharge_balance_usdt=COALESCE(recharge_balance_usdt,0)+$1 WHERE id=$2`,
                [amount, userId]
            );
        } else if (prizeType === "credit_points" && creditPoints > 0) {
            await client.query(
                `UPDATE users SET credit_points=COALESCE(credit_points,100)+$1 WHERE id=$2`,
                [creditPoints, userId]
            );
        }

        const spinResult = await client.query(
            `
            INSERT INTO roulette_spins(user_id,prize_id,prize_label,prize_type,amount_usdt,credit_points,metadata)
            VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
            RETURNING *
            `,
            [userId, prize.id, prize.label, prizeType, amount, creditPoints, JSON.stringify({ source: "user_spin" })]
        );

        if ((prizeType === "withdrawable" || prizeType === "recharge") && amount > 0) {
            await client.query(
                `
                INSERT INTO account_ledger(user_id,balance_type,direction,type,title,amount_usdt,description,reference_type,reference_id,metadata,status)
                VALUES ($1,$2,'credit','roulette_prize',$3,$4,$5,'roulette_spin',$6,$7::jsonb,'completed')
                `,
                [
                    userId,
                    prizeType === "recharge" ? "recharge" : "withdrawable",
                    "Premio de ruleta",
                    amount,
                    `Premio obtenido en ruleta: ${prize.label}`,
                    spinResult.rows[0].id,
                    JSON.stringify({ prizeId: prize.id, prizeLabel: prize.label, prizeType }),
                ]
            );
        }

        const remainingResult = await client.query(`SELECT COALESCE(roulette_points,0) AS roulette_points FROM users WHERE id=$1`, [userId]);
        const historyResult = await client.query(`SELECT * FROM roulette_spins WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20`, [userId]);

        await client.query("COMMIT");

        return res.json({
            message: "Giro completado.",
            prize: normalizePrize(prize),
            spin: normalizeSpin(spinResult.rows[0]),
            points: Number(remainingResult.rows[0]?.roulette_points || 0),
            history: historyResult.rows.map(normalizeSpin),
        });
    } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        console.error("SPIN ROULETTE ERROR:", error);
        return res.status(500).json({ message: "Error al girar ruleta.", detail: error.message });
    } finally {
        client.release();
    }
}

module.exports = {
    register,
    login,
    changePassword,
    captcha,
    getMe,
    updateProfile,
    saveWithdrawalAccount,
    deleteWithdrawalAccount,
  redeemCode,
  getRouletteStatus,
  spinRoulette,
};
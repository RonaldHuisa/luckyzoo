const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const pool = require("../config/db");
const { normalizePhone, normalizeCountryCode, getUserProfileBundle, validateWithdrawalAccountPayload } = require("../services/profileService");
const { buildRouletteStatus, spinRouletteBackend, exchangeRouletteCoinsBackend } = require("../services/rouletteService");
const { addAlchemyAddressToNetworkWebhooks } = require("../services/alchemyWebhookService");
const { ensureCreditPointsSchema, awardCreditPointMilestone, adjustCreditPoints } = require("../services/creditPointsService");
const { ensureRedeemCodeLimitSchema, getRedeemDailyLimitConfig, getUserRedeemDailyStatus, buildDailyLimitMessage, REDEEM_TIMEZONE } = require("../services/redeemCodeLimitService");
const { assertNoPlanRewardBalanceCap, isNoPlanBalanceCapError } = require("../services/noPlanBalanceCapService");
const { awardInviteBonus } = require("../services/referralTeamService");

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

function normalizeCaptchaAnswer(answer) {
    return String(answer || "").trim().toUpperCase();
}

function createCaptchaToken(answer) {
    const salt = crypto.randomBytes(10).toString("hex");
    const normalizedAnswer = normalizeCaptchaAnswer(answer);
    const answerHash = crypto
        .createHmac("sha256", getCaptchaSecret())
        .update(`${normalizedAnswer}:${salt}`)
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

    const normalizedAnswer = normalizeCaptchaAnswer(answer);
    const answerHash = crypto
        .createHmac("sha256", getCaptchaSecret())
        .update(`${normalizedAnswer}:${payload.salt}`)
        .digest("hex");

    const answerBuffer = Buffer.from(answerHash);
    const expectedAnswerBuffer = Buffer.from(payload.answerHash);
    return answerBuffer.length === expectedAnswerBuffer.length && crypto.timingSafeEqual(answerBuffer, expectedAnswerBuffer);
}

function generateLetterCaptcha(length = 6) {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    let value = "";
    for (let i = 0; i < length; i += 1) {
        value += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return value;
}

function captcha(req, res) {
    const answer = generateLetterCaptcha(6);

    return res.json({
        question: answer,
        type: "letters",
        length: 6,
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


async function getActivityFeed(req, res) {
    try {
        const withdrawals = await pool.query(`
            SELECT
                'withdrawal' AS type,
                u.id AS user_id,
                u.referral_code,
                COALESCE(vip.active_vip_level, 0) AS vip_level,
                w.amount_to_receive AS amount,
                0::numeric AS coins,
                w.created_at
            FROM withdrawals w
            JOIN users u ON u.id = w.user_id
            LEFT JOIN LATERAL (
                SELECT vp.level AS active_vip_level
                FROM vip_purchases vp
                WHERE vp.user_id = u.id
                  AND vp.status = 'active'
                  AND (vp.expires_at IS NULL OR vp.expires_at > NOW())
                ORDER BY vp.level DESC, vp.id DESC
                LIMIT 1
            ) vip ON TRUE
            WHERE w.status IN ('paid','completed','approved')
              AND COALESCE(w.amount_to_receive,0) > 0
            ORDER BY w.created_at DESC
            LIMIT 30
        `);

        const jackpots = await pool.query(`
            SELECT
                'jackpot' AS type,
                u.id AS user_id,
                u.referral_code,
                COALESCE(NULLIF(rs.level, 0), COALESCE(vip.active_vip_level, 0), 0) AS vip_level,
                0::numeric AS amount,
                rs.coin_amount AS coins,
                rs.created_at
            FROM roulette_spins rs
            JOIN users u ON u.id = rs.user_id
            LEFT JOIN LATERAL (
                SELECT vp.level AS active_vip_level
                FROM vip_purchases vp
                WHERE vp.user_id = u.id
                  AND vp.status = 'active'
                  AND (vp.expires_at IS NULL OR vp.expires_at > NOW())
                ORDER BY vp.level DESC, vp.id DESC
                LIMIT 1
            ) vip ON TRUE
            WHERE rs.status = 'completed'
              AND COALESCE(rs.coin_amount,0) IN (500,1000,2000,5000)
            ORDER BY rs.created_at DESC
            LIMIT 30
        `);

        const items = [...withdrawals.rows, ...jackpots.rows]
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .slice(0, 40)
            .map((item) => ({
                type: item.type,
                userId: Number(item.user_id || 0),
                userCode: item.referral_code || String(item.user_id || ""),
                vipLevel: Number(item.vip_level || 0),
                amount: Number(item.amount || 0),
                coins: Number(item.coins || 0),
                createdAt: item.created_at,
            }));

        return res.json({ items });
    } catch (error) {
        console.error("ACTIVITY FEED ERROR:", error);
        return res.status(500).json({
            message: "Error al cargar actividad.",
            detail: error.message,
        });
    }
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
        await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS registration_bonus_spins_remaining INTEGER DEFAULT 0 NOT NULL`);
        await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS registration_bonus_spins_granted INTEGER DEFAULT 0 NOT NULL`);
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
                is_admin,
                credit_points,
                registration_bonus_spins_remaining,
                registration_bonus_spins_granted
            )
            VALUES ($1, $2, $3, $4, $5, $6, 50, 15, 15)
            RETURNING id, email, referral_code, referred_by_id, is_admin, credit_points, created_at
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

        await ensureCreditPointsSchema(client);
        await adjustCreditPoints(client, {
            userId: user.id,
            operation: "set",
            points: 50,
            reason: "Puntos base al crear cuenta.",
            eventType: "register_base",
            eventKey: "register_base",
            metadata: { source: "register" },
        });

        await captureRegisterIp(client, user.id, requestIp);

        if (referredById) {
            await awardInviteBonus(client, referredById, user.id);
        }

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

        await awardCreditPointMilestone(
            pool,
            userId,
            60,
            "contact_complete",
            "Datos de contacto registrados.",
            { fullName: cleanFullName, phoneCountryIso: cleanCountryIso, phoneCountryCode: cleanCountryCode }
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

    const { network, withdrawalAddress, label } = validation.account;
    const normalizedAddress = String(withdrawalAddress || "").trim().toLowerCase();
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const existingUserAccount = await client.query(
            `
            SELECT id, network, withdrawal_address
            FROM user_withdrawal_accounts
            WHERE user_id = $1
            ORDER BY id ASC
            LIMIT 1
            FOR UPDATE
            `,
            [userId]
        );

        if (existingUserAccount.rows.length > 0) {
            await client.query("ROLLBACK");
            return res.status(409).json({
                message: "Tu método de retiro ya está registrado y no se puede cambiar.",
            });
        }

        const duplicateAddress = await client.query(
            `
            SELECT id, user_id
            FROM user_withdrawal_accounts
            WHERE LOWER(withdrawal_address) = $1
            LIMIT 1
            `,
            [normalizedAddress]
        );

        if (duplicateAddress.rows.length > 0) {
            await client.query("ROLLBACK");
            return res.status(409).json({
                message: "Wallet ya usada. Está prohibido multicuentas.",
            });
        }

        await client.query(
            `
            INSERT INTO user_withdrawal_accounts
              (user_id, network, label, withdrawal_address, is_default, updated_at)
            VALUES ($1, $2, $3, $4, true, CURRENT_TIMESTAMP)
            `,
            [userId, network, label || network, withdrawalAddress]
        );

        await client.query(
            `
            UPDATE users
            SET
              withdraw_enabled = true,
              withdraw_enabled_at = COALESCE(withdraw_enabled_at, NOW()),
              withdraw_enabled_note = 'Wallet de retiro registrada y aprobada automáticamente.'
            WHERE id = $1
            `,
            [userId]
        );

        await awardCreditPointMilestone(
            client,
            userId,
            70,
            "withdrawal_account_complete",
            "Método de retiro registrado.",
            { network }
        );

        await client.query("COMMIT");
        const bundle = await getUserProfileBundle(userId);
        return res.json({ message: "Método de retiro registrado correctamente.", ...bundle });
    } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        if (error?.code === "23505") {
            return res.status(409).json({ message: "Wallet ya usada. Está prohibido multicuentas." });
        }
        console.error("SAVE WITHDRAWAL ACCOUNT ERROR:", error);
        return res.status(500).json({ message: "Error al guardar método de retiro.", detail: error.message });
    } finally {
        client.release();
    }
}



async function deleteWithdrawalAccount(req, res) {
    return res.status(403).json({
        message: "El método de retiro no se puede eliminar ni cambiar por seguridad.",
    });
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


async function getRedeemCodeStatus(req, res) {
    const userId = req.user.userId;
    try {
        await ensureRedeemCodeLimitSchema();
        const client = await pool.connect();
        try {
            const config = await getRedeemDailyLimitConfig(client);
            const status = await getUserRedeemDailyStatus(client, userId, config);
            return res.json(status);
        } finally {
            client.release();
        }
    } catch (error) {
        console.error("REDEEM STATUS ERROR:", error);
        return res.status(500).json({ message: "No se pudo obtener el estado de canje." });
    }
}

async function redeemCode(req, res) {
    const userId = req.user.userId;
    const rawCode = String(req.body?.code || "").trim().toUpperCase();

    if (!rawCode) {
        return res.status(400).json({ message: "Ingresa un código válido." });
    }

    try {
        await ensureRedeemCodeLimitSchema();
    } catch (error) {
        console.error("REDEEM LIMIT SCHEMA ERROR:", error);
        return res.status(500).json({ message: "No se pudo preparar el sistema de límites de códigos." });
    }

    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        // Bloquea la cuenta para impedir que solicitudes simultáneas superen el límite diario.
        const userLock = await client.query(
            `SELECT id,
                    COALESCE(recharge_balance_usdt,0)::numeric AS recharge_balance_usdt,
                    COALESCE(withdrawable_usdt,0)::numeric AS withdrawable_usdt
             FROM users WHERE id = $1 FOR UPDATE`,
            [userId]
        );

        if (!userLock.rows.length) {
            await client.query("ROLLBACK");
            return res.status(404).json({ message: "Usuario no encontrado." });
        }

        const limitConfig = await getRedeemDailyLimitConfig(client);
        const dailyStatus = await getUserRedeemDailyStatus(client, userId, limitConfig);

        if (dailyStatus.reachedLimit) {
            await client.query("ROLLBACK");
            return res.status(429).json({
                message: buildDailyLimitMessage(dailyStatus),
                dailyLimit: dailyStatus.dailyLimit,
                usedToday: dailyStatus.usedToday,
                remainingToday: 0,
                activeLevel: dailyStatus.activeLevel,
                resetTimezone: "GMT-5",
            });
        }

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
            return res.status(400).json({ message: "Código ya no tiene usos disponibles." });
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

        if (balanceType !== "recharge" && balanceType !== "withdrawable") {
            await client.query("ROLLBACK");
            return res.status(400).json({ message: "Código no válido." });
        }

        const capResult = await assertNoPlanRewardBalanceCap(client, {
            userId,
            balanceType,
            amount,
        });
        const creditedAmount = Number(capResult.creditedAmount || amount);

        if (balanceType === "recharge") {
            await client.query(
                `
                UPDATE users
                SET
                  balance_usdt = COALESCE(balance_usdt,0) + $1,
                  recharge_balance_usdt = COALESCE(recharge_balance_usdt,0) + $1
                WHERE id = $2
                `,
                [creditedAmount, userId]
            );
        } else {
            await client.query(
                `
                UPDATE users
                SET
                  withdrawable_usdt = COALESCE(withdrawable_usdt,0) + $1,
                  earnings_balance_usdt = COALESCE(earnings_balance_usdt,0) + $1
                WHERE id = $2
                `,
                [creditedAmount, userId]
            );
        }

        const redemption = await client.query(
            `
            INSERT INTO redeem_code_redemptions(
              code_id,
              user_id,
              balance_type,
              amount_usdt,
              redeemed_day
            )
            VALUES (
              $1,
              $2,
              $3,
              $4,
              ((CURRENT_TIMESTAMP AT TIME ZONE $5)::date)
            )
            RETURNING id
            `,
            [code.id, userId, balanceType, creditedAmount, REDEEM_TIMEZONE]
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
                creditedAmount,
                `Código ${code.code} aplicado correctamente.`,
                redemption.rows[0].id,
                JSON.stringify({ codeId: code.id, code: code.code, requestedAmountUsdt: amount, creditedAmountUsdt: creditedAmount, partialCredit: Boolean(capResult.partial) }),
            ]
        );

        const updatedDailyStatus = await getUserRedeemDailyStatus(client, userId, limitConfig);

        await client.query("COMMIT");

        const bundle = await getUserProfileBundle(userId);
        return res.json({
            message: capResult.message || "Código canjeado correctamente.",
            amountUsdt: creditedAmount,
            requestedAmountUsdt: amount,
            partialCredit: Boolean(capResult.partial),
            balanceType,
            redeemDailyStatus: updatedDailyStatus,
            ...bundle,
        });
    } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        if (isNoPlanBalanceCapError(error)) {
            return res.status(400).json({ message: error.message, code: error.code });
        }
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
        const status = await buildRouletteStatus(client, userId);
        return res.json(status);
    } catch (error) {
        console.error("GET ROULETTE STATUS ERROR:", error);
        return res.status(500).json({ message: "Error al cargar ruleta.", detail: error.message });
    } finally {
        client.release();
    }
}

async function spinRoulette(req, res) {
    const userId = req.user.userId;
    const idempotencyKey = req.body?.idempotencyKey || req.get("Idempotency-Key") || null;
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const result = await spinRouletteBackend(client, { userId, idempotencyKey });
        await client.query("COMMIT");
        return res.json({
            message: result.reused ? `Resultado ya registrado: ganaste ${Number(result.reward.coins || 0).toLocaleString("es-PE")} monedas.` : `Ganaste ${Number(result.reward.coins || 0).toLocaleString("es-PE")} monedas.`,
            reward: result.reward,
            spin: result.spin,
            status: result.status,
        });
    } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        console.error("SPIN ROULETTE ERROR:", error);
        const httpStatus = ["HOURLY_SPINS_EXHAUSTED", "DAILY_REWARD_COMPLETED"].includes(error.code) ? 400 : 500;
        return res.status(httpStatus).json({ message: error.message || "Error al girar ruleta.", code: error.code || "ROULETTE_ERROR" });
    } finally {
        client.release();
    }
}

async function exchangeRouletteCoins(req, res) {
    const userId = req.user.userId;
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const result = await exchangeRouletteCoinsBackend(client, userId);
        await client.query("COMMIT");
        return res.json({
            message: `Cambiaste ${Number(result.exchange.coinsSpent || 0).toLocaleString("es-PE")} monedas por ${Number(result.exchange.amountUsdt || 0)} USDT.`,
            exchange: result.exchange,
            status: result.status,
        });
    } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        console.error("EXCHANGE ROULETTE COINS ERROR:", error);
        const httpStatus = ["INSUFFICIENT_COINS", "USER_NOT_FOUND"].includes(error.code) ? 400 : 500;
        return res.status(httpStatus).json({ message: error.message || "Error al cambiar monedas.", code: error.code || "EXCHANGE_ERROR" });
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
  getRedeemCodeStatus,
  getRouletteStatus,
  spinRoulette,
  exchangeRouletteCoins,
  getActivityFeed,
};
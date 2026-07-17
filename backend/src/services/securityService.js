const pool = require("../config/db");

const SUSPICIOUS_IP_THRESHOLD = Number(process.env.SUSPICIOUS_IP_THRESHOLD || 5);
const REVIEW_IP_THRESHOLD = Number(process.env.REVIEW_IP_THRESHOLD || 3);
const MAX_REGISTER_ACCOUNTS_PER_IP = Number(process.env.MAX_REGISTER_ACCOUNTS_PER_IP || 5);
const MULTIACCOUNT_WITHDRAW_IP_LIMIT = Number(process.env.MULTIACCOUNT_WITHDRAW_IP_LIMIT || 5);

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const firstForwarded = raw ? String(raw).split(",")[0].trim() : "";
  const candidate = firstForwarded || req.headers["x-real-ip"] || req.socket?.remoteAddress || req.ip || "";
  return String(candidate || "")
    .replace(/^::ffff:/, "")
    .trim()
    .slice(0, 80) || null;
}

async function ensureSecuritySchema(clientOrPool = pool) {
  await clientOrPool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS register_ip VARCHAR(80),
    ADD COLUMN IF NOT EXISTS last_login_ip VARCHAR(80),
    ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP WITHOUT TIME ZONE,
    ADD COLUMN IF NOT EXISTS is_suspicious BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS suspicious_reason TEXT,
    ADD COLUMN IF NOT EXISTS suspicious_at TIMESTAMP WITHOUT TIME ZONE,
    ADD COLUMN IF NOT EXISTS is_banned BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS banned_reason TEXT,
    ADD COLUMN IF NOT EXISTS banned_at TIMESTAMP WITHOUT TIME ZONE,
    ADD COLUMN IF NOT EXISTS banned_by INTEGER
  `);

  await clientOrPool.query(`
    CREATE TABLE IF NOT EXISTS user_security_events (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      event_type VARCHAR(50) NOT NULL,
      reason TEXT,
      ip_address VARCHAR(80),
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await clientOrPool.query(`
    ALTER TABLE user_security_events
    ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb
  `);

  await clientOrPool.query(`CREATE INDEX IF NOT EXISTS idx_users_register_ip ON users(register_ip)`);
  await clientOrPool.query(`CREATE INDEX IF NOT EXISTS idx_users_last_login_ip ON users(last_login_ip)`);
  await clientOrPool.query(`CREATE INDEX IF NOT EXISTS idx_users_security_flags ON users(is_suspicious, is_banned)`);
  await clientOrPool.query(`CREATE INDEX IF NOT EXISTS idx_user_security_events_user_id ON user_security_events(user_id)`);
}

async function logSecurityEvent(clientOrPool, { userId, eventType, reason = null, ipAddress = null, createdBy = null }) {
  await ensureSecuritySchema(clientOrPool);
  await clientOrPool.query(
    `
    INSERT INTO user_security_events (user_id, event_type, reason, ip_address, created_by)
    VALUES ($1, $2, $3, $4, $5)
    `,
    [userId, eventType, reason, ipAddress, createdBy]
  );
}

async function captureRegisterIp(clientOrPool, userId, ipAddress) {
  await ensureSecuritySchema(clientOrPool);
  await clientOrPool.query(
    `
    UPDATE users
    SET register_ip = COALESCE(register_ip, $2),
        last_login_ip = COALESCE(last_login_ip, $2),
        last_login_at = COALESCE(last_login_at, CURRENT_TIMESTAMP)
    WHERE id = $1
    `,
    [userId, ipAddress]
  );

  if (ipAddress) {
    await logSecurityEvent(clientOrPool, {
      userId,
      eventType: "REGISTER_IP_CAPTURED",
      reason: "IP capturada durante el registro.",
      ipAddress,
    });
  }

  await autoMarkSuspiciousByIp(clientOrPool, ipAddress);
}

async function captureLoginIp(clientOrPool, userId, ipAddress) {
  await ensureSecuritySchema(clientOrPool);
  await clientOrPool.query(
    `
    UPDATE users
    SET last_login_ip = $2,
        last_login_at = CURRENT_TIMESTAMP,
        register_ip = COALESCE(register_ip, $2)
    WHERE id = $1
    `,
    [userId, ipAddress]
  );

  if (ipAddress) {
    await logSecurityEvent(clientOrPool, {
      userId,
      eventType: "LOGIN_IP_CAPTURED",
      reason: "IP capturada durante el inicio de sesión.",
      ipAddress,
    });
  }

  await autoMarkSuspiciousByIp(clientOrPool, ipAddress);
}

async function autoMarkSuspiciousByIp(clientOrPool, ipAddress) {
  if (!ipAddress) return { marked: 0, totalAccounts: 0 };

  await ensureSecuritySchema(clientOrPool);

  const countResult = await clientOrPool.query(
    `
    SELECT COUNT(*)::int AS total
    FROM users
    WHERE register_ip = $1 OR last_login_ip = $1
    `,
    [ipAddress]
  );

  const totalAccounts = Number(countResult.rows[0]?.total || 0);

  if (totalAccounts < SUSPICIOUS_IP_THRESHOLD) {
    return { marked: 0, totalAccounts };
  }

  const reason = `Auto alerta: ${totalAccounts} cuentas detectadas con la misma IP (${ipAddress}). Revisar manualmente.`;

  const updateResult = await clientOrPool.query(
    `
    UPDATE users
    SET is_suspicious = true,
        suspicious_reason = COALESCE(suspicious_reason, $2),
        suspicious_at = COALESCE(suspicious_at, CURRENT_TIMESTAMP)
    WHERE (register_ip = $1 OR last_login_ip = $1)
      AND is_banned = false
      AND is_suspicious = false
    RETURNING id
    `,
    [ipAddress, reason]
  );

  for (const row of updateResult.rows) {
    await logSecurityEvent(clientOrPool, {
      userId: row.id,
      eventType: "AUTO_SUSPICIOUS_IP",
      reason,
      ipAddress,
    });
  }

  return { marked: updateResult.rowCount || 0, totalAccounts };
}


async function countRegisteredAccountsByIp(clientOrPool, ipAddress) {
  if (!ipAddress) {
    return 0;
  }

  await ensureSecuritySchema(clientOrPool);

  const result = await clientOrPool.query(
    `
    SELECT COUNT(*)::int AS total
    FROM users
    WHERE register_ip = $1
    `,
    [ipAddress]
  );

  return Number(result.rows[0]?.total || 0);
}

async function ensureIpCanRegister(clientOrPool, ipAddress) {
  if (!ipAddress) {
    return {
      ok: true,
      totalAccounts: 0,
      limit: MAX_REGISTER_ACCOUNTS_PER_IP,
    };
  }

  const totalAccounts = await countRegisteredAccountsByIp(clientOrPool, ipAddress);

  if (totalAccounts >= MAX_REGISTER_ACCOUNTS_PER_IP) {
    return {
      ok: false,
      totalAccounts,
      limit: MAX_REGISTER_ACCOUNTS_PER_IP,
      message: "No se puede completar el registro desde esta conexión. Intenta más tarde o contacta con soporte.",
    };
  }

  return {
    ok: true,
    totalAccounts,
    limit: MAX_REGISTER_ACCOUNTS_PER_IP,
  };
}

async function ensureWithdrawAllowedByRegisterIp(clientOrPool, userId) {
  await ensureSecuritySchema(clientOrPool);

  const userResult = await clientOrPool.query(
    `
    SELECT id, register_ip
    FROM users
    WHERE id = $1
    LIMIT 1
    `,
    [userId]
  );

  const user = userResult.rows[0];

  if (!user) {
    return {
      ok: false,
      statusCode: 404,
      totalAccounts: 0,
      limit: MULTIACCOUNT_WITHDRAW_IP_LIMIT,
      message: "Usuario no encontrado.",
    };
  }

  const registerIp = user.register_ip;

  if (!registerIp) {
    return {
      ok: true,
      totalAccounts: 0,
      limit: MULTIACCOUNT_WITHDRAW_IP_LIMIT,
      registerIp: null,
    };
  }

  const totalAccounts = await countRegisteredAccountsByIp(clientOrPool, registerIp);

  if (totalAccounts >= MULTIACCOUNT_WITHDRAW_IP_LIMIT) {
    const reason = `Retiro bloqueado internamente: ${totalAccounts} cuentas registradas con la misma IP. Límite: ${MULTIACCOUNT_WITHDRAW_IP_LIMIT}.`;

    await logSecurityEvent(clientOrPool, {
      userId,
      eventType: "WITHDRAW_BLOCKED_MULTIACCOUNT_IP",
      reason,
      ipAddress: registerIp,
    });

    return {
      ok: false,
      statusCode: 400,
      totalAccounts,
      limit: MULTIACCOUNT_WITHDRAW_IP_LIMIT,
      registerIp,
      message: "No se pudo procesar la solicitud de retiro en este momento.",
    };
  }

  return {
    ok: true,
    totalAccounts,
    limit: MULTIACCOUNT_WITHDRAW_IP_LIMIT,
    registerIp,
  };
}

async function getUserSecurityStatus(clientOrPool, userId) {
  await ensureSecuritySchema(clientOrPool);
  const result = await clientOrPool.query(
    `
    SELECT id, email, is_suspicious, suspicious_reason, is_banned, banned_reason, banned_at
    FROM users
    WHERE id = $1
    LIMIT 1
    `,
    [userId]
  );
  return result.rows[0] || null;
}

async function ensureNotBanned(clientOrPool, userId, actionLabel = "realizar esta acción") {
  const status = await getUserSecurityStatus(clientOrPool, userId);

  if (!status) {
    return { ok: false, statusCode: 404, message: "Usuario no encontrado." };
  }

  if (status.is_banned) {
    return {
      ok: false,
      statusCode: 403,
      message: `Tu cuenta se encuentra restringida temporalmente. No puedes ${actionLabel}. Contacta con soporte.`,
      userSecurity: {
        isBanned: true,
        bannedReason: status.banned_reason || null,
      },
    };
  }

  return {
    ok: true,
    userSecurity: {
      isSuspicious: Boolean(status.is_suspicious),
      suspiciousReason: status.suspicious_reason || null,
      isBanned: false,
    },
  };
}

module.exports = {
  SUSPICIOUS_IP_THRESHOLD,
  REVIEW_IP_THRESHOLD,
  MAX_REGISTER_ACCOUNTS_PER_IP,
  MULTIACCOUNT_WITHDRAW_IP_LIMIT,
  getClientIp,
  ensureSecuritySchema,
  logSecurityEvent,
  captureRegisterIp,
  captureLoginIp,
  autoMarkSuspiciousByIp,
  countRegisteredAccountsByIp,
  ensureIpCanRegister,
  ensureWithdrawAllowedByRegisterIp,
  getUserSecurityStatus,
  ensureNotBanned,
};

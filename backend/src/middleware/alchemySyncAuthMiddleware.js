const jwt = require("jsonwebtoken");
const pool = require("../config/db");

function getBearerToken(req) {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) return null;
  return authHeader.split(" ")[1];
}

function getProvidedSyncSecret(req) {
  return String(
    req.headers["x-sync-secret"] ||
      req.headers["x-alchemy-sync-secret"] ||
      req.query.sync_secret ||
      req.query.secret ||
      ""
  ).trim();
}

function getExpectedSyncSecrets() {
  return [
    process.env.ALCHEMY_SYNC_SECRET,
    process.env.ADMIN_SYNC_SECRET,
    process.env.ALCHEMY_NOTIFY_AUTH_TOKEN,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
}

async function validateAdminToken(req) {
  const token = getBearerToken(req);
  if (!token) return { ok: false, reason: "missing_bearer" };

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.userId || decoded.id;

    if (!userId) return { ok: false, reason: "invalid_payload" };

    const result = await pool.query(
      `
      SELECT id, is_admin
      FROM users
      WHERE id = $1
      LIMIT 1
      `,
      [userId]
    );

    if (result.rows.length === 0) return { ok: false, reason: "user_not_found" };
    if (!result.rows[0].is_admin) return { ok: false, reason: "not_admin" };

    req.user = decoded;
    return { ok: true, method: "admin_jwt" };
  } catch (error) {
    return { ok: false, reason: "jwt_invalid" };
  }
}

async function alchemySyncAuthMiddleware(req, res, next) {
  try {
    const providedSecret = getProvidedSyncSecret(req);
    const expectedSecrets = getExpectedSyncSecrets();

    if (providedSecret && expectedSecrets.includes(providedSecret)) {
      req.syncAuth = { method: "sync_secret" };
      return next();
    }

    const adminCheck = await validateAdminToken(req);
    if (adminCheck.ok) {
      req.syncAuth = { method: "admin_jwt" };
      return next();
    }

    return res.status(401).json({
      ok: false,
      message:
        "No autorizado. Envía un Bearer token admin o el header x-sync-secret configurado en ALCHEMY_SYNC_SECRET.",
    });
  } catch (error) {
    console.error("ALCHEMY SYNC AUTH ERROR:", error);
    return res.status(500).json({ ok: false, message: "Error validando autorización de sincronización." });
  }
}

module.exports = alchemySyncAuthMiddleware;

const { getHashRewardsStatus, redeemHashPoint } = require("../services/hashRewardsService");
const pool = require("../config/db");
const { ensureNotBanned, logSecurityEvent } = require("../services/securityService");

function getAuthUserId(req) {
  return req.user?.userId || req.user?.id;
}

async function getStatus(req, res) {
  try {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ message: "No autorizado." });

    const status = await getHashRewardsStatus(userId);
    return res.json(status);
  } catch (error) {
    console.error("HASH REWARDS STATUS ERROR:", error);
    return res.status(500).json({
      message: "Error al cargar premios de hash.",
      detail: error.message,
    });
  }
}

async function syncStatus(req, res) {
  try {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ message: "No autorizado." });

    const restriction = await ensureNotBanned(pool, userId, "actualizar premios de hash");
    if (!restriction.ok) {
      await logSecurityEvent(pool, { userId, eventType: "HASH_REWARD_SYNC_BLOCKED_BANNED", reason: restriction.message });
      return res.status(restriction.statusCode || 403).json({ message: restriction.message, userSecurity: restriction.userSecurity });
    }

    const status = await getHashRewardsStatus(userId);
    return res.json({
      message: status.addedPoints > 0
        ? `Se agregaron ${status.addedPoints} puntos hash nuevos.`
        : "No hay nuevos invitados válidos por agregar.",
      status,
    });
  } catch (error) {
    console.error("HASH REWARDS SYNC ERROR:", error);
    return res.status(500).json({
      message: "Error al actualizar puntos hash.",
      detail: error.message,
    });
  }
}

async function redeem(req, res) {
  try {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ message: "No autorizado." });

    const restriction = await ensureNotBanned(pool, userId, "canjear premios de hash");
    if (!restriction.ok) {
      await logSecurityEvent(pool, { userId, eventType: "HASH_REWARD_REDEEM_BLOCKED_BANNED", reason: restriction.message });
      return res.status(restriction.statusCode || 403).json({ message: restriction.message, userSecurity: restriction.userSecurity });
    }

    const result = await redeemHashPoint(userId);

    if (!result.ok) {
      return res.status(400).json(result);
    }

    return res.json(result);
  } catch (error) {
    console.error("HASH REWARDS REDEEM ERROR:", error);
    return res.status(500).json({
      message: "Error al canjear punto hash.",
      detail: error.message,
    });
  }
}

module.exports = { getStatus, syncStatus, redeem };

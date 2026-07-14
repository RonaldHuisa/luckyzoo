const pool = require("../config/db");
const { getTeamDashboard } = require("../services/referralTeamService");

function getBaseFrontendUrl() {
  return process.env.FRONTEND_URL || "http://localhost:3000";
}

async function getPromotionDashboard(req, res) {
  const userId = req.user.userId;
  try {
    const dashboard = await getTeamDashboard(pool, userId, getBaseFrontendUrl());
    return res.json(dashboard);
  } catch (error) {
    console.error("GET TEAM DASHBOARD ERROR:", error);
    return res.status(500).json({ message: "Error al obtener datos de equipo.", detail: error.message });
  }
}

async function getMembersByLevel(req, res) {
  const userId = req.user.userId;
  const level = Number(req.params.level || 1);
  if (level !== 1) return res.status(400).json({ message: "Solo existe el nivel 1 de referidos directos." });
  try {
    const dashboard = await getTeamDashboard(pool, userId, getBaseFrontendUrl());
    return res.json({ level: 1, members: dashboard.members });
  } catch (error) {
    console.error("GET DIRECT MEMBERS ERROR:", error);
    return res.status(500).json({ message: "Error al obtener referidos directos.", detail: error.message });
  }
}

async function getReferralRewardsStatus(req, res) {
  const userId = req.user.userId;
  try {
    const dashboard = await getTeamDashboard(pool, userId, getBaseFrontendUrl());
    return res.json({
      directInvites: dashboard.totalDirectReferrals,
      inviteBonusCoins: dashboard.inviteBonusCoins,
      tiers: [
        {
          id: "invite_bonus",
          requiredInvites: 1,
          rewardCoins: 200,
          title: "Bono por referido válido",
          isAutomatic: true,
          message: "Se acredita automáticamente una vez por cada referido directo válido.",
        },
      ],
    });
  } catch (error) {
    return res.status(500).json({ message: "Error al obtener recompensas de equipo.", detail: error.message });
  }
}

async function claimReferralReward(req, res) {
  return res.status(400).json({ message: "El bono por invitación válida se acredita automáticamente y una sola vez." });
}

module.exports = { getPromotionDashboard, getMembersByLevel, getReferralRewardsStatus, claimReferralReward };

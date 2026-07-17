const pool = require("../config/db");
const { assertNoPlanRewardBalanceCap, isNoPlanBalanceCapError } = require("../services/noPlanBalanceCapService");

function maskEmail(email) {
  if (!email || !email.includes("@")) return "********";
  const [name, domain] = email.split("@");
  return `${name.slice(0, 2)}${"*".repeat(6)}@${domain}`;
}
function getBaseFrontendUrl() { return process.env.FRONTEND_URL || "http://localhost:3000"; }

async function getPromotionDashboard(req, res) {
  const userId = req.user.userId;
  try {
    const userResult = await pool.query(`SELECT id,email,referral_code FROM users WHERE id=$1`, [userId]);
    if (!userResult.rows.length) return res.status(404).json({ message: "Usuario no encontrado." });
    const user = userResult.rows[0];

    const teamResult = await pool.query(
      `
      WITH RECURSIVE team AS (
        SELECT u.id,u.email,u.created_at,1 AS level FROM users u WHERE u.referred_by_id=$1
        UNION ALL
        SELECT child.id,child.email,child.created_at,team.level+1 AS level
        FROM users child JOIN team ON child.referred_by_id=team.id WHERE team.level < 3
      ), team_amounts AS (
        SELECT team.id, team.level, team.created_at,
          GREATEST(
            COALESCE((SELECT SUM(vp.price_usdt) FROM vip_purchases vp WHERE vp.user_id=team.id AND vp.level >= 1 AND vp.status IN ('active','expired','completed')),0),
            COALESCE((SELECT SUM(d.amount_usdt) FROM deposits d WHERE d.user_id=team.id AND d.status IN ('confirmed','completed','success')),0),
            COALESCE((SELECT SUM(al.amount_usdt) FROM account_ledger al WHERE al.user_id=team.id AND al.direction='credit' AND al.balance_type IN ('investment','recharge') AND al.type IN ('manual_recharge','manual_investment','deposit','deposit_confirmed')),0)
          ) AS recharge_amount,
          COALESCE((SELECT SUM(w.amount_requested) FROM withdrawals w WHERE w.user_id=team.id AND w.status IN ('pending','approved','paid','completed')),0) AS withdrawal_amount
        FROM team
      )
      SELECT level, COUNT(*) AS total_members, COUNT(*) FILTER (WHERE recharge_amount >= 5) AS active_members,
             COALESCE(SUM(recharge_amount),0) AS team_recharge, COALESCE(SUM(withdrawal_amount),0) AS team_withdrawals
      FROM team_amounts GROUP BY level ORDER BY level
      `,
      [userId]
    );

    const commissionsResult = await pool.query(
      `SELECT level, COALESCE(SUM(amount_usdt),0) AS total_commission, COALESCE(SUM(amount_usdt) FILTER (WHERE created_at::date=CURRENT_DATE),0) AS today_commission FROM referral_commissions WHERE receiver_user_id=$1 GROUP BY level ORDER BY level`,
      [userId]
    );
    const totalIncomeResult = await pool.query(
      `SELECT COALESCE(SUM(amount_usdt),0) AS total_income, COALESCE(SUM(amount_usdt) FILTER (WHERE created_at::date=CURRENT_DATE),0) AS today_income FROM referral_commissions WHERE receiver_user_id=$1`,
      [userId]
    );
    const todayAddedResult = await pool.query(`SELECT COUNT(*)::int AS today_added FROM users WHERE referred_by_id=$1 AND created_at::date=CURRENT_DATE`, [userId]);

    const levels = [1,2,3].map((level) => {
      const team = teamResult.rows.find((x) => Number(x.level) === level) || {};
      const commission = commissionsResult.rows.find((x) => Number(x.level) === level) || {};
      return {
        level,
        totalMembers: Number(team.total_members || 0),
        activeMembers: Number(team.active_members || 0),
        teamRecharge: Number(team.team_recharge || 0),
        teamWithdrawals: Number(team.team_withdrawals || 0),
        totalCommission: Number(commission.total_commission || 0),
        todayCommission: Number(commission.today_commission || 0),
      };
    });
    return res.json({
      referralCode: user.referral_code,
      referralLink: `${getBaseFrontendUrl()}/register?ref=${user.referral_code}`,
      totalIncome: totalIncomeResult.rows[0]?.total_income || "0",
      todayIncome: totalIncomeResult.rows[0]?.today_income || "0",
      todayAdded: Number(todayAddedResult.rows[0]?.today_added || 0),
      totalMembers: levels.reduce((sum, x) => sum + x.totalMembers, 0),
      totalTeamRecharge: levels.reduce((sum, x) => sum + x.teamRecharge, 0),
      totalTeamWithdrawals: levels.reduce((sum, x) => sum + x.teamWithdrawals, 0),
      levels,
    });
  } catch (error) {
    console.error("GET ROYAL TEAM DASHBOARD ERROR:", error);
    return res.status(500).json({ message: "Error al obtener datos de equipo.", detail: error.message });
  }
}

async function getMembersByLevel(req, res) {
  const userId = req.user.userId;
  const level = Number(req.params.level);
  if (![1,2,3].includes(level)) return res.status(400).json({ message: "Nivel inválido." });
  try {
    const result = await pool.query(
      `
      WITH RECURSIVE team AS (
        SELECT u.id,u.email,u.created_at,1 AS level FROM users u WHERE u.referred_by_id=$1
        UNION ALL
        SELECT child.id,child.email,child.created_at,team.level+1 AS level FROM users child JOIN team ON child.referred_by_id=team.id WHERE team.level < 3
      )
      SELECT team.id,team.email,team.created_at,
        (SELECT COUNT(*) FROM users direct WHERE direct.referred_by_id=team.id) AS direct_subordinates,
        COALESCE((SELECT SUM(vp.price_usdt) FROM vip_purchases vp WHERE vp.user_id=team.id AND vp.level >= 1 AND vp.status IN ('active','expired','completed')),0) AS invested_amount
      FROM team WHERE team.level=$2 ORDER BY team.created_at DESC
      `,
      [userId, level]
    );
    return res.json({ level, members: result.rows.map((x) => ({ id: x.id, email: maskEmail(x.email), directSubordinates: Number(x.direct_subordinates || 0), investedAmount: Number(x.invested_amount || 0), isActive: Number(x.invested_amount || 0) >= 5, registeredAt: x.created_at })) });
  } catch (error) {
    console.error("GET MEMBERS BY LEVEL ERROR:", error);
    return res.status(500).json({ message: "Error al obtener lista de miembros.", detail: error.message });
  }
}

async function ensureReferralRewardTables(clientOrPool = pool) {
  await clientOrPool.query(`CREATE TABLE IF NOT EXISTS referral_reward_tiers(id SERIAL PRIMARY KEY, required_invites INTEGER NOT NULL UNIQUE, reward_usdt NUMERIC(38,18) NOT NULL, title VARCHAR(120) NOT NULL, is_active BOOLEAN DEFAULT TRUE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
  await clientOrPool.query(`CREATE TABLE IF NOT EXISTS user_referral_rewards(id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, tier_id INTEGER NOT NULL REFERENCES referral_reward_tiers(id), reward_usdt NUMERIC(38,18) NOT NULL, status VARCHAR(30) DEFAULT 'claimed', claimed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id, tier_id))`);
  await clientOrPool.query(`INSERT INTO referral_reward_tiers(required_invites,reward_usdt,title) VALUES (3,0.5,'Primer avance'),(8,1,'Equipo activo'),(13,1,'Crecimiento Royal') ON CONFLICT (required_invites) DO NOTHING`);
}
async function getReferralRewardsStatus(req, res) {
  const userId = req.user.userId;
  try {
    await ensureReferralRewardTables(pool);
    const direct = await pool.query(`SELECT COUNT(*)::int AS total FROM users WHERE referred_by_id=$1`, [userId]);
    const tiers = await pool.query(`SELECT t.*, r.id AS claim_id FROM referral_reward_tiers t LEFT JOIN user_referral_rewards r ON r.tier_id=t.id AND r.user_id=$1 WHERE t.is_active=true ORDER BY t.required_invites ASC`, [userId]);
    return res.json({ directInvites: direct.rows[0].total, tiers: tiers.rows.map((t) => ({ id: t.id, requiredInvites: t.required_invites, rewardUsdt: t.reward_usdt, title: t.title, isClaimed: Boolean(t.claim_id), canClaim: direct.rows[0].total >= t.required_invites && !t.claim_id })) });
  } catch (error) { return res.status(500).json({ message: "Error al obtener recompensas de equipo.", detail: error.message }); }
}
async function claimReferralReward(req, res) {
  const userId = req.user.userId;
  const tierId = Number(req.body?.tierId);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await ensureReferralRewardTables(client);
    const direct = await client.query(`SELECT COUNT(*)::int AS total FROM users WHERE referred_by_id=$1`, [userId]);
    const tier = await client.query(`SELECT * FROM referral_reward_tiers WHERE id=$1 AND is_active=true`, [tierId]);
    if (!tier.rows.length) { await client.query("ROLLBACK"); return res.status(404).json({ message: "Recompensa no encontrada." }); }
    const t = tier.rows[0];
    if (Number(direct.rows[0].total) < Number(t.required_invites)) { await client.query("ROLLBACK"); return res.status(400).json({ message: "Todavía no cumples el requisito." }); }
    const requestedRewardUsdt = Number(t.reward_usdt || 0);
    const capResult = await assertNoPlanRewardBalanceCap(client, {
      userId,
      balanceType: "withdrawable",
      amount: requestedRewardUsdt,
    });
    const creditedRewardUsdt = Number(capResult.creditedAmount || requestedRewardUsdt);
    const claim = await client.query(`INSERT INTO user_referral_rewards(user_id,tier_id,reward_usdt) VALUES ($1,$2,$3) ON CONFLICT (user_id,tier_id) DO NOTHING RETURNING id`, [userId, t.id, creditedRewardUsdt]);
    if (!claim.rows.length) { await client.query("ROLLBACK"); return res.status(409).json({ message: "Esta recompensa ya fue reclamada." }); }
    await client.query(`UPDATE users SET withdrawable_usdt=COALESCE(withdrawable_usdt,0)+$1, earnings_balance_usdt=COALESCE(earnings_balance_usdt,0)+$1 WHERE id=$2`, [creditedRewardUsdt, userId]);
    await client.query("COMMIT");
    return res.json({ message: capResult.message || "Recompensa de equipo acreditada.", rewardUsdt: creditedRewardUsdt, requestedRewardUsdt, partialCredit: Boolean(capResult.partial) });
  } catch (error) {
    await client.query("ROLLBACK").catch(()=>{});
    if (isNoPlanBalanceCapError(error)) {
      return res.status(400).json({ message: error.message, code: error.code });
    }
    return res.status(500).json({ message: "Error al reclamar recompensa.", detail: error.message });
  }
  finally { client.release(); }
}

module.exports = { getPromotionDashboard, getMembersByLevel, getReferralRewardsStatus, claimReferralReward };

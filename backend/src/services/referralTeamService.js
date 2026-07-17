const { COINS_PER_USDT, getVipLevelConfig, ensureRouletteSchema } = require("./rouletteService");

const INVITE_BONUS_COINS = 200;
const INVITE_BONUS_SPINS = 2;

async function ensureReferralTeamSchema(client) {
  await ensureRouletteSchema(client);
  await client.query(`
    CREATE TABLE IF NOT EXISTS referral_invite_bonuses (
      id SERIAL PRIMARY KEY,
      sponsor_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      referred_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      coin_amount NUMERIC(38,0) NOT NULL DEFAULT 200,
      status VARCHAR(30) NOT NULL DEFAULT 'credited',
      created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      metadata JSONB DEFAULT '{}'::jsonb,
      UNIQUE(referred_user_id)
    )
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_referral_invite_bonuses_sponsor ON referral_invite_bonuses(sponsor_user_id, created_at DESC)`);

  await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS invite_bonus_spins_remaining INTEGER DEFAULT 0 NOT NULL`);
  await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS invite_bonus_spins_total INTEGER DEFAULT 0 NOT NULL`);
  await client.query(`ALTER TABLE referral_invite_bonuses ADD COLUMN IF NOT EXISTS spin_bonus_amount INTEGER DEFAULT 2 NOT NULL`);


  await client.query(`
    CREATE TABLE IF NOT EXISTS referral_withdrawal_commissions (
      id SERIAL PRIMARY KEY,
      sponsor_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      referred_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      withdrawal_id INTEGER NOT NULL REFERENCES withdrawals(id) ON DELETE CASCADE,
      withdrawal_amount_usdt NUMERIC(38,18) NOT NULL DEFAULT 0,
      commission_percentage NUMERIC(8,4) NOT NULL DEFAULT 5,
      commission_amount_usdt NUMERIC(38,18) NOT NULL DEFAULT 0,
      commission_amount_coins NUMERIC(38,0) NOT NULL DEFAULT 0,
      sponsor_vip_level INTEGER NOT NULL DEFAULT 0,
      sponsor_vip_id INTEGER REFERENCES vip_purchases(id) ON DELETE SET NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'paid',
      created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      paid_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      metadata JSONB DEFAULT '{}'::jsonb,
      UNIQUE(withdrawal_id)
    )
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_ref_w_comm_sponsor ON referral_withdrawal_commissions(sponsor_user_id, created_at DESC)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_ref_w_comm_referred ON referral_withdrawal_commissions(referred_user_id, created_at DESC)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_ref_w_comm_status ON referral_withdrawal_commissions(status, created_at DESC)`);
}

async function awardInviteBonus(client, sponsorUserId, referredUserId) {
  if (!sponsorUserId || !referredUserId || Number(sponsorUserId) === Number(referredUserId)) return null;
  await ensureReferralTeamSchema(client);
  const result = await client.query(
    `INSERT INTO referral_invite_bonuses(sponsor_user_id,referred_user_id,coin_amount,spin_bonus_amount,metadata)
     VALUES ($1,$2,$3,$4,$5::jsonb)
     ON CONFLICT (referred_user_id) DO NOTHING
     RETURNING *`,
    [sponsorUserId, referredUserId, INVITE_BONUS_COINS, INVITE_BONUS_SPINS, JSON.stringify({ validation: "registered_successfully", spins: INVITE_BONUS_SPINS })]
  );
  if (!result.rows.length) return null;
  await client.query(
    `UPDATE users
     SET roulette_coins=COALESCE(roulette_coins,0)+$1,
         invite_bonus_spins_remaining=COALESCE(invite_bonus_spins_remaining,0)+$2,
         invite_bonus_spins_total=COALESCE(invite_bonus_spins_total,0)+$2
     WHERE id=$3`,
    [INVITE_BONUS_COINS, INVITE_BONUS_SPINS, sponsorUserId]
  );
  await client.query(
    `INSERT INTO account_ledger(user_id,balance_type,direction,type,title,amount_usdt,description,reference_type,reference_id,metadata,status)
     VALUES ($1,'roulette_coins','credit','referral_invite_bonus','Bono por invitación',0,$2,'referral_invite_bonus',$3,$4::jsonb,'completed')`,
    [sponsorUserId, `Bono por invitación válida: ${INVITE_BONUS_COINS} monedas y ${INVITE_BONUS_SPINS} giros extra.`, result.rows[0].id, JSON.stringify({ referredUserId, coins: INVITE_BONUS_COINS, spins: INVITE_BONUS_SPINS })]
  );
  return result.rows[0];
}

async function getSponsorVipForCommission(client, sponsorUserId) {
  const result = await client.query(
    `SELECT id, level, referral_commission_percent
     FROM vip_purchases
     WHERE user_id=$1 AND status='active' AND expires_at > NOW() AND level BETWEEN 1 AND 5
     ORDER BY level DESC, expires_at DESC
     LIMIT 1`,
    [sponsorUserId]
  );
  if (!result.rows.length) {
    const free = getVipLevelConfig(0);
    return { vipId: null, level: 0, percent: free.referralCommissionPercent || 5 };
  }
  const row = result.rows[0];
  const fallback = getVipLevelConfig(row.level);
  return { vipId: row.id, level: Number(row.level || 0), percent: Number(row.referral_commission_percent || fallback.referralCommissionPercent || 5) };
}

async function awardWithdrawalReferralCommission(client, withdrawal) {
  await ensureReferralTeamSchema(client);
  const withdrawalId = Number(withdrawal?.id || 0);
  if (!withdrawalId) return null;
  const withdrawalUserId = Number(withdrawal.user_id || withdrawal.userId || 0);
  const amount = Number(withdrawal.amount_to_receive || withdrawal.final_amount || withdrawal.amount_requested || 0);
  if (!withdrawalUserId || amount <= 0) return null;

  const sponsorResult = await client.query(`SELECT referred_by_id FROM users WHERE id=$1`, [withdrawalUserId]);
  const sponsorUserId = sponsorResult.rows[0]?.referred_by_id;
  if (!sponsorUserId || Number(sponsorUserId) === withdrawalUserId) return null;

  const sponsorVip = await getSponsorVipForCommission(client, sponsorUserId);
  const commissionUsdt = Number(((amount * Number(sponsorVip.percent || 0)) / 100).toFixed(8));
  const commissionCoins = Math.floor(commissionUsdt * COINS_PER_USDT);
  if (commissionCoins <= 0) return null;

  const result = await client.query(
    `INSERT INTO referral_withdrawal_commissions(sponsor_user_id,referred_user_id,withdrawal_id,withdrawal_amount_usdt,commission_percentage,commission_amount_usdt,commission_amount_coins,sponsor_vip_level,sponsor_vip_id,status,paid_at,metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'paid',NOW(),$10::jsonb)
     ON CONFLICT (withdrawal_id) DO NOTHING
     RETURNING *`,
    [sponsorUserId, withdrawalUserId, withdrawalId, amount, sponsorVip.percent, commissionUsdt, commissionCoins, sponsorVip.level, sponsorVip.vipId, JSON.stringify({ source: "withdrawal_paid", platform_pays_commission: true })]
  );
  if (!result.rows.length) return null;

  await client.query(`UPDATE users SET roulette_coins=COALESCE(roulette_coins,0)+$1 WHERE id=$2`, [commissionCoins, sponsorUserId]);
  await client.query(
    `INSERT INTO account_ledger(user_id,balance_type,direction,type,title,amount_usdt,description,reference_type,reference_id,metadata,status)
     VALUES ($1,'roulette_coins','credit','referral_withdrawal_commission','Comisión por retiro de referido directo',0,$2,'referral_withdrawal_commission',$3,$4::jsonb,'completed')`,
    [sponsorUserId, `Comisión por retiro de referido directo: ${commissionCoins} monedas.`, result.rows[0].id, JSON.stringify({ withdrawalId, referredUserId: withdrawalUserId, commissionUsdt, commissionCoins, percent: sponsorVip.percent })]
  );
  return result.rows[0];
}

async function getTeamDashboard(poolOrClient, userId, baseUrl) {
  await ensureReferralTeamSchema(poolOrClient);
  const userResult = await poolOrClient.query(`SELECT id,email,referral_code,COALESCE(invite_bonus_spins_remaining,0) AS invite_bonus_spins_remaining,COALESCE(invite_bonus_spins_total,0) AS invite_bonus_spins_total FROM users WHERE id=$1`, [userId]);
  const user = userResult.rows[0];

  const activeVip = await getSponsorVipForCommission(poolOrClient, userId);
  const summary = await poolOrClient.query(
    `SELECT
      (SELECT COUNT(*)::int FROM users WHERE referred_by_id=$1) AS total_direct,
      COALESCE((SELECT SUM(coin_amount) FROM referral_invite_bonuses WHERE sponsor_user_id=$1),0) AS invite_coins,
      COALESCE((SELECT SUM(spin_bonus_amount) FROM referral_invite_bonuses WHERE sponsor_user_id=$1),0) AS invite_spins_awarded,
      COALESCE((SELECT SUM(commission_amount_coins) FROM referral_withdrawal_commissions WHERE sponsor_user_id=$1 AND status='paid'),0) AS withdrawal_commission_coins,
      COALESCE((SELECT SUM(commission_amount_usdt) FROM referral_withdrawal_commissions WHERE sponsor_user_id=$1 AND status='paid'),0) AS withdrawal_commission_usdt
    `,
    [userId]
  );

  const members = await poolOrClient.query(
    `SELECT
       u.id,
       u.email,
       u.created_at,
       COALESCE(active_vip.level,0) AS vip_level,
       active_vip.status AS vip_status,
       active_vip.expires_at AS vip_expires_at,
       COALESCE(w.total_withdrawn,0) AS total_withdrawn,
       COALESCE(c.total_commission_coins,0) AS total_commission_coins,
       COALESCE(c.total_commission_usdt,0) AS total_commission_usdt,
       c.last_commission_at,
       CASE WHEN ib.id IS NULL THEN false ELSE true END AS is_valid_referral
     FROM users u
     LEFT JOIN LATERAL (
       SELECT level,status,expires_at FROM vip_purchases vp
       WHERE vp.user_id=u.id AND vp.status='active' AND vp.expires_at > NOW()
       ORDER BY level DESC, expires_at DESC LIMIT 1
     ) active_vip ON true
     LEFT JOIN LATERAL (
       SELECT COALESCE(SUM(amount_to_receive),0) AS total_withdrawn FROM withdrawals w
       WHERE w.user_id=u.id AND w.status='paid'
     ) w ON true
     LEFT JOIN LATERAL (
       SELECT COALESCE(SUM(commission_amount_coins),0) AS total_commission_coins,
              COALESCE(SUM(commission_amount_usdt),0) AS total_commission_usdt,
              MAX(created_at) AS last_commission_at
       FROM referral_withdrawal_commissions rwc
       WHERE rwc.sponsor_user_id=$1 AND rwc.referred_user_id=u.id AND rwc.status='paid'
     ) c ON true
     LEFT JOIN referral_invite_bonuses ib ON ib.sponsor_user_id=$1 AND ib.referred_user_id=u.id
     WHERE u.referred_by_id=$1
     ORDER BY u.created_at DESC`,
    [userId]
  );

  const row = summary.rows[0] || {};
  const inviteCoins = Number(row.invite_coins || 0);
  const withdrawalCoins = Number(row.withdrawal_commission_coins || 0);
  const totalCoins = inviteCoins + withdrawalCoins;
  return {
    referralCode: user?.referral_code || "",
    referralLink: `${baseUrl}/register?ref=${user?.referral_code || ""}`,
    activeVipLevel: activeVip.level,
    currentCommissionPercent: activeVip.percent,
    totalDirectReferrals: Number(row.total_direct || 0),
    inviteBonusCoins: inviteCoins,
    inviteBonusSpinsAwarded: Number(row.invite_spins_awarded || 0),
    inviteBonusSpinsRemaining: Number(user?.invite_bonus_spins_remaining || 0),
    inviteBonusSpinsTotal: Number(user?.invite_bonus_spins_total || 0),
    withdrawalCommissionCoins: withdrawalCoins,
    totalTeamCoins: totalCoins,
    totalTeamUsdtEquivalent: Number((totalCoins / COINS_PER_USDT).toFixed(8)),
    withdrawalCommissionUsdt: Number(row.withdrawal_commission_usdt || 0),
    commissionTable: [0,1,2,3,4,5].map((level) => ({ level, percent: getVipLevelConfig(level).referralCommissionPercent })),
    members: members.rows.map((m) => ({
      id: m.id,
      email: m.email,
      registeredAt: m.created_at,
      vipLevel: Number(m.vip_level || 0),
      vipStatus: m.vip_status || "sin_vip",
      vipExpiresAt: m.vip_expires_at,
      totalWithdrawn: Number(m.total_withdrawn || 0),
      totalCommissionCoins: Number(m.total_commission_coins || 0),
      totalCommissionUsdt: Number(m.total_commission_usdt || 0),
      lastCommissionAt: m.last_commission_at,
      isValidReferral: Boolean(m.is_valid_referral),
    })),
  };
}

module.exports = {
  INVITE_BONUS_COINS,
  INVITE_BONUS_SPINS,
  ensureReferralTeamSchema,
  awardInviteBonus,
  awardWithdrawalReferralCommission,
  getTeamDashboard,
  getSponsorVipForCommission,
};

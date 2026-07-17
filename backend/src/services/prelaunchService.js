const pool = require("../config/db");
const { assertNoPlanRewardBalanceCap, isNoPlanBalanceCapError } = require("./noPlanBalanceCapService");

const DEFAULT_CONFIG = {
  isActive: true,
  cutoffDate: "2026-07-07",
  maxCheckinDays: 5,
  checkinRewardUsdt: 1,
  inviteRewardUsdt: 1,
  tiktokRewardUsdt: 4,
  maxBonusUsdt: 10,
  blockFinancialActions: false,
};

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function getPeruDateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function parseDateOnly(value) {
  return new Date(`${String(value).slice(0, 10)}T00:00:00Z`);
}

function diffDays(startDateString, endDateString) {
  const start = parseDateOnly(startDateString);
  const end = parseDateOnly(endDateString);
  return Math.floor((end.getTime() - start.getTime()) / 86400000);
}

function mapConfig(row = {}) {
  return {
    isActive: row.is_active ?? DEFAULT_CONFIG.isActive,
    cutoffDate: row.cutoff_date ? String(row.cutoff_date).slice(0, 10) : DEFAULT_CONFIG.cutoffDate,
    maxCheckinDays: Number(row.max_checkin_days || DEFAULT_CONFIG.maxCheckinDays),
    checkinRewardUsdt: toNumber(row.checkin_reward_usdt, DEFAULT_CONFIG.checkinRewardUsdt),
    inviteRewardUsdt: toNumber(row.invite_reward_usdt, DEFAULT_CONFIG.inviteRewardUsdt),
    tiktokRewardUsdt: toNumber(row.tiktok_reward_usdt, DEFAULT_CONFIG.tiktokRewardUsdt),
    maxBonusUsdt: toNumber(row.max_bonus_usdt, DEFAULT_CONFIG.maxBonusUsdt),
    blockFinancialActions: row.block_financial_actions ?? DEFAULT_CONFIG.blockFinancialActions,
  };
}

async function ensurePrelaunchSchema(clientOrPool = pool) {
  await clientOrPool.query(`
    CREATE TABLE IF NOT EXISTS prelaunch_config (
      id INTEGER PRIMARY KEY DEFAULT 1,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      cutoff_date DATE NOT NULL DEFAULT DATE '2026-07-07',
      max_checkin_days INTEGER NOT NULL DEFAULT 5,
      checkin_reward_usdt NUMERIC(38,18) NOT NULL DEFAULT 1,
      invite_reward_usdt NUMERIC(38,18) NOT NULL DEFAULT 1,
      tiktok_reward_usdt NUMERIC(38,18) NOT NULL DEFAULT 4,
      max_bonus_usdt NUMERIC(38,18) NOT NULL DEFAULT 10,
      block_financial_actions BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await clientOrPool.query(`
    INSERT INTO prelaunch_config(id)
    VALUES (1)
    ON CONFLICT (id) DO NOTHING
  `);

  await clientOrPool.query(`
    UPDATE prelaunch_config
    SET
      is_active = TRUE,
      cutoff_date = DATE '2026-07-07',
      max_checkin_days = 5,
      checkin_reward_usdt = 1,
      invite_reward_usdt = 1,
      tiktok_reward_usdt = 4,
      max_bonus_usdt = 10,
      block_financial_actions = FALSE,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = 1
  `);

  await clientOrPool.query(`
    UPDATE prelaunch_tiktok_submissions
    SET reward_usdt = 4, updated_at = CURRENT_TIMESTAMP
    WHERE status = 'pending' AND reward_usdt <> 4
  `).catch(() => {});

  await clientOrPool.query(`
    CREATE TABLE IF NOT EXISTS prelaunch_checkins (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      checkin_date DATE NOT NULL,
      day_number INTEGER NOT NULL,
      amount_usdt NUMERIC(38,18) NOT NULL DEFAULT 1,
      status VARCHAR(30) NOT NULL DEFAULT 'credited',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, checkin_date)
    )
  `);

  await clientOrPool.query(`
    CREATE TABLE IF NOT EXISTS prelaunch_referral_rewards (
      id SERIAL PRIMARY KEY,
      sponsor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      invited_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount_usdt NUMERIC(38,18) NOT NULL DEFAULT 1,
      status VARCHAR(30) NOT NULL DEFAULT 'credited',
      credited_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(sponsor_id),
      UNIQUE(invited_user_id)
    )
  `);

  await clientOrPool.query(`
    CREATE TABLE IF NOT EXISTS prelaunch_tiktok_submissions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tiktok_url TEXT NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'pending',
      reward_usdt NUMERIC(38,18) NOT NULL DEFAULT 4,
      admin_note TEXT,
      reviewed_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function getConfig(clientOrPool = pool) {
  await ensurePrelaunchSchema(clientOrPool);
  const result = await clientOrPool.query(`SELECT * FROM prelaunch_config WHERE id = 1 LIMIT 1`);
  return mapConfig(result.rows[0] || {});
}

async function creditRechargeBalance(client, { userId, amount, type, title, description, referenceType, referenceId, metadata = {} }) {
  const requestedAmount = toNumber(amount, 0);
  if (requestedAmount <= 0) return { requestedAmount: 0, creditedAmount: 0, partial: false, message: null };

  const capResult = await assertNoPlanRewardBalanceCap(client, {
    userId,
    balanceType: 'recharge',
    amount: requestedAmount,
  });
  const creditedAmount = Number(capResult.creditedAmount || requestedAmount);

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

  await client.query(
    `
    INSERT INTO account_ledger
      (user_id,balance_type,direction,type,title,amount_usdt,description,reference_type,reference_id,metadata,status)
    VALUES ($1,'recharge','credit',$2,$3,$4,$5,$6,$7,$8::jsonb,'completed')
    `,
    [
      userId,
      type,
      title,
      creditedAmount,
      description,
      referenceType,
      referenceId,
      JSON.stringify({ ...metadata, requestedAmountUsdt: requestedAmount, creditedAmountUsdt: creditedAmount, partialCredit: Boolean(capResult.partial) }),
    ]
  );

  return { ...capResult, requestedAmount, creditedAmount };
}

async function refreshReferralReward(client, userId, config) {
  const existing = await client.query(
    `SELECT * FROM prelaunch_referral_rewards WHERE sponsor_id = $1 LIMIT 1`,
    [userId]
  );
  if (existing.rows.length) return existing.rows[0];

  const invited = await client.query(
    `
    SELECT id, email
    FROM users
    WHERE referred_by_id = $1
      AND COALESCE(withdraw_enabled, false) = true
    ORDER BY created_at ASC
    LIMIT 1
    `,
    [userId]
  );

  if (!invited.rows.length) return null;

  const invitedUser = invited.rows[0];
  const reward = await client.query(
    `
    INSERT INTO prelaunch_referral_rewards(sponsor_id, invited_user_id, amount_usdt, status)
    VALUES ($1,$2,$3,'credited')
    ON CONFLICT (sponsor_id) DO NOTHING
    RETURNING *
    `,
    [userId, invitedUser.id, config.inviteRewardUsdt]
  );

  if (!reward.rows.length) {
    const retry = await client.query(`SELECT * FROM prelaunch_referral_rewards WHERE sponsor_id = $1 LIMIT 1`, [userId]);
    return retry.rows[0] || null;
  }

  let creditResult;
  try {
    creditResult = await creditRechargeBalance(client, {
      userId,
      amount: config.inviteRewardUsdt,
      type: "prelaunch_invite",
      title: "Bono pre-lanzamiento por invitación",
      description: "Bono por usuario invitado validado por gerente.",
      referenceType: "prelaunch_referral_reward",
      referenceId: reward.rows[0].id,
      metadata: { invitedUserId: invitedUser.id },
    });
  } catch (error) {
    if (!isNoPlanBalanceCapError(error)) throw error;
    await client.query(`UPDATE prelaunch_referral_rewards SET amount_usdt = 0 WHERE id = $1`, [reward.rows[0].id]);
    reward.rows[0].amount_usdt = 0;
    return reward.rows[0];
  }

  if (Number(creditResult.creditedAmount) !== Number(config.inviteRewardUsdt)) {
    await client.query(`UPDATE prelaunch_referral_rewards SET amount_usdt = $1 WHERE id = $2`, [creditResult.creditedAmount, reward.rows[0].id]);
    reward.rows[0].amount_usdt = creditResult.creditedAmount;
  }

  return reward.rows[0];
}

async function getPrelaunchStatus(userId, clientOrPool = pool, options = {}) {
  await ensurePrelaunchSchema(clientOrPool);
  const config = await getConfig(clientOrPool);
  const todayPeru = getPeruDateString();

  if (options.refreshReferral) {
    const client = clientOrPool;
    await refreshReferralReward(client, userId, config);
  }

  const userResult = await clientOrPool.query(
    `
    SELECT
      id,
      email,
      referral_code,
      referred_by_id,
      created_at,
      COALESCE(balance_usdt,0) AS balance_usdt,
      COALESCE(recharge_balance_usdt,0) AS recharge_balance_usdt,
      COALESCE(withdraw_enabled,false) AS withdraw_enabled
    FROM users
    WHERE id = $1
    LIMIT 1
    `,
    [userId]
  );

  const user = userResult.rows[0];
  if (!user) return null;

  const registrationPeru = getPeruDateString(new Date(user.created_at));
  const daysSinceRegistration = diffDays(registrationPeru, todayPeru);
  const eligibleByDate = registrationPeru < config.cutoffDate;
  const withinCheckinWindow = todayPeru <= config.cutoffDate;
  const canParticipate = Boolean(config.isActive && eligibleByDate);

  const [checkinsResult, referralRewardResult, tiktokResult, validInvitesResult] = await Promise.all([
    clientOrPool.query(
      `SELECT * FROM prelaunch_checkins WHERE user_id = $1 ORDER BY checkin_date ASC`,
      [userId]
    ),
    clientOrPool.query(
      `SELECT * FROM prelaunch_referral_rewards WHERE sponsor_id = $1 LIMIT 1`,
      [userId]
    ),
    clientOrPool.query(
      `SELECT * FROM prelaunch_tiktok_submissions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [userId]
    ),
    clientOrPool.query(
      `
      SELECT COUNT(*)::int AS total
      FROM users
      WHERE referred_by_id = $1
        AND COALESCE(withdraw_enabled, false) = true
      `,
      [userId]
    ),
  ]);

  const checkins = checkinsResult.rows;
  const doneDates = new Set(checkins.map((row) => String(row.checkin_date).slice(0, 10)));
  const todayDone = doneDates.has(todayPeru);
  const canCheckin = canParticipate && withinCheckinWindow && !todayDone && checkins.length < config.maxCheckinDays;

  const checkinEarned = checkins.reduce((sum, item) => sum + toNumber(item.amount_usdt, 0), 0);
  const referralReward = referralRewardResult.rows[0] || null;
  const referralEarned = referralReward ? toNumber(referralReward.amount_usdt, 0) : 0;
  const tiktok = tiktokResult.rows[0] || null;
  const tiktokEarned = tiktok?.status === "approved" ? toNumber(tiktok.reward_usdt, 0) : 0;
  const totalEarned = checkinEarned + referralEarned + tiktokEarned;

  return {
    config,
    user: {
      id: user.id,
      email: user.email,
      referralCode: user.referral_code,
      createdAt: user.created_at,
      registrationPeru,
      balanceUsdt: toNumber(user.balance_usdt, 0),
      rechargeBalanceUsdt: toNumber(user.recharge_balance_usdt, 0),
    },
    active: Boolean(config.isActive),
    canParticipate,
    eligibleByDate,
    withinCheckinWindow,
    daysSinceRegistration,
    todayPeru,
    financialActionsBlocked: Boolean(config.isActive && config.blockFinancialActions),
    checkin: {
      canCheckin,
      todayDone,
      completed: checkins.length,
      maxDays: config.maxCheckinDays,
      rewardUsdt: config.checkinRewardUsdt,
      earnedUsdt: checkinEarned,
      days: Array.from({ length: config.maxCheckinDays }, (_, index) => {
        const recorded = checkins[index];
        return {
          day: index + 1,
          date: recorded ? String(recorded.checkin_date).slice(0, 10) : null,
          done: Boolean(recorded),
          isToday: recorded ? String(recorded.checkin_date).slice(0, 10) === todayPeru : false,
        };
      }),
    },
    invite: {
      validInvites: Number(validInvitesResult.rows[0]?.total || 0),
      rewardUsdt: config.inviteRewardUsdt,
      earnedUsdt: referralEarned,
      credited: Boolean(referralReward),
      status: referralReward ? "credited" : "pending",
    },
    tiktok: {
      rewardUsdt: config.tiktokRewardUsdt,
      earnedUsdt: tiktokEarned,
      status: tiktok?.status || "not_submitted",
      url: tiktok?.tiktok_url || "",
      adminNote: tiktok?.admin_note || "",
      submittedAt: tiktok?.created_at || null,
    },
    bonus: {
      totalEarnedUsdt: totalEarned,
      maxUsdt: config.maxBonusUsdt,
      remainingUsdt: Math.max(0, config.maxBonusUsdt - totalEarned),
    },
  };
}

async function isPrelaunchFinancialActionsBlocked(clientOrPool = pool) {
  // Lanzamiento oficial activo:
  // recargas, compra de planes y retiros ya no se bloquean por pre-lanzamiento.
  // Se conserva la función para compatibilidad con rutas existentes.
  await ensurePrelaunchSchema(clientOrPool).catch(() => {});
  return false;
}

module.exports = {
  ensurePrelaunchSchema,
  getConfig,
  getPrelaunchStatus,
  isPrelaunchFinancialActionsBlocked,
  creditRechargeBalance,
  refreshReferralReward,
  getPeruDateString,
};

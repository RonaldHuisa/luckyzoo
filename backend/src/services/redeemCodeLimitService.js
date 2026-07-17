const pool = require('../config/db');

const REDEEM_TIMEZONE = 'America/Lima';
const DEFAULT_CONFIG = {
  isActive: true,
  standardDailyLimit: 1,
  premiumDailyLimit: 3,
  premiumFromLevel: 3,
  noPlanGuaranteeCapActive: true,
  noPlanGuaranteeCapUsdt: 5,
  noPlanWithdrawableCapActive: true,
  noPlanWithdrawableCapUsdt: 5,
  timezone: REDEEM_TIMEZONE,
};

let ensurePromise = null;

function toPositiveInt(value, fallback) {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeConfig(row = {}) {
  return {
    isActive: row.is_active ?? DEFAULT_CONFIG.isActive,
    standardDailyLimit: toPositiveInt(row.standard_daily_limit, DEFAULT_CONFIG.standardDailyLimit),
    premiumDailyLimit: toPositiveInt(row.premium_daily_limit, DEFAULT_CONFIG.premiumDailyLimit),
    premiumFromLevel: toPositiveInt(row.premium_from_level, DEFAULT_CONFIG.premiumFromLevel),
    noPlanGuaranteeCapActive: row.no_plan_guarantee_cap_active ?? DEFAULT_CONFIG.noPlanGuaranteeCapActive,
    noPlanGuaranteeCapUsdt: Number.isFinite(Number(row.no_plan_guarantee_cap_usdt))
      ? Number(row.no_plan_guarantee_cap_usdt)
      : DEFAULT_CONFIG.noPlanGuaranteeCapUsdt,
    noPlanWithdrawableCapActive: row.no_plan_withdrawable_cap_active ?? DEFAULT_CONFIG.noPlanWithdrawableCapActive,
    noPlanWithdrawableCapUsdt: Number.isFinite(Number(row.no_plan_withdrawable_cap_usdt))
      ? Number(row.no_plan_withdrawable_cap_usdt)
      : DEFAULT_CONFIG.noPlanWithdrawableCapUsdt,
    timezone: row.timezone || DEFAULT_CONFIG.timezone,
    updatedAt: row.updated_at || null,
  };
}

async function ensureRedeemCodeLimitSchema() {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS redeem_daily_limit_config (
          id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          standard_daily_limit INTEGER NOT NULL DEFAULT 1 CHECK (standard_daily_limit > 0),
          premium_daily_limit INTEGER NOT NULL DEFAULT 3 CHECK (premium_daily_limit > 0),
          premium_from_level INTEGER NOT NULL DEFAULT 3 CHECK (premium_from_level BETWEEN 1 AND 8),
          no_plan_guarantee_cap_active BOOLEAN NOT NULL DEFAULT TRUE,
          no_plan_guarantee_cap_usdt NUMERIC(18,2) NOT NULL DEFAULT 5 CHECK (no_plan_guarantee_cap_usdt > 0),
          no_plan_withdrawable_cap_active BOOLEAN NOT NULL DEFAULT TRUE,
          no_plan_withdrawable_cap_usdt NUMERIC(18,2) NOT NULL DEFAULT 5 CHECK (no_plan_withdrawable_cap_usdt > 0),
          timezone VARCHAR(80) NOT NULL DEFAULT 'America/Lima',
          updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
          updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await pool.query(`
        INSERT INTO redeem_daily_limit_config(id)
        VALUES (1)
        ON CONFLICT (id) DO NOTHING
      `);

      await pool.query(`
        ALTER TABLE redeem_daily_limit_config
        ADD COLUMN IF NOT EXISTS no_plan_guarantee_cap_active BOOLEAN NOT NULL DEFAULT TRUE
      `);

      await pool.query(`
        ALTER TABLE redeem_daily_limit_config
        ADD COLUMN IF NOT EXISTS no_plan_guarantee_cap_usdt NUMERIC(18,2) NOT NULL DEFAULT 5
      `);

      await pool.query(`
        ALTER TABLE redeem_daily_limit_config
        ADD COLUMN IF NOT EXISTS no_plan_withdrawable_cap_active BOOLEAN NOT NULL DEFAULT TRUE
      `);

      await pool.query(`
        ALTER TABLE redeem_daily_limit_config
        ADD COLUMN IF NOT EXISTS no_plan_withdrawable_cap_usdt NUMERIC(18,2) NOT NULL DEFAULT 5
      `);

      await pool.query(`
        ALTER TABLE redeem_code_redemptions
        ADD COLUMN IF NOT EXISTS redeemed_day DATE
      `);

      await pool.query(`
        UPDATE redeem_code_redemptions
        SET redeemed_day = ((created_at AT TIME ZONE 'UTC') AT TIME ZONE '${REDEEM_TIMEZONE}')::date
        WHERE redeemed_day IS NULL
      `);

      await pool.query(`
        ALTER TABLE redeem_code_redemptions
        ALTER COLUMN redeemed_day SET DEFAULT ((CURRENT_TIMESTAMP AT TIME ZONE '${REDEEM_TIMEZONE}')::date)
      `);

      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_redeem_redemptions_user_day
        ON redeem_code_redemptions(user_id, redeemed_day)
      `);
    })().catch((error) => {
      ensurePromise = null;
      throw error;
    });
  }

  return ensurePromise;
}

async function getRedeemDailyLimitConfig(clientOrPool = pool, { forUpdate = false } = {}) {
  const result = await clientOrPool.query(
    `
    SELECT *
    FROM redeem_daily_limit_config
    WHERE id = 1
    ${forUpdate ? 'FOR UPDATE' : ''}
    `
  );

  return normalizeConfig(result.rows[0] || {});
}

async function updateRedeemDailyLimitConfig(client, {
  isActive,
  standardDailyLimit,
  premiumDailyLimit,
  premiumFromLevel,
  noPlanGuaranteeCapActive,
  noPlanGuaranteeCapUsdt,
  noPlanWithdrawableCapActive,
  noPlanWithdrawableCapUsdt,
  updatedBy,
}) {
  const standard = toPositiveInt(standardDailyLimit, DEFAULT_CONFIG.standardDailyLimit);
  const premium = toPositiveInt(premiumDailyLimit, DEFAULT_CONFIG.premiumDailyLimit);
  const fromLevel = toPositiveInt(premiumFromLevel, DEFAULT_CONFIG.premiumFromLevel);
  const guaranteeCap = Number(noPlanGuaranteeCapUsdt);
  const normalizedGuaranteeCap = Number.isFinite(guaranteeCap) && guaranteeCap > 0
    ? Number(guaranteeCap.toFixed(2))
    : DEFAULT_CONFIG.noPlanGuaranteeCapUsdt;

  const withdrawableCap = Number(noPlanWithdrawableCapUsdt);
  const normalizedWithdrawableCap = Number.isFinite(withdrawableCap) && withdrawableCap > 0
    ? Number(withdrawableCap.toFixed(2))
    : DEFAULT_CONFIG.noPlanWithdrawableCapUsdt;

  const result = await client.query(
    `
    UPDATE redeem_daily_limit_config
    SET
      is_active = $1,
      standard_daily_limit = $2,
      premium_daily_limit = $3,
      premium_from_level = $4,
      no_plan_guarantee_cap_active = $5,
      no_plan_guarantee_cap_usdt = $6,
      no_plan_withdrawable_cap_active = $7,
      no_plan_withdrawable_cap_usdt = $8,
      timezone = $9,
      updated_by = $10,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = 1
    RETURNING *
    `,
    [Boolean(isActive), standard, premium, fromLevel, Boolean(noPlanGuaranteeCapActive), normalizedGuaranteeCap, Boolean(noPlanWithdrawableCapActive), normalizedWithdrawableCap, REDEEM_TIMEZONE, updatedBy || null]
  );

  return normalizeConfig(result.rows[0] || {});
}

async function getActivePlanLevel(client, userId) {
  const result = await client.query(
    `
    SELECT COALESCE(MAX(level), 0)::int AS active_level
    FROM vip_purchases
    WHERE user_id = $1
      AND level >= 1
      AND status = 'active'
      AND expires_at > NOW()
    `,
    [userId]
  );

  return Number(result.rows[0]?.active_level || 0);
}

async function getUserRedeemDailyStatus(client, userId, config = null) {
  const resolvedConfig = config || await getRedeemDailyLimitConfig(client);
  const activeLevel = await getActivePlanLevel(client, userId);

  const [usageResult, balanceResult] = await Promise.all([
    client.query(
      `
      SELECT COUNT(*)::int AS used_today
      FROM redeem_code_redemptions
      WHERE user_id = $1
        AND redeemed_day = ((CURRENT_TIMESTAMP AT TIME ZONE $2)::date)
      `,
      [userId, REDEEM_TIMEZONE]
    ),
    client.query(
      `SELECT
         COALESCE(recharge_balance_usdt,0)::numeric AS guarantee_balance,
         COALESCE(withdrawable_usdt,0)::numeric AS withdrawable_balance
       FROM users WHERE id = $1 LIMIT 1`,
      [userId]
    ),
  ]);

  const usedToday = Number(usageResult.rows[0]?.used_today || 0);
  const currentGuaranteeBalance = Number(balanceResult.rows[0]?.guarantee_balance || 0);
  const currentWithdrawableBalance = Number(balanceResult.rows[0]?.withdrawable_balance || 0);
  const noPlanGuaranteeCapApplies = Boolean(resolvedConfig.noPlanGuaranteeCapActive && activeLevel < 1);
  const noPlanGuaranteeCapUsdt = Number(resolvedConfig.noPlanGuaranteeCapUsdt || DEFAULT_CONFIG.noPlanGuaranteeCapUsdt);
  const noPlanWithdrawableCapApplies = Boolean(resolvedConfig.noPlanWithdrawableCapActive && activeLevel < 1);
  const noPlanWithdrawableCapUsdt = Number(resolvedConfig.noPlanWithdrawableCapUsdt || DEFAULT_CONFIG.noPlanWithdrawableCapUsdt);
  const dailyLimit = activeLevel >= resolvedConfig.premiumFromLevel
    ? resolvedConfig.premiumDailyLimit
    : resolvedConfig.standardDailyLimit;

  return {
    isActive: Boolean(resolvedConfig.isActive),
    activeLevel,
    dailyLimit,
    usedToday,
    remainingToday: resolvedConfig.isActive ? Math.max(0, dailyLimit - usedToday) : null,
    reachedLimit: Boolean(resolvedConfig.isActive && usedToday >= dailyLimit),
    timezone: resolvedConfig.timezone || REDEEM_TIMEZONE,
    resetAt: getNextRedeemResetAt(),
    noPlanGuaranteeCapActive: Boolean(resolvedConfig.noPlanGuaranteeCapActive),
    noPlanGuaranteeCapApplies,
    noPlanGuaranteeCapUsdt,
    currentGuaranteeBalance,
    remainingGuaranteeCapacity: noPlanGuaranteeCapApplies
      ? Math.max(0, Number((noPlanGuaranteeCapUsdt - currentGuaranteeBalance).toFixed(2)))
      : null,
    guaranteeCapReached: Boolean(noPlanGuaranteeCapApplies && currentGuaranteeBalance >= noPlanGuaranteeCapUsdt),
    noPlanWithdrawableCapActive: Boolean(resolvedConfig.noPlanWithdrawableCapActive),
    noPlanWithdrawableCapApplies,
    noPlanWithdrawableCapUsdt,
    currentWithdrawableBalance,
    remainingWithdrawableCapacity: noPlanWithdrawableCapApplies
      ? Math.max(0, Number((noPlanWithdrawableCapUsdt - currentWithdrawableBalance).toFixed(2)))
      : null,
    withdrawableCapReached: Boolean(noPlanWithdrawableCapApplies && currentWithdrawableBalance >= noPlanWithdrawableCapUsdt),
  };
}


function getNextRedeemResetAt() {
  const peruOffsetMs = 5 * 60 * 60 * 1000;
  const shifted = new Date(Date.now() - peruOffsetMs);
  const nextShiftedMidnight = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate() + 1,
    0, 0, 0, 0
  );
  return new Date(nextShiftedMidnight + peruOffsetMs).toISOString();
}

function buildDailyLimitMessage(status) {
  const limit = Number(status?.dailyLimit || 0);
  const noun = limit === 1 ? 'código' : 'códigos';
  return `Hoy ya alcanzaste tu límite de ${limit} ${noun}. Podrás canjear nuevamente después de las 00:00 GMT-5.`;
}

module.exports = {
  REDEEM_TIMEZONE,
  DEFAULT_CONFIG,
  ensureRedeemCodeLimitSchema,
  getRedeemDailyLimitConfig,
  updateRedeemDailyLimitConfig,
  getActivePlanLevel,
  getUserRedeemDailyStatus,
  buildDailyLimitMessage,
  getNextRedeemResetAt,
};

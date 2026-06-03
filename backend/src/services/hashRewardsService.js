const pool = require("../config/db");

const MIN_VALID_INVESTMENT_USDT = Number(process.env.HASH_REWARD_MIN_VALID_INVESTMENT_USDT || 10);
const POINT_PERCENT = Number(process.env.HASH_REWARD_POINT_PERCENT || 0.05);
const MAX_BONUS_PERCENT = Number(process.env.HASH_REWARD_MAX_BONUS_PERCENT || 5.00);

function toNumber(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

async function ensureHashRewardsSchema(clientOrPool = pool) {
  await clientOrPool.query(`
    CREATE TABLE IF NOT EXISTS user_hash_points (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      available_points INTEGER NOT NULL DEFAULT 0,
      redeemed_points INTEGER NOT NULL DEFAULT 0,
      hash_bonus_percent NUMERIC(8,4) NOT NULL DEFAULT 0,
      max_bonus_percent NUMERIC(8,4) NOT NULL DEFAULT 5.00,
      created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await clientOrPool.query(`
    CREATE TABLE IF NOT EXISTS hash_point_referrals (
      id SERIAL PRIMARY KEY,
      referrer_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      referred_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      invested_amount NUMERIC(38,18) NOT NULL DEFAULT 0,
      points_awarded INTEGER NOT NULL DEFAULT 1,
      status VARCHAR(30) NOT NULL DEFAULT 'awarded',
      created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(referrer_user_id, referred_user_id)
    )
  `);

  await clientOrPool.query(`CREATE INDEX IF NOT EXISTS idx_user_hash_points_user_id ON user_hash_points(user_id)`);
  await clientOrPool.query(`CREATE INDEX IF NOT EXISTS idx_hash_point_referrals_referrer ON hash_point_referrals(referrer_user_id)`);
  await clientOrPool.query(`CREATE INDEX IF NOT EXISTS idx_hash_point_referrals_referred ON hash_point_referrals(referred_user_id)`);
}

async function ensureUserHashPoints(clientOrPool, userId) {
  await ensureHashRewardsSchema(clientOrPool);

  const result = await clientOrPool.query(
    `
    INSERT INTO user_hash_points (user_id, available_points, redeemed_points, hash_bonus_percent, max_bonus_percent)
    VALUES ($1, 0, 0, 0, $2)
    ON CONFLICT (user_id) DO UPDATE SET
      max_bonus_percent = EXCLUDED.max_bonus_percent,
      updated_at = CURRENT_TIMESTAMP
    RETURNING *
    `,
    [userId, MAX_BONUS_PERCENT]
  );

  return result.rows[0];
}

async function getHashBonusPercent(clientOrPool, userId) {
  await ensureHashRewardsSchema(clientOrPool);
  const result = await clientOrPool.query(
    `SELECT COALESCE(hash_bonus_percent,0) AS hash_bonus_percent FROM user_hash_points WHERE user_id = $1`,
    [userId]
  );
  return toNumber(result.rows[0]?.hash_bonus_percent);
}

async function syncValidReferralPoints(clientOrPool, userId) {
  await ensureUserHashPoints(clientOrPool, userId);

  const result = await clientOrPool.query(
    `
    WITH direct_referrals AS (
      SELECT
        r.id AS referred_user_id,
        GREATEST(
          COALESCE(MAX(ma.invested_amount), 0),
          COALESCE(MAX(r.recharge_balance_usdt), 0),
          COALESCE(MAX(r.balance_usdt), 0)
        ) AS invested_amount
      FROM users r
      LEFT JOIN mining_accounts ma ON ma.user_id = r.id AND ma.status IN ('active', 'completed')
      WHERE r.referred_by_id = $1
        AND COALESCE(r.is_banned, false) = false
        AND COALESCE(r.is_suspicious, false) = false
      GROUP BY r.id
    ), upsert_valid AS (
      INSERT INTO hash_point_referrals
        (referrer_user_id, referred_user_id, invested_amount, points_awarded, status)
      SELECT $1, referred_user_id, invested_amount, 1, 'awarded'
      FROM direct_referrals
      WHERE invested_amount >= $2
      ON CONFLICT (referrer_user_id, referred_user_id) DO UPDATE SET
        invested_amount = EXCLUDED.invested_amount,
        status = 'awarded'
      RETURNING referred_user_id
    ), revoke_invalid AS (
      UPDATE hash_point_referrals hpr
      SET status = 'revoked',
          invested_amount = COALESCE(dr.invested_amount, hpr.invested_amount)
      FROM direct_referrals dr
      WHERE hpr.referrer_user_id = $1
        AND hpr.referred_user_id = dr.referred_user_id
        AND dr.invested_amount < $2
      RETURNING hpr.referred_user_id
    ), valid_count AS (
      SELECT COUNT(*)::int AS valid_points
      FROM direct_referrals
      WHERE invested_amount >= $2
    ), current_points AS (
      SELECT hp.*,
             vc.valid_points,
             LEAST(COALESCE(hp.redeemed_points, 0), vc.valid_points) AS normalized_redeemed
      FROM user_hash_points hp
      CROSS JOIN valid_count vc
      WHERE hp.user_id = $1
    ), normalized AS (
      UPDATE user_hash_points hp
      SET
        redeemed_points = cp.normalized_redeemed,
        available_points = GREATEST(cp.valid_points - cp.normalized_redeemed, 0),
        hash_bonus_percent = LEAST(hp.max_bonus_percent, cp.normalized_redeemed * $3::numeric),
        max_bonus_percent = $4::numeric,
        updated_at = CURRENT_TIMESTAMP
      FROM current_points cp
      WHERE hp.user_id = cp.user_id
      RETURNING hp.available_points, hp.redeemed_points, hp.hash_bonus_percent
    )
    SELECT
      (SELECT valid_points FROM valid_count)::int AS valid_points,
      (SELECT COUNT(*)::int FROM upsert_valid) AS touched_valid,
      (SELECT COUNT(*)::int FROM revoke_invalid) AS revoked_points,
      (SELECT available_points FROM normalized) AS available_points,
      (SELECT redeemed_points FROM normalized) AS redeemed_points,
      (SELECT hash_bonus_percent FROM normalized) AS hash_bonus_percent
    `,
    [userId, MIN_VALID_INVESTMENT_USDT, POINT_PERCENT, MAX_BONUS_PERCENT]
  );

  return Number(result.rows[0]?.touched_valid || 0);
}

async function getHashRewardsStatusForUser(clientOrPool, userId, options = {}) {
  await ensureUserHashPoints(clientOrPool, userId);

  let addedPoints = 0;
  if (options.sync !== false) {
    addedPoints = await syncValidReferralPoints(clientOrPool, userId);
  }

  const pointsResult = await clientOrPool.query(
    `SELECT * FROM user_hash_points WHERE user_id = $1`,
    [userId]
  );
  const points = pointsResult.rows[0];

  const statsResult = await clientOrPool.query(
    `
    SELECT
      COUNT(*) FILTER (WHERE status = 'awarded')::int AS valid_referrals,
      COALESCE(SUM(invested_amount) FILTER (WHERE status = 'awarded'), 0) AS valid_referrals_invested
    FROM hash_point_referrals
    WHERE referrer_user_id = $1
    `,
    [userId]
  );

  const directResult = await clientOrPool.query(
    `
    WITH direct_referrals AS (
      SELECT
        r.id,
        GREATEST(
          COALESCE(MAX(ma.invested_amount), 0),
          COALESCE(MAX(r.recharge_balance_usdt), 0),
          COALESCE(MAX(r.balance_usdt), 0)
        ) AS invested_amount
      FROM users r
      LEFT JOIN mining_accounts ma ON ma.user_id = r.id AND ma.status IN ('active', 'completed')
      WHERE r.referred_by_id = $1
        AND COALESCE(r.is_banned, false) = false
        AND COALESCE(r.is_suspicious, false) = false
      GROUP BY r.id
    )
    SELECT
      COUNT(*)::int AS direct_referrals,
      COUNT(*) FILTER (WHERE invested_amount >= $2)::int AS currently_valid_direct_referrals
    FROM direct_referrals
    `,
    [userId, MIN_VALID_INVESTMENT_USDT]
  );

  const validReferrals = Number(directResult.rows[0]?.currently_valid_direct_referrals || 0);

  return {
    addedPoints,
    validReferrals,
    validReferralsInvested: statsResult.rows[0]?.valid_referrals_invested || "0",
    directReferrals: Number(directResult.rows[0]?.direct_referrals || 0),
    currentlyValidDirectReferrals: validReferrals,
    availablePoints: Number(points.available_points || 0),
    redeemedPoints: Number(points.redeemed_points || 0),
    hashBonusPercent: Number(points.hash_bonus_percent || 0),
    maxBonusPercent: Number(points.max_bonus_percent || MAX_BONUS_PERCENT),
    pointPercent: POINT_PERCENT,
    minValidInvestmentUsdt: MIN_VALID_INVESTMENT_USDT,
    remainingBonusPercent: Math.max(0, Number(points.max_bonus_percent || MAX_BONUS_PERCENT) - Number(points.hash_bonus_percent || 0)),
    canRedeem: Number(points.available_points || 0) > 0 && Number(points.hash_bonus_percent || 0) < Number(points.max_bonus_percent || MAX_BONUS_PERCENT),
  };
}

async function getHashRewardsStatus(userId) {
  const client = await pool.connect();
  try {
    return await getHashRewardsStatusForUser(client, userId, { sync: true });
  } finally {
    client.release();
  }
}

async function redeemHashPoint(userId) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await ensureUserHashPoints(client, userId);
    await syncValidReferralPoints(client, userId);

    const pointsResult = await client.query(
      `SELECT * FROM user_hash_points WHERE user_id = $1 FOR UPDATE`,
      [userId]
    );

    const points = pointsResult.rows[0];
    const available = Number(points.available_points || 0);
    const currentBonus = Number(points.hash_bonus_percent || 0);
    const maxBonus = Number(points.max_bonus_percent || MAX_BONUS_PERCENT);

    if (available <= 0) {
      await client.query("ROLLBACK");
      return { ok: false, message: "No tienes puntos hash disponibles para canjear." };
    }

    if (currentBonus >= maxBonus) {
      await client.query("ROLLBACK");
      return { ok: false, message: "Ya alcanzaste el bonus máximo de hash." };
    }

    const appliedPercent = Math.min(POINT_PERCENT, maxBonus - currentBonus);
    const updatedResult = await client.query(
      `
      UPDATE user_hash_points
      SET available_points = available_points - 1,
          redeemed_points = redeemed_points + 1,
          hash_bonus_percent = LEAST(max_bonus_percent, hash_bonus_percent + $1),
          updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $2
      RETURNING *
      `,
      [appliedPercent, userId]
    );

    await client.query("COMMIT");

    const status = await getHashRewardsStatusForUser(client, userId, { sync: false });
    return {
      ok: true,
      message: `Canje realizado. Tu hash aumentó +${appliedPercent.toFixed(2)}%.`,
      status,
      points: updatedResult.rows[0],
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  MIN_VALID_INVESTMENT_USDT,
  POINT_PERCENT,
  MAX_BONUS_PERCENT,
  ensureHashRewardsSchema,
  ensureUserHashPoints,
  syncValidReferralPoints,
  getHashBonusPercent,
  getHashRewardsStatus,
  redeemHashPoint,
};

const pool = require("../config/db");
const { ensureHashRewardsSchema, getHashBonusPercent } = require("./hashRewardsService");

const MINING_PLANS = [
  { level: 1, name: "GreenVest-1", minAmount: 10, maxAmount: 30, dailyRewardUsdt: 0.40, durationHours: 24, windowDays: 30 },
  { level: 2, name: "GreenVest-2", minAmount: 30, maxAmount: 80, dailyRewardUsdt: 1.50, durationHours: 24, windowDays: 30 },
  { level: 3, name: "GreenVest-3", minAmount: 80, maxAmount: 150, dailyRewardUsdt: 4.20, durationHours: 24, windowDays: 30 },
  { level: 4, name: "GreenVest-4", minAmount: 150, maxAmount: 350, dailyRewardUsdt: 8.50, durationHours: 24, windowDays: 30 },
  { level: 5, name: "GreenVest-5", minAmount: 350, maxAmount: 800, dailyRewardUsdt: 22.00, durationHours: 24, windowDays: 30 },
  { level: 6, name: "GreenVest-6", minAmount: 800, maxAmount: 1500, dailyRewardUsdt: 55.00, durationHours: 24, windowDays: 30 },
  { level: 7, name: "GreenVest-7", minAmount: 1500, maxAmount: 4000, dailyRewardUsdt: 110.00, durationHours: 24, windowDays: 30 },
  { level: 8, name: "GreenVest-8", minAmount: 4000, maxAmount: null, dailyRewardUsdt: 320.00, durationHours: 24, windowDays: 30 },
];

function getAuthUserId(req) {
  return req.user?.userId || req.user?.id;
}

function getAuthUserEmail(req) {
  return req.user?.email || null;
}

function toNumber(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

async function ensureMiningSchema(clientOrPool = pool) {
  await clientOrPool.query(`
    CREATE TABLE IF NOT EXISTS mining_plans (
      id SERIAL PRIMARY KEY,
      level INTEGER NOT NULL UNIQUE,
      name VARCHAR(50) NOT NULL,
      min_amount NUMERIC(38,18) NOT NULL,
      max_amount NUMERIC(38,18),
      daily_percent NUMERIC(12,6) NOT NULL DEFAULT 0,
      daily_reward_usdt NUMERIC(38,18) NOT NULL DEFAULT 0,
      duration_hours INTEGER NOT NULL DEFAULT 24,
      window_days INTEGER NOT NULL DEFAULT 120,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await clientOrPool.query(`ALTER TABLE mining_plans ADD COLUMN IF NOT EXISTS daily_reward_usdt NUMERIC(38,18) NOT NULL DEFAULT 0`);
  await clientOrPool.query(`ALTER TABLE mining_plans ALTER COLUMN daily_percent SET DEFAULT 0`);

  await clientOrPool.query(`
    CREATE TABLE IF NOT EXISTS mining_accounts (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      current_plan_id INTEGER REFERENCES mining_plans(id),
      invested_amount NUMERIC(38,18) NOT NULL DEFAULT 0,
      daily_percent NUMERIC(12,6) NOT NULL DEFAULT 0,
      daily_reward NUMERIC(38,18) NOT NULL DEFAULT 0,
      cycle_started_at TIMESTAMP WITHOUT TIME ZONE,
      cycle_ends_at TIMESTAMP WITHOUT TIME ZONE,
      last_claimed_at TIMESTAMP WITHOUT TIME ZONE,
      status VARCHAR(30) NOT NULL DEFAULT 'inactive',
      created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await clientOrPool.query(`
    CREATE TABLE IF NOT EXISTS mining_claims (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      mining_account_id INTEGER NOT NULL REFERENCES mining_accounts(id) ON DELETE CASCADE,
      plan_id INTEGER REFERENCES mining_plans(id),
      invested_amount NUMERIC(38,18) NOT NULL,
      daily_percent NUMERIC(12,6) NOT NULL,
      reward_amount NUMERIC(38,18) NOT NULL,
      cycle_started_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
      cycle_ends_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
      claimed_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      status VARCHAR(30) NOT NULL DEFAULT 'claimed'
    )
  `);

  await clientOrPool.query(`CREATE INDEX IF NOT EXISTS idx_mining_accounts_user_id ON mining_accounts(user_id)`);
  await clientOrPool.query(`CREATE INDEX IF NOT EXISTS idx_mining_claims_user_id ON mining_claims(user_id)`);
  await clientOrPool.query(`CREATE INDEX IF NOT EXISTS idx_mining_claims_claimed_at ON mining_claims(claimed_at DESC)`);

  await ensureHashRewardsSchema(clientOrPool);

  for (const plan of MINING_PLANS) {
    await clientOrPool.query(
      `
      INSERT INTO mining_plans (level, name, min_amount, max_amount, daily_percent, daily_reward_usdt, duration_hours, window_days, is_active)
      VALUES ($1,$2,$3,$4,0,$5,$6,$7,true)
      ON CONFLICT (level) DO UPDATE SET
        name = EXCLUDED.name,
        min_amount = EXCLUDED.min_amount,
        max_amount = EXCLUDED.max_amount,
        daily_percent = 0,
        daily_reward_usdt = EXCLUDED.daily_reward_usdt,
        duration_hours = EXCLUDED.duration_hours,
        window_days = EXCLUDED.window_days,
        is_active = true,
        updated_at = CURRENT_TIMESTAMP
      `,
      [plan.level, plan.name, plan.minAmount, plan.maxAmount, plan.dailyRewardUsdt, plan.durationHours, plan.windowDays]
    );
  }

  await clientOrPool.query(`
    UPDATE mining_plans
    SET is_active = false, updated_at = CURRENT_TIMESTAMP
    WHERE level > 8
  `);
}

async function findUserFromAuth(clientOrPool, authUser) {
  const authId = authUser?.userId || authUser?.id || authUser;
  const authEmail = authUser?.email || null;

  const result = await clientOrPool.query(
    `
    SELECT
      id,
      email,
      COALESCE(balance_usdt, 0) AS balance_usdt,
      COALESCE(recharge_balance_usdt, 0) AS recharge_balance_usdt,
      COALESCE(withdrawable_usdt, 0) AS withdrawable_usdt,
      COALESCE(earnings_balance_usdt, 0) AS earnings_balance_usdt
    FROM users
    WHERE id = $1 OR ($2::text IS NOT NULL AND email = $2)
    ORDER BY CASE WHEN email = $2 THEN 0 ELSE 1 END
    LIMIT 1
    `,
    [authId || 0, authEmail]
  );

  return result.rows[0] || null;
}

async function findMiningPlan(clientOrPool, investedAmount) {
  const result = await clientOrPool.query(
    `
    SELECT *
    FROM mining_plans
    WHERE is_active = true
      AND $1::numeric >= min_amount
      AND (max_amount IS NULL OR $1::numeric < max_amount)
    ORDER BY level ASC
    LIMIT 1
    `,
    [investedAmount]
  );

  return result.rows[0] || null;
}

async function refreshMiningAccountForUser(clientOrPool, authUser) {
  await ensureMiningSchema(clientOrPool);

  const user = await findUserFromAuth(clientOrPool, authUser);
  if (!user) return null;

  const existingResult = await clientOrPool.query(
    `SELECT * FROM mining_accounts WHERE user_id = $1 LIMIT 1`,
    [user.id]
  );
  const existing = existingResult.rows[0] || null;

  // La inversión real se toma del mayor valor disponible para evitar que el frontend quede en 0
  // si un flujo antiguo guardó el monto en balance_usdt, recharge_balance_usdt o mining_accounts.
  const investedAmount = Math.max(
    toNumber(existing?.invested_amount),
    toNumber(user.balance_usdt),
    toNumber(user.recharge_balance_usdt)
  );

  const plan = await findMiningPlan(clientOrPool, investedAmount);

  if (!plan) {
    const inactiveResult = await clientOrPool.query(
      `
      INSERT INTO mining_accounts (user_id, invested_amount, daily_percent, daily_reward, status, updated_at)
      VALUES ($1,$2,0,0,'inactive',CURRENT_TIMESTAMP)
      ON CONFLICT (user_id) DO UPDATE SET
        current_plan_id = NULL,
        invested_amount = EXCLUDED.invested_amount,
        daily_percent = 0,
        daily_reward = 0,
        status = 'inactive',
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
      `,
      [user.id, investedAmount]
    );

    return { user, account: inactiveResult.rows[0], plan: null };
  }

  // GreenVest V1 usa ganancia fija diaria por nivel, no porcentaje.
  const totalDailyPercent = 0;
  const dailyReward = toNumber(plan.daily_reward_usdt);

  const accountResult = await clientOrPool.query(
    `
    INSERT INTO mining_accounts
      (user_id, current_plan_id, invested_amount, daily_percent, daily_reward, cycle_started_at, cycle_ends_at, status, updated_at)
    VALUES
      ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + ($6::int * INTERVAL '1 hour'), 'active', CURRENT_TIMESTAMP)
    ON CONFLICT (user_id) DO UPDATE SET
      current_plan_id = EXCLUDED.current_plan_id,
      invested_amount = EXCLUDED.invested_amount,
      daily_percent = EXCLUDED.daily_percent,
      daily_reward = EXCLUDED.daily_reward,
      cycle_started_at = CASE
        WHEN mining_accounts.status <> 'active' OR mining_accounts.cycle_started_at IS NULL THEN CURRENT_TIMESTAMP
        ELSE mining_accounts.cycle_started_at
      END,
      cycle_ends_at = CASE
        WHEN mining_accounts.status <> 'active' OR mining_accounts.cycle_ends_at IS NULL THEN CURRENT_TIMESTAMP + ($6::int * INTERVAL '1 hour')
        ELSE mining_accounts.cycle_ends_at
      END,
      status = 'active',
      updated_at = CURRENT_TIMESTAMP
    RETURNING *
    `,
    [user.id, plan.id, investedAmount, totalDailyPercent, dailyReward, plan.duration_hours]
  );

  return { user, account: accountResult.rows[0], plan };
}

function formatMiningAccount(row, plan, serverNow = new Date()) {
  const start = row?.cycle_started_at ? new Date(row.cycle_started_at) : null;
  const end = row?.cycle_ends_at ? new Date(row.cycle_ends_at) : null;
  const now = new Date(serverNow);
  const totalMs = start && end ? Math.max(end.getTime() - start.getTime(), 1) : 1;
  const elapsedMs = start ? Math.max(now.getTime() - start.getTime(), 0) : 0;
  const progressPercent = Math.min(100, Math.max(0, (elapsedMs / totalMs) * 100));
  const remainingMs = end ? Math.max(end.getTime() - now.getTime(), 0) : 0;

  return {
    id: row?.id || null,
    status: row?.status || "inactive",
    plan: plan ? {
      id: plan.id,
      level: Number(plan.level),
      name: plan.name,
      minAmount: plan.min_amount,
      maxAmount: plan.max_amount,
      dailyPercent: plan.daily_percent,
      dailyRewardUsdt: plan.daily_reward_usdt,
      durationHours: Number(plan.duration_hours),
      windowDays: Number(plan.window_days),
    } : null,
    investedAmount: row?.invested_amount || "0",
    dailyPercent: row?.daily_percent || "0",
    dailyReward: row?.daily_reward || "0",
    hashRate: toNumber(row?.invested_amount).toFixed(2),
    cycleStartedAt: row?.cycle_started_at || null,
    cycleEndsAt: row?.cycle_ends_at || null,
    lastClaimedAt: row?.last_claimed_at || null,
    progressPercent,
    remainingMs,
    isClaimable: row?.status === "active" && remainingMs <= 0,
  };
}

async function getMiningDashboard(authUser) {
  const client = await pool.connect();
  try {
    await ensureMiningSchema(client);
    const refreshed = await refreshMiningAccountForUser(client, authUser);

    if (!refreshed?.user) {
      return {
        user: null,
        serverNow: new Date().toISOString(),
        balances: { investmentWalletUsdt: "0", earningsWalletUsdt: "0", totalAssetsUsdt: "0.000000" },
        mining: formatMiningAccount(null, null),
        plans: [],
        claims: [],
        debug: { reason: "USER_NOT_FOUND", authUser },
      };
    }

    const user = refreshed.user;
    const plan = refreshed.plan || null;
    const account = refreshed.account || null;

    const plansResult = await client.query(`SELECT * FROM mining_plans WHERE is_active = true ORDER BY level ASC`);

    const claimsResult = await client.query(
      `SELECT mc.*, mp.name AS plan_name, mp.level AS plan_level
       FROM mining_claims mc
       LEFT JOIN mining_plans mp ON mp.id = mc.plan_id
       WHERE mc.user_id = $1
       ORDER BY mc.claimed_at DESC
       LIMIT 50`,
      [user.id]
    );

    const serverNow = new Date();
    const mining = formatMiningAccount(account, plan, serverNow);
    mining.baseDailyPercent = "0";
    mining.hashBonusPercent = "0";
    mining.totalDailyPercent = "0";

    const investmentWalletUsdt = String(mining.investedAmount || user.balance_usdt || user.recharge_balance_usdt || "0");

    // Monedero de comisiones/retiro: debe reflejar el saldo realmente retirable.
    // No usamos earnings_balance_usdt como fallback principal porque ese acumulado histórico
    // no siempre baja cuando el usuario solicita un retiro. withdrawable_usdt sí se descuenta.
    const earningsWalletUsdt = String(user.withdrawable_usdt || "0");
    const totalAssetsUsdt = (toNumber(investmentWalletUsdt) + toNumber(earningsWalletUsdt)).toFixed(6);

    return {
      user,
      serverNow: serverNow.toISOString(),
      balances: {
        investmentWalletUsdt,
        earningsWalletUsdt,
        totalAssetsUsdt,
      },
      mining,
      plans: plansResult.rows.map((item) => ({
        id: item.id,
        level: Number(item.level),
        name: item.name,
        minAmount: item.min_amount,
        maxAmount: item.max_amount,
        dailyPercent: item.daily_percent,
        dailyRewardUsdt: item.daily_reward_usdt,
        durationHours: Number(item.duration_hours),
        windowDays: Number(item.window_days),
      })),
      claims: claimsResult.rows.map((item) => ({
        id: item.id,
        planName: item.plan_name || `GreenVest-${item.plan_level || ""}`,
        planLevel: item.plan_level,
        investedAmount: item.invested_amount,
        dailyPercent: item.daily_percent,
        rewardAmount: item.reward_amount,
        cycleStartedAt: item.cycle_started_at,
        cycleEndsAt: item.cycle_ends_at,
        claimedAt: item.claimed_at,
        status: item.status,
      })),
      debug: {
        authUser,
        resolvedUserId: user.id,
        resolvedEmail: user.email,
        dbName: process.env.DB_NAME,
      },
    };
  } finally {
    client.release();
  }
}

module.exports = {
  getAuthUserId,
  getAuthUserEmail,
  ensureMiningSchema,
  refreshMiningAccountForUser,
  getMiningDashboard,
};

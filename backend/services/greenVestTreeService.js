const pool = require("../config/db");

const TREE_PLANS = [
  {
    level: 0,
    name: "Brote de Pasantía",
    priceUsdt: 0,
    waterRewardUsdt: 0.075,
    dailyIncomeUsdt: 0.30,
    validDays: 3,
    cooldownMinutes: 360,
    isPurchasable: false,
    description: "Nivel gratis de prueba. Válido únicamente durante 3 días desde el registro.",
  },
  { level: 1, name: "Planta Esmeralda", priceUsdt: 10, waterRewardUsdt: 0.17, dailyIncomeUsdt: 0.68, validDays: 30, cooldownMinutes: 360, isPurchasable: true },
  { level: 2, name: "Planta Zafiro", priceUsdt: 30, waterRewardUsdt: 0.50, dailyIncomeUsdt: 2.00, validDays: 30, cooldownMinutes: 360, isPurchasable: true },
  { level: 3, name: "Planta Rubí", priceUsdt: 80, waterRewardUsdt: 1.34, dailyIncomeUsdt: 5.36, validDays: 30, cooldownMinutes: 360, isPurchasable: true },
  { level: 4, name: "Planta Amatista", priceUsdt: 150, waterRewardUsdt: 2.50, dailyIncomeUsdt: 10.00, validDays: 30, cooldownMinutes: 360, isPurchasable: true },
  { level: 5, name: "Planta Topacio", priceUsdt: 350, waterRewardUsdt: 5.85, dailyIncomeUsdt: 23.40, validDays: 30, cooldownMinutes: 360, isPurchasable: true },
  { level: 6, name: "Planta Aguamarina", priceUsdt: 800, waterRewardUsdt: 13.35, dailyIncomeUsdt: 53.40, validDays: 30, cooldownMinutes: 360, isPurchasable: true },
  { level: 7, name: "Planta Citrino", priceUsdt: 1500, waterRewardUsdt: 25.00, dailyIncomeUsdt: 100.00, validDays: 30, cooldownMinutes: 360, isPurchasable: true },
  { level: 8, name: "Planta Cuarzo Rosa", priceUsdt: 4000, waterRewardUsdt: 66.70, dailyIncomeUsdt: 266.80, validDays: 30, cooldownMinutes: 360, isPurchasable: true },
  { level: 9, name: "Planta Diamante", priceUsdt: 8000, waterRewardUsdt: 133.40, dailyIncomeUsdt: 533.60, validDays: 30, cooldownMinutes: 360, isPurchasable: true },
];

function toNumber(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getTreePlanByLevel(level) {
  return TREE_PLANS.find((plan) => Number(plan.level) === Number(level)) || null;
}

async function ensureGreenVestTreeSchema(clientOrPool = pool) {
  await clientOrPool.query(`
    CREATE TABLE IF NOT EXISTS vip_packages (
      id SERIAL PRIMARY KEY,
      level INTEGER NOT NULL UNIQUE,
      name VARCHAR(100) NOT NULL,
      price_usdt NUMERIC(38,18) NOT NULL DEFAULT 0,
      daily_income_usdt NUMERIC(38,18) NOT NULL DEFAULT 0,
      valid_days INTEGER NOT NULL DEFAULT 30,
      task_reward_usdt NUMERIC(38,18),
      task_cooldown_minutes INTEGER,
      is_purchasable BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await clientOrPool.query(`ALTER TABLE vip_packages ADD COLUMN IF NOT EXISTS daily_income_usdt NUMERIC(38,18) NOT NULL DEFAULT 0`);
  await clientOrPool.query(`ALTER TABLE vip_packages ADD COLUMN IF NOT EXISTS valid_days INTEGER NOT NULL DEFAULT 30`);
  await clientOrPool.query(`ALTER TABLE vip_packages ADD COLUMN IF NOT EXISTS task_reward_usdt NUMERIC(38,18)`);
  await clientOrPool.query(`ALTER TABLE vip_packages ADD COLUMN IF NOT EXISTS task_cooldown_minutes INTEGER`);
  await clientOrPool.query(`ALTER TABLE vip_packages ADD COLUMN IF NOT EXISTS is_purchasable BOOLEAN NOT NULL DEFAULT true`);
  await clientOrPool.query(`ALTER TABLE vip_packages ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP`);

  await clientOrPool.query(`
    CREATE TABLE IF NOT EXISTS vip_purchases (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      package_id INTEGER NOT NULL REFERENCES vip_packages(id),
      level INTEGER NOT NULL,
      price_usdt NUMERIC(38,18) NOT NULL DEFAULT 0,
      daily_income_usdt NUMERIC(38,18) NOT NULL DEFAULT 0,
      purchased_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      expires_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'active'
    )
  `);

  await clientOrPool.query(`
    CREATE TABLE IF NOT EXISTS vip_daily_tasks (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      vip_purchase_id INTEGER NOT NULL REFERENCES vip_purchases(id) ON DELETE CASCADE,
      vip_level INTEGER NOT NULL,
      period_start TIMESTAMP WITHOUT TIME ZONE NOT NULL,
      period_end TIMESTAMP WITHOUT TIME ZONE NOT NULL,
      reward_usdt NUMERIC(38,18) NOT NULL DEFAULT 0,
      status VARCHAR(30) NOT NULL DEFAULT 'completed',
      completed_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await clientOrPool.query(`ALTER TABLE vip_daily_tasks ADD COLUMN IF NOT EXISTS period_start TIMESTAMP WITHOUT TIME ZONE`);
  await clientOrPool.query(`ALTER TABLE vip_daily_tasks ADD COLUMN IF NOT EXISTS period_end TIMESTAMP WITHOUT TIME ZONE`);
  await clientOrPool.query(`ALTER TABLE vip_daily_tasks ADD COLUMN IF NOT EXISTS reward_usdt NUMERIC(38,18) NOT NULL DEFAULT 0`);
  await clientOrPool.query(`ALTER TABLE vip_daily_tasks ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP`);

  await clientOrPool.query(`CREATE INDEX IF NOT EXISTS idx_vip_purchases_user_level ON vip_purchases(user_id, level)`);
  await clientOrPool.query(`CREATE INDEX IF NOT EXISTS idx_vip_purchases_active ON vip_purchases(user_id, status, expires_at)`);
  await clientOrPool.query(`CREATE INDEX IF NOT EXISTS idx_vip_daily_tasks_purchase_completed ON vip_daily_tasks(vip_purchase_id, completed_at DESC)`);

  for (const plan of TREE_PLANS) {
    await clientOrPool.query(
      `
      INSERT INTO vip_packages
        (level, name, price_usdt, daily_income_usdt, valid_days, task_reward_usdt, task_cooldown_minutes, is_purchasable, updated_at)
      VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,CURRENT_TIMESTAMP)
      ON CONFLICT (level) DO UPDATE SET
        name = EXCLUDED.name,
        price_usdt = EXCLUDED.price_usdt,
        daily_income_usdt = EXCLUDED.daily_income_usdt,
        valid_days = EXCLUDED.valid_days,
        task_reward_usdt = EXCLUDED.task_reward_usdt,
        task_cooldown_minutes = EXCLUDED.task_cooldown_minutes,
        is_purchasable = EXCLUDED.is_purchasable,
        updated_at = CURRENT_TIMESTAMP
      `,
      [
        plan.level,
        plan.name,
        plan.priceUsdt,
        plan.dailyIncomeUsdt,
        plan.validDays,
        plan.waterRewardUsdt,
        plan.cooldownMinutes,
        plan.isPurchasable,
      ]
    );
  }
}

async function grantInternshipTree(clientOrPool, userId, userCreatedAt = null) {
  await ensureGreenVestTreeSchema(clientOrPool);

  const packageResult = await clientOrPool.query(
    `SELECT * FROM vip_packages WHERE level = 0 LIMIT 1`
  );

  const internship = packageResult.rows[0];
  if (!internship) return null;

  const purchaseResult = await clientOrPool.query(
    `
    INSERT INTO vip_purchases
      (user_id, package_id, level, price_usdt, daily_income_usdt, purchased_at, expires_at, status)
    VALUES
      ($1, $2, 0, 0, $3, COALESCE($4::timestamp, NOW()), COALESCE($4::timestamp, NOW()) + INTERVAL '3 days', 'active')
    ON CONFLICT DO NOTHING
    RETURNING *
    `,
    [userId, internship.id, internship.daily_income_usdt, userCreatedAt]
  );

  return purchaseResult.rows[0] || null;
}

async function getUserMaxCommissionLevel(clientOrPool, userId) {
  const result = await clientOrPool.query(
    `
    SELECT COALESCE(MAX(level), 0)::int AS max_level
    FROM vip_purchases
    WHERE user_id = $1
      AND level >= 1
      AND status IN ('active', 'expired', 'completed')
    `,
    [userId]
  );

  return Number(result.rows[0]?.max_level || 0);
}

module.exports = {
  TREE_PLANS,
  toNumber,
  getTreePlanByLevel,
  ensureGreenVestTreeSchema,
  grantInternshipTree,
  getUserMaxCommissionLevel,
};

const crypto = require("crypto");

const TIMEZONE = "America/Lima";
const COINS_PER_USDT = 10000;
const COINS_PER_EXCHANGE_BLOCK = 1000;
const USDT_PER_EXCHANGE_BLOCK = 0.1;
const VISIBLE_REWARDS = [20, 40, 100, 250, 500, 1000, 2000, 5000];
const REGISTRATION_BONUS_SPINS = 15;

// Cuando el usuario ya completó su objetivo diario, no se muestra el mensaje
// de límite si aún tiene tiros por hora. En su lugar entra en modo mala suerte:
// solo recibe premios pequeños de 20 o 40 monedas.
const BAD_LUCK_REWARDS = [
  { reward: 20, weight: 75 },
  { reward: 40, weight: 25 },
];

const VIP_LEVELS = [
  { level: 0, animalKey: "pollito", planName: "Pasantía Pollito", displayName: "Ruleta Pollito", theme: "#f2b705", priceUsdt: 0, validDays: 0, shotsPerHour: 1, referralCommissionPercent: 5, dailyMinRate: 0, dailyMaxRate: 0, freeDailyTargetCoins: 600, rewards: [20, 40], weights: [80, 20] },
  { level: 1, animalKey: "conejo", planName: "VIP 1 Conejo", displayName: "Ruleta Conejo", theme: "#8d6cff", priceUsdt: 5, validDays: 0, shotsPerHour: 5, referralCommissionPercent: 10, dailyMinRate: 0.06, dailyMaxRate: 0.07, rewards: [20, 40, 100], weights: [58, 34, 8] },
  { level: 2, animalKey: "oveja", planName: "VIP 2 Oveja", displayName: "Ruleta Oveja", theme: "#28a66f", priceUsdt: 50, validDays: 0, shotsPerHour: 15, referralCommissionPercent: 20, dailyMinRate: 0.06, dailyMaxRate: 0.07, rewards: [40, 100, 250], weights: [50, 38, 12] },
  { level: 3, animalKey: "toro", planName: "VIP 3 Toro", displayName: "Ruleta Toro", theme: "#b86a28", priceUsdt: 200, validDays: 0, shotsPerHour: 35, referralCommissionPercent: 30, dailyMinRate: 0.06, dailyMaxRate: 0.07, rewards: [40, 100, 250, 500], weights: [20, 42, 30, 8] },
  { level: 4, animalKey: "leon", planName: "VIP 4 León", displayName: "Ruleta León", theme: "#d18a00", priceUsdt: 500, validDays: 0, shotsPerHour: 55, referralCommissionPercent: 40, dailyMinRate: 0.06, dailyMaxRate: 0.07, rewards: [40, 100, 250, 500, 1000], weights: [10, 18, 38, 28, 6] },
  { level: 5, animalKey: "tigre", planName: "VIP 5 Tigre", displayName: "Ruleta Tigre", theme: "#e13b21", priceUsdt: 1200, validDays: 0, shotsPerHour: 80, referralCommissionPercent: 50, dailyMinRate: 0.06, dailyMaxRate: 0.07, rewards: [40, 100, 250, 500, 1000, 2000, 5000], weights: [5, 8, 24, 34, 22, 6, 0.05] },
];

function getVipLevelConfig(level) {
  const numeric = Number(level || 0);
  return VIP_LEVELS.find((item) => item.level === numeric) || VIP_LEVELS[0];
}

function normalizeAnimalRouletteLevel(rowOrConfig) {
  const config = getVipLevelConfig(rowOrConfig?.level ?? rowOrConfig);
  return {
    level: config.level,
    animalKey: config.animalKey,
    planName: config.planName,
    displayName: config.displayName,
    theme: config.theme,
    priceUsdt: config.priceUsdt,
    validDays: config.validDays,
    shotsPerHour: config.shotsPerHour,
    dailySpins: config.shotsPerHour,
    referralCommissionPercent: config.referralCommissionPercent,
    rewards: VISIBLE_REWARDS,
    allowedRewards: config.rewards,
    weights: config.weights,
    exchange: { coins: COINS_PER_EXCHANGE_BLOCK, usdt: USDT_PER_EXCHANGE_BLOCK },
  };
}

function toInt(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? Math.floor(n) : 0;
}

function toMoneyNumber(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function randomDailyRate(min, max) {
  if (!min || !max) return 0;
  const rate = Number(min) + Math.random() * (Number(max) - Number(min));
  return Number(rate.toFixed(6));
}

function nextHourLabelFromLimaBlock(blockStartLima) {
  if (!blockStartLima) return "la siguiente hora";
  const d = new Date(blockStartLima);
  d.setHours(d.getHours() + 1);
  return d.toLocaleTimeString("es-PE", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: TIMEZONE });
}

function getRewardIndex(prize) {
  const exact = VISIBLE_REWARDS.indexOf(Number(prize));
  if (exact >= 0) return exact;
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  VISIBLE_REWARDS.forEach((reward, index) => {
    const distance = Math.abs(reward - Number(prize || 0));
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });
  return bestIndex;
}

async function ensureRouletteSchema(client) {
  await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS roulette_points INTEGER DEFAULT 0 NOT NULL`);
  await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS roulette_coins NUMERIC(38,0) DEFAULT 0 NOT NULL`);
  await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS daily_reward_date DATE`);
  await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS daily_rate NUMERIC(10,6) DEFAULT 0`);
  await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS daily_target_coins NUMERIC(38,0) DEFAULT 0 NOT NULL`);
  await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS daily_earned_coins NUMERIC(38,0) DEFAULT 0 NOT NULL`);
  await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS spins_used_today INTEGER DEFAULT 0 NOT NULL`);
  await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_daily_reset_at TIMESTAMP WITHOUT TIME ZONE`);

  await client.query(`ALTER TABLE vip_packages ADD COLUMN IF NOT EXISTS animal_key VARCHAR(30) DEFAULT 'pollito'`);
  await client.query(`ALTER TABLE vip_packages ADD COLUMN IF NOT EXISTS plan_type VARCHAR(30) DEFAULT 'roulette'`);
  await client.query(`ALTER TABLE vip_packages ADD COLUMN IF NOT EXISTS shots_per_hour INTEGER DEFAULT 1 NOT NULL`);
  await client.query(`ALTER TABLE vip_packages ADD COLUMN IF NOT EXISTS daily_roulette_spins INTEGER DEFAULT 1 NOT NULL`);
  await client.query(`ALTER TABLE vip_packages ADD COLUMN IF NOT EXISTS roulette_rewards JSONB DEFAULT '[]'::jsonb`);
  await client.query(`ALTER TABLE vip_packages ADD COLUMN IF NOT EXISTS referral_commission_percent NUMERIC(8,4) DEFAULT 5 NOT NULL`);
  await client.query(`ALTER TABLE vip_packages ADD COLUMN IF NOT EXISTS daily_min_rate NUMERIC(8,6) DEFAULT 0.06 NOT NULL`);
  await client.query(`ALTER TABLE vip_packages ADD COLUMN IF NOT EXISTS daily_max_rate NUMERIC(8,6) DEFAULT 0.07 NOT NULL`);

  await client.query(`ALTER TABLE vip_purchases ADD COLUMN IF NOT EXISTS shots_per_hour INTEGER DEFAULT 1 NOT NULL`);
  await client.query(`ALTER TABLE vip_purchases ADD COLUMN IF NOT EXISTS referral_commission_percent NUMERIC(8,4) DEFAULT 5 NOT NULL`);
  await client.query(`ALTER TABLE vip_purchases ADD COLUMN IF NOT EXISTS daily_target_coins NUMERIC(38,0) DEFAULT 0 NOT NULL`);
  await client.query(`ALTER TABLE vip_purchases ADD COLUMN IF NOT EXISTS total_generated_coins NUMERIC(38,0) DEFAULT 0 NOT NULL`);

  await client.query(`
    CREATE TABLE IF NOT EXISTS roulette_prizes (
      id SERIAL PRIMARY KEY,
      label VARCHAR(120) NOT NULL,
      prize_type VARCHAR(30) NOT NULL DEFAULT 'coins',
      amount_usdt NUMERIC(38,18) DEFAULT 0 NOT NULL,
      credit_points INTEGER DEFAULT 0 NOT NULL,
      probability_weight NUMERIC(18,6) DEFAULT 1 NOT NULL CHECK (probability_weight >= 0),
      color_key VARCHAR(30) DEFAULT 'gold' NOT NULL,
      is_active BOOLEAN DEFAULT TRUE NOT NULL,
      sort_order INTEGER DEFAULT 0 NOT NULL,
      created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS roulette_reward_configs (
      id SERIAL PRIMARY KEY,
      vip_level INTEGER NOT NULL,
      reward_coins INTEGER NOT NULL,
      probability_weight NUMERIC(18,6) DEFAULT 1 NOT NULL CHECK (probability_weight >= 0),
      is_jackpot BOOLEAN DEFAULT FALSE NOT NULL,
      is_active BOOLEAN DEFAULT TRUE NOT NULL,
      created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(vip_level, reward_coins)
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS roulette_user_daily_state (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      daily_reward_date DATE NOT NULL,
      vip_level INTEGER NOT NULL DEFAULT 0,
      vip_purchase_id INTEGER REFERENCES vip_purchases(id) ON DELETE SET NULL,
      daily_rate NUMERIC(10,6) DEFAULT 0 NOT NULL,
      daily_target_coins NUMERIC(38,0) DEFAULT 0 NOT NULL,
      daily_earned_coins NUMERIC(38,0) DEFAULT 0 NOT NULL,
      spins_used_today INTEGER DEFAULT 0 NOT NULL,
      last_daily_reset_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, daily_reward_date)
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS roulette_hourly_usage (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      hour_block_lima TIMESTAMP WITHOUT TIME ZONE NOT NULL,
      vip_level INTEGER NOT NULL DEFAULT 0,
      shots_allowed INTEGER NOT NULL DEFAULT 1,
      shots_used INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, hour_block_lima)
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS roulette_spins (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      prize_id INTEGER,
      prize_label VARCHAR(120) NOT NULL,
      prize_type VARCHAR(30) NOT NULL DEFAULT 'coins',
      amount_usdt NUMERIC(38,18) DEFAULT 0 NOT NULL,
      credit_points INTEGER DEFAULT 0 NOT NULL,
      status VARCHAR(30) DEFAULT 'completed' NOT NULL,
      created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      metadata JSONB DEFAULT '{}'::jsonb
    )
  `);
  await client.query(`ALTER TABLE roulette_spins ADD COLUMN IF NOT EXISTS level INTEGER DEFAULT 0 NOT NULL`);
  await client.query(`ALTER TABLE roulette_spins ADD COLUMN IF NOT EXISTS animal_key VARCHAR(30) DEFAULT 'pollito' NOT NULL`);
  await client.query(`ALTER TABLE roulette_spins ADD COLUMN IF NOT EXISTS coin_amount NUMERIC(38,0) DEFAULT 0 NOT NULL`);
  await client.query(`ALTER TABLE roulette_spins ADD COLUMN IF NOT EXISTS reward_index INTEGER`);
  await client.query(`ALTER TABLE roulette_spins ADD COLUMN IF NOT EXISTS vip_purchase_id INTEGER REFERENCES vip_purchases(id) ON DELETE SET NULL`);
  await client.query(`ALTER TABLE roulette_spins ADD COLUMN IF NOT EXISTS hour_block_lima TIMESTAMP WITHOUT TIME ZONE`);
  await client.query(`ALTER TABLE roulette_spins ADD COLUMN IF NOT EXISTS daily_reward_date DATE`);
  await client.query(`ALTER TABLE roulette_spins ADD COLUMN IF NOT EXISTS daily_target_coins NUMERIC(38,0) DEFAULT 0 NOT NULL`);
  await client.query(`ALTER TABLE roulette_spins ADD COLUMN IF NOT EXISTS daily_before_coins NUMERIC(38,0) DEFAULT 0 NOT NULL`);
  await client.query(`ALTER TABLE roulette_spins ADD COLUMN IF NOT EXISTS daily_after_coins NUMERIC(38,0) DEFAULT 0 NOT NULL`);
  await client.query(`ALTER TABLE roulette_spins ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(120)`);

  await client.query(`
    CREATE TABLE IF NOT EXISTS roulette_coin_exchanges (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      coins_spent NUMERIC(38,0) NOT NULL DEFAULT 0,
      amount_usdt NUMERIC(38,18) NOT NULL DEFAULT 0,
      exchange_rate_coins INTEGER NOT NULL DEFAULT 1000,
      exchange_rate_usdt NUMERIC(18,8) NOT NULL DEFAULT 0.1,
      status VARCHAR(30) NOT NULL DEFAULT 'completed',
      created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      metadata JSONB DEFAULT '{}'::jsonb
    )
  `);

  await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_roulette_spins_user_idempotency ON roulette_spins(user_id, idempotency_key) WHERE idempotency_key IS NOT NULL`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_roulette_spins_user_created ON roulette_spins(user_id, created_at DESC)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_roulette_spins_user_day_level ON roulette_spins(user_id, level, created_at DESC)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_roulette_hourly_usage_user_block ON roulette_hourly_usage(user_id, hour_block_lima)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_roulette_daily_state_user_date ON roulette_user_daily_state(user_id, daily_reward_date DESC)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_roulette_exchanges_user_created ON roulette_coin_exchanges(user_id, created_at DESC)`);

  await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS registration_bonus_spins_remaining INTEGER DEFAULT 0 NOT NULL`);
  await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS registration_bonus_spins_granted INTEGER DEFAULT 0 NOT NULL`);

  const prizeCount = await client.query(`SELECT COUNT(*)::int AS total FROM roulette_prizes`);
  if (Number(prizeCount.rows[0]?.total || 0) === 0) {
    for (let i = 0; i < VISIBLE_REWARDS.length; i += 1) {
      await client.query(
        `INSERT INTO roulette_prizes(label,prize_type,amount_usdt,credit_points,probability_weight,color_key,sort_order,is_active)
         VALUES ($1,'coins',0,0,1,'gold',$2,true)`,
        [`${VISIBLE_REWARDS[i]} monedas`, i + 1]
      );
    }
  }

  for (const level of VIP_LEVELS) {
    await client.query(
      `INSERT INTO vip_packages(level,name,price_usdt,daily_income_usdt,valid_days,is_purchasable,task_reward_usdt,task_cooldown_minutes,task_cooldown_seconds,daily_tasks,animal_key,plan_type,daily_roulette_spins,shots_per_hour,roulette_rewards,referral_commission_percent,daily_min_rate,daily_max_rate,updated_at)
       VALUES ($1,$2,$3,0,$4,$5,0,0,0,0,$6,'roulette',$7,$7,$8::jsonb,$9,$10,$11,NOW())
       ON CONFLICT (level) DO UPDATE SET
         name=EXCLUDED.name,
         price_usdt=EXCLUDED.price_usdt,
         daily_income_usdt=0,
         valid_days=EXCLUDED.valid_days,
         is_purchasable=EXCLUDED.is_purchasable,
         task_reward_usdt=0,
         task_cooldown_minutes=0,
         task_cooldown_seconds=0,
         daily_tasks=0,
         animal_key=EXCLUDED.animal_key,
         plan_type='roulette',
         daily_roulette_spins=EXCLUDED.daily_roulette_spins,
         shots_per_hour=EXCLUDED.shots_per_hour,
         roulette_rewards=EXCLUDED.roulette_rewards,
         referral_commission_percent=EXCLUDED.referral_commission_percent,
         daily_min_rate=EXCLUDED.daily_min_rate,
         daily_max_rate=EXCLUDED.daily_max_rate,
         updated_at=NOW()`,
      [level.level, level.planName, level.priceUsdt, level.validDays, level.level > 0, level.animalKey, level.shotsPerHour, JSON.stringify(VISIBLE_REWARDS), level.referralCommissionPercent, level.dailyMinRate, level.dailyMaxRate]
    );

    for (let i = 0; i < level.rewards.length; i += 1) {
      const reward = Number(level.rewards[i]);
      const weight = Number(level.weights[i] || 0);
      await client.query(
        `INSERT INTO roulette_reward_configs(vip_level,reward_coins,probability_weight,is_jackpot,is_active,updated_at)
         VALUES ($1,$2,$3,$4,true,NOW())
         ON CONFLICT (vip_level,reward_coins) DO UPDATE SET probability_weight=EXCLUDED.probability_weight,is_jackpot=EXCLUDED.is_jackpot,is_active=true,updated_at=NOW()`,
        [level.level, reward, weight, reward === 5000]
      );
    }
  }

  await client.query(`UPDATE vip_packages SET is_purchasable=false, updated_at=NOW() WHERE level > 5`);
}

async function getActiveVipContext(client, userId) {
  await client.query(`UPDATE vip_purchases SET status='expired' WHERE user_id=$1 AND status='active' AND expires_at IS NOT NULL AND expires_at < '9999-01-01'::timestamp AND expires_at <= NOW()`, [userId]);
  const result = await client.query(
    `SELECT vp.*, p.name AS package_name, p.animal_key, p.shots_per_hour AS package_shots_per_hour, p.referral_commission_percent AS package_referral_percent, p.price_usdt AS package_price_usdt, p.valid_days AS package_valid_days
     FROM vip_purchases vp
     LEFT JOIN vip_packages p ON p.id=vp.package_id
     WHERE vp.user_id=$1 AND vp.status='active' AND vp.expires_at > NOW() AND vp.level BETWEEN 1 AND 5
     ORDER BY vp.level DESC, vp.expires_at DESC
     LIMIT 1`,
    [userId]
  );
  if (!result.rows.length) {
    const cfg = getVipLevelConfig(0);
    return { level: 0, purchase: null, config: cfg };
  }
  const purchase = result.rows[0];
  const fallback = getVipLevelConfig(Number(purchase.level));
  // IMPORTANTE:
  // La columna shots_per_hour fue agregada después con DEFAULT 1.
  // Las compras antiguas pueden conservar ese 1 aunque el usuario sea VIP 5.
  // Por eso la fuente principal debe ser la configuración del paquete actual;
  // si no existe paquete, se usa el fallback oficial del nivel.
  const packageShots = toInt(purchase.package_shots_per_hour);
  const purchaseShots = toInt(purchase.shots_per_hour);
  const resolvedShotsPerHour = packageShots || (purchaseShots > 1 ? purchaseShots : fallback.shotsPerHour);

  const config = {
    ...fallback,
    planName: purchase.package_name || fallback.planName,
    priceUsdt: toMoneyNumber(purchase.package_price_usdt || purchase.price_usdt || fallback.priceUsdt),
    validDays: toInt(purchase.package_valid_days || fallback.validDays),
    shotsPerHour: resolvedShotsPerHour,
    referralCommissionPercent: toMoneyNumber(purchase.package_referral_percent || purchase.referral_commission_percent || fallback.referralCommissionPercent),
  };
  return { level: Number(purchase.level), purchase, config };
}

async function getPlatformToday(client) {
  const result = await client.query(`SELECT (NOW() AT TIME ZONE 'America/Lima')::date AS today_lima, date_trunc('hour', NOW() AT TIME ZONE 'America/Lima') AS hour_block_lima, NOW() AT TIME ZONE 'America/Lima' AS now_lima`);
  return result.rows[0];
}

function calculateDailyTargetCoins(config) {
  const rate = randomDailyRate(config.dailyMinRate, config.dailyMaxRate);
  const targetCoins = config.level === 0
    ? toInt(config.freeDailyTargetCoins || 600)
    : Math.floor(toMoneyNumber(config.priceUsdt) * rate * COINS_PER_USDT);

  return {
    rate,
    targetCoins: Number.isFinite(targetCoins) && targetCoins > 0 ? targetCoins : 0,
  };
}

async function getOrCreateDailyState(client, userId, context) {
  const { today_lima } = await getPlatformToday(client);
  const config = context.config;
  const purchaseId = context.purchase?.id || null;
  const initial = calculateDailyTargetCoins(config);

  await client.query(
    `INSERT INTO roulette_user_daily_state(user_id,daily_reward_date,vip_level,vip_purchase_id,daily_rate,daily_target_coins,daily_earned_coins,spins_used_today,last_daily_reset_at)
     VALUES ($1,$2,$3,$4,$5,$6,0,0,NOW() AT TIME ZONE 'America/Lima')
     ON CONFLICT (user_id,daily_reward_date) DO NOTHING`,
    [userId, today_lima, context.level, purchaseId, initial.rate, initial.targetCoins]
  );

  const state = await client.query(
    `SELECT * FROM roulette_user_daily_state WHERE user_id=$1 AND daily_reward_date=$2 FOR UPDATE`,
    [userId, today_lima]
  );

  let row = state.rows[0];

  const rowLevel = Number(row.vip_level || 0);
  const rowPurchaseId = row.vip_purchase_id ? Number(row.vip_purchase_id) : null;
  const contextPurchaseId = purchaseId ? Number(purchaseId) : null;
  const mustUpgradeDailyState =
    rowLevel !== Number(context.level || 0) ||
    rowPurchaseId !== contextPurchaseId ||
    toInt(row.daily_target_coins) <= 0;

  if (mustUpgradeDailyState) {
    const recalculated = calculateDailyTargetCoins(config);
    const earned = toInt(row.daily_earned_coins || 0);
    const safeTarget = Math.max(recalculated.targetCoins, earned);

    const updated = await client.query(
      `UPDATE roulette_user_daily_state
       SET vip_level=$3,
           vip_purchase_id=$4,
           daily_rate=$5,
           daily_target_coins=$6,
           last_daily_reset_at=NOW() AT TIME ZONE 'America/Lima',
           updated_at=NOW()
       WHERE user_id=$1 AND daily_reward_date=$2
       RETURNING *`,
      [userId, today_lima, context.level, purchaseId, recalculated.rate, safeTarget]
    );

    row = updated.rows[0];
  }

  await client.query(
    `UPDATE users SET daily_reward_date=$2,daily_rate=$3,daily_target_coins=$4,daily_earned_coins=$5,spins_used_today=$6,last_daily_reset_at=$7 WHERE id=$1`,
    [userId, row.daily_reward_date, row.daily_rate, row.daily_target_coins, row.daily_earned_coins, row.spins_used_today, row.last_daily_reset_at]
  );

  return row;
}

async function getOrCreateHourlyUsage(client, userId, context) {
  const { hour_block_lima } = await getPlatformToday(client);
  await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS registration_bonus_spins_remaining INTEGER DEFAULT 0 NOT NULL`);
  await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS registration_bonus_spins_granted INTEGER DEFAULT 0 NOT NULL`);

  const bonusResult = await client.query(
    `SELECT COALESCE(registration_bonus_spins_remaining,0)::int AS bonus_remaining
     FROM users
     WHERE id=$1`,
    [userId]
  );

  const bonusRemaining = toInt(bonusResult.rows[0]?.bonus_remaining);
  const baseShots = toInt(context.config.shotsPerHour || 1);
  const desiredAllowed = bonusRemaining > 0 ? bonusRemaining : baseShots;

  await client.query(
    `INSERT INTO roulette_hourly_usage(user_id,hour_block_lima,vip_level,shots_allowed,shots_used)
     VALUES ($1,$2,$3,$4,0)
     ON CONFLICT (user_id,hour_block_lima)
     DO UPDATE SET
       vip_level=EXCLUDED.vip_level,
       shots_allowed=GREATEST(
         roulette_hourly_usage.shots_used,
         CASE
           WHEN $5::int > 0 THEN roulette_hourly_usage.shots_used + $5::int
           ELSE $4::int
         END
       ),
       updated_at=NOW()`,
    [userId, hour_block_lima, context.level, desiredAllowed, bonusRemaining]
  );

  const result = await client.query(`SELECT * FROM roulette_hourly_usage WHERE user_id=$1 AND hour_block_lima=$2 FOR UPDATE`, [userId, hour_block_lima]);
  return result.rows[0];
}

async function getRewardConfigs(client, vipLevel, jackpotEnabled = true) {
  const result = await client.query(
    `SELECT reward_coins, probability_weight, is_jackpot
     FROM roulette_reward_configs
     WHERE vip_level=$1 AND is_active=true
     ORDER BY reward_coins ASC`,
    [vipLevel]
  );
  return result.rows
    .filter((row) => jackpotEnabled || !row.is_jackpot)
    .map((row) => ({ reward: toInt(row.reward_coins), weight: Number(row.probability_weight || 0), isJackpot: Boolean(row.is_jackpot) }));
}

function selectWeightedReward({ rewardConfigs, remainingCoins, dailyTargetCoins, dailyEarnedCoins }) {
  const progress = dailyTargetCoins > 0 ? dailyEarnedCoins / dailyTargetCoins : 0;
  const available = rewardConfigs
    .filter((item) => item.reward > 0 && item.reward <= remainingCoins && item.weight > 0)
    .map((item) => {
      let weight = Number(item.weight || 0);
      if (progress >= 0.9 && item.reward >= 500) weight *= 0.08;
      else if (progress >= 0.7 && item.reward >= 1000) weight *= 0.15;
      else if (progress >= 0.7 && item.reward >= 500) weight *= 0.35;
      if (item.reward > remainingCoins * 0.7) weight *= 0.2;
      return { ...item, weight };
    })
    .filter((item) => item.weight > 0);

  if (!available.length) return Math.max(0, Math.floor(remainingCoins));
  const total = available.reduce((sum, item) => sum + Number(item.weight || 0), 0);
  let roll = Math.random() * total;
  for (const item of available) {
    roll -= Number(item.weight || 0);
    if (roll <= 0) return item.reward;
  }
  return available[available.length - 1].reward;
}


function normalizePrize(row) {
  return {
    id: row.id,
    label: row.label || `${row.reward_coins || 0} monedas`,
    prizeType: row.prize_type || "coins",
    amountUsdt: Number(row.amount_usdt || 0),
    creditPoints: Number(row.credit_points || 0),
    rewardCoins: Number(row.reward_coins || row.coin_amount || 0),
    probabilityWeight: Number(row.probability_weight || 0),
    colorKey: row.color_key || "gold",
    isActive: row.is_active !== false,
    sortOrder: Number(row.sort_order || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeSpin(row) {
  return {
    id: row.id,
    userId: row.user_id,
    prizeId: row.prize_id,
    prizeLabel: row.prize_label,
    prizeType: row.prize_type,
    amountUsdt: Number(row.amount_usdt || 0),
    creditPoints: Number(row.credit_points || 0),
    coinAmount: Number(row.coin_amount || 0),
    level: Number(row.level || 0),
    animalKey: row.animal_key || "pollito",
    rewardIndex: row.reward_index,
    status: row.status,
    idempotencyKey: row.idempotency_key,
    dailyTargetCoins: Number(row.daily_target_coins || 0),
    dailyBeforeCoins: Number(row.daily_before_coins || 0),
    dailyAfterCoins: Number(row.daily_after_coins || 0),
    hourBlockLima: row.hour_block_lima,
    dailyRewardDate: row.daily_reward_date,
    createdAt: row.created_at,
  };
}

function selectBadLuckReward() {
  const total = BAD_LUCK_REWARDS.reduce((sum, item) => sum + Number(item.weight || 0), 0);
  let roll = Math.random() * total;

  for (const item of BAD_LUCK_REWARDS) {
    roll -= Number(item.weight || 0);
    if (roll <= 0) return Number(item.reward || 20);
  }

  return 20;
}

async function buildRouletteStatus(client, userId) {
  await ensureRouletteSchema(client);
  const context = await getActiveVipContext(client, userId);
  const daily = await getOrCreateDailyState(client, userId, context);
  const hourly = await getOrCreateHourlyUsage(client, userId, context);

  const userResult = await client.query(`SELECT id, COALESCE(roulette_coins,0) AS roulette_coins, COALESCE(withdrawable_usdt,0) AS withdrawable_usdt FROM users WHERE id=$1`, [userId]);
  const history = await client.query(`SELECT * FROM roulette_spins WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20`, [userId]);
  const exchanges = await client.query(`SELECT * FROM roulette_coin_exchanges WHERE user_id=$1 ORDER BY created_at DESC LIMIT 10`, [userId]);
  const user = userResult.rows[0] || {};
  const coins = toInt(user.roulette_coins);
  const remainingCoins = Math.max(0, toInt(daily.daily_target_coins) - toInt(daily.daily_earned_coins));

  return {
    coins,
    usdt: Number(user.withdrawable_usdt || 0),
    exchange: {
      coinsPerBlock: COINS_PER_EXCHANGE_BLOCK,
      usdtPerBlock: USDT_PER_EXCHANGE_BLOCK,
      blocksAvailable: Math.floor(coins / COINS_PER_EXCHANGE_BLOCK),
      coinsConvertible: Math.floor(coins / COINS_PER_EXCHANGE_BLOCK) * COINS_PER_EXCHANGE_BLOCK,
      usdtPreview: Number((Math.floor(coins / COINS_PER_EXCHANGE_BLOCK) * USDT_PER_EXCHANGE_BLOCK).toFixed(4)),
    },
    activePurchase: context.purchase ? { id: context.purchase.id, level: Number(context.purchase.level), expiresAt: context.purchase.expires_at } : null,
    level: normalizeAnimalRouletteLevel(context.config),
    levels: VIP_LEVELS.map(normalizeAnimalRouletteLevel),
    spins: {
      usedThisHour: toInt(hourly.shots_used),
      hourly: toInt(hourly.shots_allowed),
      left: Math.max(0, toInt(hourly.shots_allowed) - toInt(hourly.shots_used)),
      hourBlockLima: hourly.hour_block_lima,
      nextBlockLabel: nextHourLabelFromLimaBlock(hourly.hour_block_lima),
    },
    daily: {
      date: daily.daily_reward_date,
      rate: Number(daily.daily_rate || 0),
      targetCoins: toInt(daily.daily_target_coins),
      earnedCoins: toInt(daily.daily_earned_coins),
      remainingCoins,
      spinsUsedToday: toInt(daily.spins_used_today),
      completed: remainingCoins <= 0,
    },
    history: history.rows.map(normalizeSpin),
    exchangeHistory: exchanges.rows.map((row) => ({ id: row.id, coinsSpent: toInt(row.coins_spent), amountUsdt: Number(row.amount_usdt || 0), status: row.status, createdAt: row.created_at })),
  };
}

async function spinRouletteBackend(client, { userId, idempotencyKey }) {
  await ensureRouletteSchema(client);
  await client.query(`SELECT id FROM users WHERE id=$1 FOR UPDATE`, [userId]);

  const key = String(idempotencyKey || crypto.randomUUID()).slice(0, 120);
  const existing = await client.query(`SELECT * FROM roulette_spins WHERE user_id=$1 AND idempotency_key=$2 LIMIT 1`, [userId, key]);
  if (existing.rows.length) {
    return { reused: true, spin: normalizeSpin(existing.rows[0]), status: await buildRouletteStatus(client, userId), reward: { coins: toInt(existing.rows[0].coin_amount), index: toInt(existing.rows[0].reward_index), level: toInt(existing.rows[0].level), animalKey: existing.rows[0].animal_key } };
  }

  const context = await getActiveVipContext(client, userId);
  const daily = await getOrCreateDailyState(client, userId, context);
  const hourly = await getOrCreateHourlyUsage(client, userId, context);

  if (toInt(hourly.shots_used) >= toInt(hourly.shots_allowed)) {
    const err = new Error(`No tienes tiros disponibles en esta hora. Tu próximo bloque de tiros estará disponible a las ${nextHourLabelFromLimaBlock(hourly.hour_block_lima)}.`);
    err.code = "HOURLY_SPINS_EXHAUSTED";
    throw err;
  }

  const dailyTarget = toInt(daily.daily_target_coins);
  const dailyEarned = toInt(daily.daily_earned_coins);
  const remainingCoins = Math.max(0, dailyTarget - dailyEarned);
  const badLuckMode = remainingCoins <= 0;

  let prize;
  if (badLuckMode) {
    prize = selectBadLuckReward();
  } else {
    const rewardConfigs = await getRewardConfigs(client, context.level, context.level === 5);
    prize = selectWeightedReward({ rewardConfigs, remainingCoins, dailyTargetCoins: dailyTarget, dailyEarnedCoins: dailyEarned });
    if (prize > remainingCoins) prize = remainingCoins;
    if (prize <= 0) prize = remainingCoins;
  }

  prize = Math.floor(prize);
  const after = dailyEarned + prize;
  const rewardIndex = getRewardIndex(prize);

  await client.query(`UPDATE roulette_hourly_usage SET shots_used=shots_used+1, updated_at=NOW() WHERE id=$1`, [hourly.id]);
  await client.query(
    `UPDATE users
     SET registration_bonus_spins_remaining=GREATEST(COALESCE(registration_bonus_spins_remaining,0)-1,0)
     WHERE id=$1 AND COALESCE(registration_bonus_spins_remaining,0) > 0`,
    [userId]
  );

  await client.query(`UPDATE roulette_user_daily_state SET daily_earned_coins=daily_earned_coins+$1, spins_used_today=spins_used_today+1, updated_at=NOW() WHERE id=$2`, [prize, daily.id]);
  await client.query(`UPDATE users SET roulette_coins=COALESCE(roulette_coins,0)+$1, daily_reward_date=$3, daily_rate=$4, daily_target_coins=$5, daily_earned_coins=$6, spins_used_today=COALESCE(spins_used_today,0)+1, last_daily_reset_at=$7 WHERE id=$2`, [prize, userId, daily.daily_reward_date, daily.daily_rate, daily.daily_target_coins, after, daily.last_daily_reset_at]);
  if (context.purchase?.id) {
    await client.query(`UPDATE vip_purchases SET total_generated_coins=COALESCE(total_generated_coins,0)+$1 WHERE id=$2`, [prize, context.purchase.id]);
  }

  const spinResult = await client.query(
    `INSERT INTO roulette_spins(user_id, prize_id, prize_label, prize_type, amount_usdt, credit_points, coin_amount, level, animal_key, reward_index, vip_purchase_id, hour_block_lima, daily_reward_date, daily_target_coins, daily_before_coins, daily_after_coins, idempotency_key, metadata)
     VALUES ($1,NULL,$2,'coins',0,0,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb)
     RETURNING *`,
    [userId, `${prize} monedas`, prize, context.level, context.config.animalKey, rewardIndex, context.purchase?.id || null, hourly.hour_block_lima, daily.daily_reward_date, dailyTarget, dailyEarned, after, key, JSON.stringify({ source: "vip_hourly_roulette", bad_luck_mode: badLuckMode, remaining_before: remainingCoins, shots_allowed: hourly.shots_allowed, shots_used_before: hourly.shots_used })]
  );

  return { reused: false, spin: normalizeSpin(spinResult.rows[0]), status: await buildRouletteStatus(client, userId), reward: { index: rewardIndex, coins: prize, level: context.level, animalKey: context.config.animalKey, badLuckMode } };
}

async function exchangeRouletteCoinsBackend(client, userId) {
  await ensureRouletteSchema(client);
  const userResult = await client.query(`SELECT id, COALESCE(roulette_coins,0) AS roulette_coins FROM users WHERE id=$1 FOR UPDATE`, [userId]);
  if (!userResult.rows.length) {
    const err = new Error("Usuario no encontrado.");
    err.code = "USER_NOT_FOUND";
    throw err;
  }
  const coins = toInt(userResult.rows[0].roulette_coins);
  const blocks = Math.floor(coins / COINS_PER_EXCHANGE_BLOCK);
  if (blocks <= 0) {
    const err = new Error(`Necesitas mínimo ${COINS_PER_EXCHANGE_BLOCK.toLocaleString("es-PE")} monedas para cambiar a USDT.`);
    err.code = "INSUFFICIENT_COINS";
    throw err;
  }
  const coinsSpent = blocks * COINS_PER_EXCHANGE_BLOCK;
  const amountUsdt = Number((blocks * USDT_PER_EXCHANGE_BLOCK).toFixed(8));

  await client.query(`UPDATE users SET roulette_coins=GREATEST(COALESCE(roulette_coins,0)-$1,0), withdrawable_usdt=COALESCE(withdrawable_usdt,0)+$2, earnings_balance_usdt=COALESCE(earnings_balance_usdt,0)+$2 WHERE id=$3`, [coinsSpent, amountUsdt, userId]);
  const exchange = await client.query(`INSERT INTO roulette_coin_exchanges(user_id,coins_spent,amount_usdt,exchange_rate_coins,exchange_rate_usdt,metadata) VALUES ($1,$2,$3,$4,$5,$6::jsonb) RETURNING *`, [userId, coinsSpent, amountUsdt, COINS_PER_EXCHANGE_BLOCK, USDT_PER_EXCHANGE_BLOCK, JSON.stringify({ source: "roulette_coin_exchange" })]);
  await client.query(`INSERT INTO account_ledger(user_id,balance_type,direction,type,title,amount_usdt,description,reference_type,reference_id,metadata,status) VALUES ($1,'withdrawable','credit','roulette_coin_exchange','Cambio de monedas ruleta',$2,$3,'roulette_coin_exchange',$4,$5::jsonb,'completed')`, [userId, amountUsdt, `${coinsSpent.toLocaleString("es-PE")} monedas cambiadas por ${amountUsdt} USDT.`, exchange.rows[0].id, JSON.stringify({ coinsSpent, amountUsdt })]);

  return { exchange: { id: exchange.rows[0].id, coinsSpent, amountUsdt }, status: await buildRouletteStatus(client, userId) };
}

module.exports = {
  TIMEZONE,
  COINS_PER_USDT,
  COINS_PER_EXCHANGE_BLOCK,
  USDT_PER_EXCHANGE_BLOCK,
  VISIBLE_REWARDS,
  REGISTRATION_BONUS_SPINS,
  VIP_LEVELS,
  ANIMAL_ROULETTE_LEVELS: VIP_LEVELS,
  ensureRouletteSchema,
  getVipLevelConfig,
  getAnimalRouletteLevel: getVipLevelConfig,
  normalizeAnimalRouletteLevel,
  normalizePrize,
  normalizeSpin,
  buildRouletteStatus,
  spinRouletteBackend,
  exchangeRouletteCoinsBackend,
};

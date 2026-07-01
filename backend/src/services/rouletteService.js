async function ensureRouletteSchema(client) {
  await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS roulette_points INTEGER DEFAULT 0 NOT NULL`);
  await client.query(`
    CREATE TABLE IF NOT EXISTS roulette_prizes (
      id SERIAL PRIMARY KEY,
      label VARCHAR(120) NOT NULL,
      prize_type VARCHAR(30) NOT NULL DEFAULT 'withdrawable' CHECK (prize_type IN ('withdrawable','recharge','credit_points','none')),
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
  await client.query(`CREATE INDEX IF NOT EXISTS idx_roulette_prizes_active_order ON roulette_prizes(is_active, sort_order, id)`);
  await client.query(`
    CREATE TABLE IF NOT EXISTS roulette_spins (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      prize_id INTEGER REFERENCES roulette_prizes(id) ON DELETE SET NULL,
      prize_label VARCHAR(120) NOT NULL,
      prize_type VARCHAR(30) NOT NULL,
      amount_usdt NUMERIC(38,18) DEFAULT 0 NOT NULL,
      credit_points INTEGER DEFAULT 0 NOT NULL,
      status VARCHAR(30) DEFAULT 'completed' NOT NULL,
      created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      metadata JSONB DEFAULT '{}'::jsonb
    )
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_roulette_spins_user_created ON roulette_spins(user_id, created_at DESC)`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_roulette_spins_created ON roulette_spins(created_at DESC)`);

  const count = await client.query(`SELECT COUNT(*)::int AS total FROM roulette_prizes`);
  if (Number(count.rows[0]?.total || 0) === 0) {
    await client.query(`
      INSERT INTO roulette_prizes(label,prize_type,amount_usdt,probability_weight,color_key,sort_order,is_active) VALUES
      ('0.5 USDT','withdrawable',0.5,70,'green',1,true),
      ('1 USDT','withdrawable',1,18,'blue',2,true),
      ('5 USDT','withdrawable',5,7,'purple',3,true),
      ('10 USDT','withdrawable',10,3,'gold',4,true),
      ('20 USDT','withdrawable',20,1.2,'pink',5,true),
      ('30 USDT','withdrawable',30,0.6,'orange',6,true),
      ('50 USDT','withdrawable',50,0.2,'red',7,true)
    `);
  }
}

function normalizePrize(row) {
  return {
    id: row.id,
    label: row.label,
    prizeType: row.prize_type,
    amountUsdt: Number(row.amount_usdt || 0),
    creditPoints: Number(row.credit_points || 0),
    probabilityWeight: Number(row.probability_weight || 0),
    colorKey: row.color_key || 'gold',
    isActive: row.is_active,
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
    status: row.status,
    createdAt: row.created_at,
    userEmail: row.email,
    referralCode: row.referral_code,
  };
}

function pickPrize(prizes) {
  const active = prizes.filter((p) => Number(p.probability_weight || 0) > 0);
  const total = active.reduce((sum, item) => sum + Number(item.probability_weight || 0), 0);
  if (!active.length || total <= 0) return null;
  let roll = Math.random() * total;
  for (const prize of active) {
    roll -= Number(prize.probability_weight || 0);
    if (roll <= 0) return prize;
  }
  return active[active.length - 1];
}

module.exports = { ensureRouletteSchema, normalizePrize, normalizeSpin, pickPrize };

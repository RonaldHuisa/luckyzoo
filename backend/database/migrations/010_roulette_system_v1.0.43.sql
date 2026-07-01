-- Royal Imperial AI v1.0.43
-- Sistema de ruleta con puntos de giro, premios configurables e historial.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS roulette_points INTEGER DEFAULT 0 NOT NULL;

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
);

CREATE INDEX IF NOT EXISTS idx_roulette_prizes_active_order ON roulette_prizes(is_active, sort_order, id);

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
);

CREATE INDEX IF NOT EXISTS idx_roulette_spins_user_created ON roulette_spins(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_roulette_spins_created ON roulette_spins(created_at DESC);

INSERT INTO roulette_prizes(label,prize_type,amount_usdt,probability_weight,color_key,sort_order,is_active)
SELECT * FROM (VALUES
  ('0.5 USDT','withdrawable',0.5::numeric,70::numeric,'green',1,true),
  ('1 USDT','withdrawable',1::numeric,18::numeric,'blue',2,true),
  ('5 USDT','withdrawable',5::numeric,7::numeric,'purple',3,true),
  ('10 USDT','withdrawable',10::numeric,3::numeric,'gold',4,true),
  ('20 USDT','withdrawable',20::numeric,1.2::numeric,'pink',5,true),
  ('30 USDT','withdrawable',30::numeric,0.6::numeric,'orange',6,true),
  ('50 USDT','withdrawable',50::numeric,0.2::numeric,'red',7,true)
) AS defaults(label,prize_type,amount_usdt,probability_weight,color_key,sort_order,is_active)
WHERE NOT EXISTS (SELECT 1 FROM roulette_prizes);

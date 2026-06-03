-- Motor de minería por inversión / hash simulado
-- Ejecutar en pgAdmin sobre la base GreenVest antes de iniciar el backend.

CREATE TABLE IF NOT EXISTS mining_plans (
  id SERIAL PRIMARY KEY,
  level INTEGER NOT NULL UNIQUE,
  name VARCHAR(50) NOT NULL,
  min_amount NUMERIC(38,18) NOT NULL,
  max_amount NUMERIC(38,18),
  daily_percent NUMERIC(12,6) NOT NULL,
  duration_hours INTEGER NOT NULL DEFAULT 24,
  window_days INTEGER NOT NULL DEFAULT 120,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

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
);

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
);

CREATE INDEX IF NOT EXISTS idx_mining_accounts_user_id ON mining_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_mining_claims_user_id ON mining_claims(user_id);
CREATE INDEX IF NOT EXISTS idx_mining_claims_claimed_at ON mining_claims(claimed_at DESC);

INSERT INTO mining_plans (level, name, min_amount, max_amount, daily_percent, duration_hours, window_days, is_active)
VALUES
(1, 'GreenVest-1', 5, 150, 8.00, 24, 120, true),
(2, 'GreenVest-2', 150, 300, 8.50, 24, 120, true),
(3, 'GreenVest-3', 300, 800, 9.00, 24, 120, true),
(4, 'GreenVest-4', 800, 1500, 10.00, 24, 120, true),
(5, 'GreenVest-5', 1500, 4000, 11.00, 24, 120, true),
(6, 'GreenVest-6', 4000, 8000, 12.00, 24, 120, true),
(7, 'GreenVest-7', 8000, 15000, 13.00, 24, 120, true),
(8, 'GreenVest-8', 15000, NULL, 14.00, 24, 120, true)
ON CONFLICT (level) DO UPDATE SET
  name = EXCLUDED.name,
  min_amount = EXCLUDED.min_amount,
  max_amount = EXCLUDED.max_amount,
  daily_percent = EXCLUDED.daily_percent,
  duration_hours = EXCLUDED.duration_hours,
  window_days = EXCLUDED.window_days,
  is_active = true,
  updated_at = CURRENT_TIMESTAMP;

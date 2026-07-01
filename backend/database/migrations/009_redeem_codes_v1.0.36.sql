
-- Royal Imperial AI v1.0.36
-- Códigos de canje para saldo de garantía o saldo retirable.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS credit_points INTEGER DEFAULT 100 NOT NULL;

CREATE TABLE IF NOT EXISTS redeem_codes (
  id SERIAL PRIMARY KEY,
  code VARCHAR(40) NOT NULL UNIQUE,
  balance_type VARCHAR(30) NOT NULL CHECK (balance_type IN ('recharge','withdrawable')),
  amount_usdt NUMERIC(38,18) NOT NULL CHECK (amount_usdt > 0),
  max_uses INTEGER NOT NULL DEFAULT 1 CHECK (max_uses > 0),
  used_count INTEGER NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  expires_at TIMESTAMP WITHOUT TIME ZONE,
  note TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_redeem_codes_active ON redeem_codes(is_active, expires_at);
CREATE INDEX IF NOT EXISTS idx_redeem_codes_created ON redeem_codes(created_at DESC);

CREATE TABLE IF NOT EXISTS redeem_code_redemptions (
  id SERIAL PRIMARY KEY,
  code_id INTEGER NOT NULL REFERENCES redeem_codes(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  balance_type VARCHAR(30) NOT NULL CHECK (balance_type IN ('recharge','withdrawable')),
  amount_usdt NUMERIC(38,18) NOT NULL CHECK (amount_usdt > 0),
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(code_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_redeem_redemptions_user ON redeem_code_redemptions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_redeem_redemptions_code ON redeem_code_redemptions(code_id, created_at DESC);

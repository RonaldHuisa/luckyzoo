-- Royal Imperial AI v1.0.15
-- Datos personales, cuentas de retiro y validación admin para retiros.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS full_name VARCHAR(160),
  ADD COLUMN IF NOT EXISTS phone_country_iso VARCHAR(8),
  ADD COLUMN IF NOT EXISTS phone_country_name VARCHAR(80),
  ADD COLUMN IF NOT EXISTS phone_country_code VARCHAR(8),
  ADD COLUMN IF NOT EXISTS phone_number VARCHAR(24),
  ADD COLUMN IF NOT EXISTS withdraw_enabled BOOLEAN DEFAULT FALSE NOT NULL,
  ADD COLUMN IF NOT EXISTS withdraw_enabled_at TIMESTAMP WITHOUT TIME ZONE,
  ADD COLUMN IF NOT EXISTS withdraw_enabled_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS withdraw_enabled_note TEXT;

CREATE TABLE IF NOT EXISTS user_withdrawal_accounts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  network VARCHAR(50) NOT NULL CHECK (network IN ('BEP20-USDT','POLYGON-USDT')),
  label VARCHAR(120),
  withdrawal_address TEXT NOT NULL,
  is_default BOOLEAN DEFAULT FALSE NOT NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, network)
);

CREATE INDEX IF NOT EXISTS idx_user_withdrawal_accounts_user
ON user_withdrawal_accounts(user_id, is_default DESC, id);

-- Migra direcciones BEP20 antiguas si existen.
INSERT INTO user_withdrawal_accounts(user_id, network, label, withdrawal_address, is_default)
SELECT id, 'BEP20-USDT', 'BEP20-USDT', withdrawal_address_bep20, true
FROM users
WHERE withdrawal_address_bep20 IS NOT NULL
  AND TRIM(withdrawal_address_bep20) <> ''
ON CONFLICT (user_id, network) DO NOTHING;

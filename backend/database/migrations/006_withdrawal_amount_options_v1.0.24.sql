-- Royal Imperial AI v1.0.24
-- Montos fijos de retiro configurables desde Admin.

CREATE TABLE IF NOT EXISTS withdrawal_amount_options (
  id SERIAL PRIMARY KEY,
  amount_usdt NUMERIC(38,18) NOT NULL,
  label VARCHAR(80) NOT NULL,
  sort_order INTEGER DEFAULT 0 NOT NULL,
  is_active BOOLEAN DEFAULT TRUE NOT NULL,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_withdrawal_amount_options_active_order
ON withdrawal_amount_options(is_active, sort_order, amount_usdt);

INSERT INTO withdrawal_amount_options(amount_usdt, label, sort_order, is_active)
SELECT * FROM (VALUES
  (10::numeric, '10 USDT', 1, true),
  (30::numeric, '30 USDT', 2, true),
  (80::numeric, '80 USDT', 3, true),
  (200::numeric, '200 USDT', 4, true),
  (500::numeric, '500 USDT', 5, true),
  (1000::numeric, '1000 USDT', 6, true),
  (2000::numeric, '2000 USDT', 7, true),
  (3000::numeric, '3000 USDT', 8, true)
) AS seed(amount_usdt, label, sort_order, is_active)
WHERE NOT EXISTS (SELECT 1 FROM withdrawal_amount_options);

ALTER TABLE withdrawals ALTER COLUMN fee_percent SET DEFAULT 10;

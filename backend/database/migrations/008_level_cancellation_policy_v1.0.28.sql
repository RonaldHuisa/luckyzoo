-- Royal Imperial AI v1.0.28
-- Un plan activo por usuario, cancelación con comisión y bloqueo de planes inferiores por historial.

ALTER TABLE vip_purchases
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP WITHOUT TIME ZONE,
  ADD COLUMN IF NOT EXISTS cancel_fee_percent NUMERIC(8,4) DEFAULT 10,
  ADD COLUMN IF NOT EXISTS cancel_fee_usdt NUMERIC(38,18) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refund_usdt NUMERIC(38,18) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_vip_purchases_user_level_history
ON vip_purchases(user_id, level, status, expires_at DESC);

-- Duración base solicitada para planes activos: 5 meses aprox. (150 días).
-- Solo actualiza valores antiguos de 30 días para respetar ajustes manuales posteriores.
UPDATE vip_packages
SET valid_days = 150, updated_at = NOW()
WHERE level >= 1 AND valid_days = 30;

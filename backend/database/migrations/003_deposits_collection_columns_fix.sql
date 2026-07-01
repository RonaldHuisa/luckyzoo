-- Royal Imperial AI v1.0.5
-- Corrige columnas usadas por el panel Admin de Recargas/Recolección.
-- Ejecutar en bases DEV existentes creadas antes de v1.0.5.

ALTER TABLE deposits
  ADD COLUMN IF NOT EXISTS bnb_topup_tx_hash VARCHAR(255),
  ADD COLUMN IF NOT EXISTS swept_at TIMESTAMP WITHOUT TIME ZONE;

-- Asegura tamaño suficiente para hashes antiguos/nuevos.
ALTER TABLE deposits
  ALTER COLUMN sweep_tx_hash TYPE VARCHAR(255),
  ALTER COLUMN tx_hash TYPE VARCHAR(255),
  ALTER COLUMN token_contract TYPE VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_deposits_sweep_status
ON deposits(sweep_status);

CREATE INDEX IF NOT EXISTS idx_deposits_bnb_topup_tx_hash
ON deposits(bnb_topup_tx_hash);

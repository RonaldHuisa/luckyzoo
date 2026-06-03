-- Permite usar la misma wallet EVM en BSC y Polygon, con una fila por red.
-- Ejecutar una vez en producción si tu schema venía con UNIQUE(address).

BEGIN;

ALTER TABLE public.wallets
DROP CONSTRAINT IF EXISTS wallets_address_key;

CREATE UNIQUE INDEX IF NOT EXISTS wallets_network_address_lower_key
ON public.wallets (network, LOWER(address));

-- Backfill: por cada wallet BEP20 existente, crea su fila POLYGON con la misma address/key.
INSERT INTO public.wallets (
  user_id,
  network,
  address,
  public_key,
  private_key_encrypted,
  created_at,
  last_scanned_block
)
SELECT
  w.user_id,
  'POLYGON-USDT',
  w.address,
  w.public_key,
  w.private_key_encrypted,
  NOW(),
  0
FROM public.wallets w
WHERE w.network = 'BEP20-USDT'
  AND NOT EXISTS (
    SELECT 1
    FROM public.wallets wp
    WHERE wp.user_id = w.user_id
      AND wp.network = 'POLYGON-USDT'
      AND LOWER(wp.address) = LOWER(w.address)
  );

COMMIT;

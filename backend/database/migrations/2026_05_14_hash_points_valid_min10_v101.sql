BEGIN;

-- =========================================================
-- GreenVest v101
-- Invitado válido = directo con inversión/recarga >= 10 USDT
-- 1 punto canjeado = +0.05% hash
-- Corrige registros antiguos que quedaron válidos con 5 USDT.
-- =========================================================

-- Reglas de minería actuales.
UPDATE public.mining_plans
SET
  daily_percent = CASE level
    WHEN 1 THEN 3.00
    WHEN 2 THEN 3.30
    WHEN 3 THEN 3.60
    WHEN 4 THEN 4.00
    WHEN 5 THEN 4.30
    WHEN 6 THEN 4.60
    WHEN 7 THEN 5.00
    WHEN 8 THEN 5.50
  END,
  min_amount = CASE level
    WHEN 1 THEN 5.00
    WHEN 2 THEN 150.00
    WHEN 3 THEN 300.00
    WHEN 4 THEN 800.00
    WHEN 5 THEN 1500.00
    WHEN 6 THEN 4000.00
    WHEN 7 THEN 8000.00
    WHEN 8 THEN 15000.00
  END,
  max_amount = CASE level
    WHEN 1 THEN 150.00
    WHEN 2 THEN 300.00
    WHEN 3 THEN 800.00
    WHEN 4 THEN 1500.00
    WHEN 5 THEN 4000.00
    WHEN 6 THEN 8000.00
    WHEN 7 THEN 15000.00
    WHEN 8 THEN NULL
  END,
  duration_hours = 24,
  window_days = 120,
  is_active = true,
  updated_at = NOW()
WHERE level BETWEEN 1 AND 8;

-- Si existe vip_packages, mantener compatibilidad.
UPDATE public.vip_packages
SET
  daily_income_usdt = CASE level
    WHEN 1 THEN 0.15
    WHEN 2 THEN 4.95
    WHEN 3 THEN 10.80
    WHEN 4 THEN 32.00
    WHEN 5 THEN 64.50
    WHEN 6 THEN 184.00
    WHEN 7 THEN 400.00
    WHEN 8 THEN 825.00
  END,
  task_reward_usdt = CASE level
    WHEN 1 THEN 0.15
    WHEN 2 THEN 4.95
    WHEN 3 THEN 10.80
    WHEN 4 THEN 32.00
    WHEN 5 THEN 64.50
    WHEN 6 THEN 184.00
    WHEN 7 THEN 400.00
    WHEN 8 THEN 825.00
  END,
  valid_days = 120,
  is_purchasable = true
WHERE level BETWEEN 1 AND 8;

-- Asegurar filas user_hash_points para todos los usuarios que puedan tener referidos.
INSERT INTO public.user_hash_points (
  user_id,
  available_points,
  redeemed_points,
  hash_bonus_percent,
  max_bonus_percent,
  created_at,
  updated_at
)
SELECT id, 0, 0, 0, 5.00, NOW(), NOW()
FROM public.users
ON CONFLICT (user_id) DO NOTHING;

-- Actualizar / crear hash_point_referrals para referidos directos válidos actuales.
WITH direct_referrals AS (
  SELECT
    ref.id AS referrer_user_id,
    r.id AS referred_user_id,
    GREATEST(
      COALESCE(MAX(ma.invested_amount), 0),
      COALESCE(MAX(r.recharge_balance_usdt), 0),
      COALESCE(MAX(r.balance_usdt), 0)
    ) AS invested_amount
  FROM public.users r
  JOIN public.users ref ON ref.id = r.referred_by_id
  LEFT JOIN public.mining_accounts ma ON ma.user_id = r.id AND ma.status IN ('active', 'completed')
  GROUP BY ref.id, r.id
), valid_referrals AS (
  SELECT *
  FROM direct_referrals
  WHERE invested_amount >= 10.00
), upsert_valid AS (
  INSERT INTO public.hash_point_referrals (
    referrer_user_id,
    referred_user_id,
    invested_amount,
    points_awarded,
    status,
    created_at
  )
  SELECT
    referrer_user_id,
    referred_user_id,
    invested_amount,
    1,
    'awarded',
    NOW()
  FROM valid_referrals
  ON CONFLICT (referrer_user_id, referred_user_id) DO UPDATE SET
    invested_amount = EXCLUDED.invested_amount,
    status = 'awarded'
  RETURNING id
)
UPDATE public.hash_point_referrals hpr
SET
  invested_amount = dr.invested_amount,
  status = CASE WHEN dr.invested_amount >= 10.00 THEN 'awarded' ELSE 'revoked' END
FROM direct_referrals dr
WHERE hpr.referrer_user_id = dr.referrer_user_id
  AND hpr.referred_user_id = dr.referred_user_id;

-- Recalcular puntos por usuario usando SOLO status awarded.
WITH valid_counts AS (
  SELECT
    referrer_user_id AS user_id,
    COUNT(*)::integer AS valid_points
  FROM public.hash_point_referrals
  WHERE status = 'awarded'
  GROUP BY referrer_user_id
), normalized AS (
  SELECT
    hp.user_id,
    COALESCE(vc.valid_points, 0) AS valid_points,
    LEAST(COALESCE(hp.redeemed_points, 0), COALESCE(vc.valid_points, 0)) AS new_redeemed,
    COALESCE(hp.max_bonus_percent, 5.00) AS max_bonus
  FROM public.user_hash_points hp
  LEFT JOIN valid_counts vc ON vc.user_id = hp.user_id
)
UPDATE public.user_hash_points hp
SET
  redeemed_points = n.new_redeemed,
  available_points = GREATEST(n.valid_points - n.new_redeemed, 0),
  hash_bonus_percent = LEAST(n.max_bonus, n.new_redeemed * 0.05),
  max_bonus_percent = 5.00,
  updated_at = NOW()
FROM normalized n
WHERE hp.user_id = n.user_id;

COMMIT;

-- Validación:
-- SELECT * FROM public.user_hash_points ORDER BY user_id;
-- SELECT referrer_user_id, referred_user_id, invested_amount, status FROM public.hash_point_referrals ORDER BY referrer_user_id, referred_user_id;

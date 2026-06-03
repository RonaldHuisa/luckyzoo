BEGIN;

-- =========================================================
-- GreenVest v100: mínimo requerido para punto hash = 10 USDT
-- Cada punto canjeado = +0.05% hash
-- Máximo bonus = +5.00%
-- =========================================================

-- 1) Actualizar tasas mineras actuales, manteniendo rangos existentes.
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

-- 2) Compatibilidad con tabla antigua vip_packages, si existe.
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

-- 3) Recalcular qué invitados son válidos con mínimo 10 USDT.
--    Usa el mayor valor entre inversión minera, saldo total y saldo de recarga.
WITH referral_current AS (
  SELECT
    hpr.id,
    hpr.referrer_user_id,
    hpr.referred_user_id,
    GREATEST(
      COALESCE(MAX(ma.invested_amount), 0),
      COALESCE(MAX(u.balance_usdt), 0),
      COALESCE(MAX(u.recharge_balance_usdt), 0)
    ) AS current_invested
  FROM public.hash_point_referrals hpr
  JOIN public.users u ON u.id = hpr.referred_user_id
  LEFT JOIN public.mining_accounts ma ON ma.user_id = u.id
  GROUP BY hpr.id, hpr.referrer_user_id, hpr.referred_user_id
), updated_referrals AS (
  UPDATE public.hash_point_referrals hpr
  SET invested_amount = rc.current_invested
  FROM referral_current rc
  WHERE hpr.id = rc.id
  RETURNING hpr.id, rc.current_invested
)
DELETE FROM public.hash_point_referrals hpr
USING updated_referrals ur
WHERE hpr.id = ur.id
  AND ur.current_invested < 10.00;

-- 4) Asegurar filas en user_hash_points para usuarios con invitados válidos.
INSERT INTO public.user_hash_points (
  user_id,
  available_points,
  redeemed_points,
  hash_bonus_percent,
  max_bonus_percent,
  created_at,
  updated_at
)
SELECT
  hpr.referrer_user_id,
  COUNT(*)::integer,
  0,
  0,
  5.00,
  NOW(),
  NOW()
FROM public.hash_point_referrals hpr
WHERE hpr.status = 'awarded'
GROUP BY hpr.referrer_user_id
ON CONFLICT (user_id) DO NOTHING;

-- 5) Recalcular puntos disponibles/canjeados con regla de 10 USDT.
WITH valid_counts AS (
  SELECT
    hpr.referrer_user_id AS user_id,
    COUNT(*)::integer AS valid_points
  FROM public.hash_point_referrals hpr
  WHERE hpr.status = 'awarded'
  GROUP BY hpr.referrer_user_id
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
  max_bonus_percent = n.max_bonus,
  updated_at = NOW()
FROM normalized n
WHERE hp.user_id = n.user_id;

COMMIT;

-- Validación rápida:
-- SELECT level, name, min_amount, max_amount, daily_percent FROM public.mining_plans ORDER BY level;
-- SELECT * FROM public.user_hash_points ORDER BY user_id;
-- SELECT * FROM public.hash_point_referrals ORDER BY referrer_user_id, referred_user_id;

BEGIN;

-- =========================================================
-- GreenVest v99: tasas mineras + puntos hash
-- Rangos actuales se mantienen:
-- 5-150, 150-300, 300-800, 800-1500, 1500-4000,
-- 4000-8000, 8000-15000, 15000+
-- =========================================================

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

-- Compatibilidad con tabla antigua vip_packages, si existe.
UPDATE public.vip_packages
SET
  daily_income_usdt = CASE level
    WHEN 1 THEN 0.15      -- 5 x 3.0%
    WHEN 2 THEN 4.95      -- 150 x 3.3%
    WHEN 3 THEN 10.80     -- 300 x 3.6%
    WHEN 4 THEN 32.00     -- 800 x 4.0%
    WHEN 5 THEN 64.50     -- 1500 x 4.3%
    WHEN 6 THEN 184.00    -- 4000 x 4.6%
    WHEN 7 THEN 400.00    -- 8000 x 5.0%
    WHEN 8 THEN 825.00    -- 15000 x 5.5%
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

-- Ajuste de puntos hash:
-- cada punto canjeado ahora equivale a +0.05%.
-- Esto normaliza usuarios existentes para que redeemed_points refleje la nueva regla.
UPDATE public.user_hash_points
SET
  hash_bonus_percent = LEAST(COALESCE(max_bonus_percent, 5.00), COALESCE(redeemed_points, 0) * 0.05),
  updated_at = NOW();

COMMIT;

-- Validación rápida:
-- SELECT level, name, min_amount, max_amount, daily_percent, window_days FROM public.mining_plans ORDER BY level;
-- SELECT user_id, available_points, redeemed_points, hash_bonus_percent, max_bonus_percent FROM public.user_hash_points ORDER BY user_id;

BEGIN;

-- GreenVest V1: planes VIP con ganancia fija diaria, sin porcentajes visibles.
ALTER TABLE public.mining_plans
  ADD COLUMN IF NOT EXISTS daily_reward_usdt NUMERIC(38,18) NOT NULL DEFAULT 0;

INSERT INTO public.mining_plans
  (level, name, min_amount, max_amount, daily_percent, daily_reward_usdt, duration_hours, window_days, is_active, updated_at)
VALUES
  (1, 'GreenVest-1', 10.00, 30.00, 0, 0.40, 24, 30, true, NOW()),
  (2, 'GreenVest-2', 30.00, 80.00, 0, 1.50, 24, 30, true, NOW()),
  (3, 'GreenVest-3', 80.00, 150.00, 0, 4.20, 24, 30, true, NOW()),
  (4, 'GreenVest-4', 150.00, 350.00, 0, 8.50, 24, 30, true, NOW()),
  (5, 'GreenVest-5', 350.00, 800.00, 0, 22.00, 24, 30, true, NOW()),
  (6, 'GreenVest-6', 800.00, 1500.00, 0, 55.00, 24, 30, true, NOW()),
  (7, 'GreenVest-7', 1500.00, 4000.00, 0, 110.00, 24, 30, true, NOW()),
  (8, 'GreenVest-8', 4000.00, NULL, 0, 320.00, 24, 30, true, NOW())
ON CONFLICT (level) DO UPDATE SET
  name = EXCLUDED.name,
  min_amount = EXCLUDED.min_amount,
  max_amount = EXCLUDED.max_amount,
  daily_percent = 0,
  daily_reward_usdt = EXCLUDED.daily_reward_usdt,
  duration_hours = EXCLUDED.duration_hours,
  window_days = EXCLUDED.window_days,
  is_active = true,
  updated_at = NOW();

UPDATE public.mining_plans
SET is_active = false, updated_at = NOW()
WHERE level > 8;

-- Recalcular cuentas mineras existentes al nuevo esquema fijo.
WITH plan_match AS (
  SELECT
    ma.id AS mining_account_id,
    mp.id AS plan_id,
    mp.daily_reward_usdt
  FROM public.mining_accounts ma
  JOIN public.mining_plans mp
    ON mp.is_active = true
   AND ma.invested_amount >= mp.min_amount
   AND (mp.max_amount IS NULL OR ma.invested_amount < mp.max_amount)
)
UPDATE public.mining_accounts ma
SET
  current_plan_id = pm.plan_id,
  daily_percent = 0,
  daily_reward = pm.daily_reward_usdt,
  status = CASE WHEN ma.invested_amount >= 10 THEN 'active' ELSE 'inactive' END,
  updated_at = NOW()
FROM plan_match pm
WHERE ma.id = pm.mining_account_id;

UPDATE public.mining_accounts
SET
  current_plan_id = NULL,
  daily_percent = 0,
  daily_reward = 0,
  status = 'inactive',
  updated_at = NOW()
WHERE invested_amount < 10;

-- Compatibilidad con vip_packages si tu PRD todavía muestra/usa esta tabla.
UPDATE public.vip_packages
SET
  name = CASE level
    WHEN 1 THEN 'GreenVest-1'
    WHEN 2 THEN 'GreenVest-2'
    WHEN 3 THEN 'GreenVest-3'
    WHEN 4 THEN 'GreenVest-4'
    WHEN 5 THEN 'GreenVest-5'
    WHEN 6 THEN 'GreenVest-6'
    WHEN 7 THEN 'GreenVest-7'
    WHEN 8 THEN 'GreenVest-8'
    ELSE name
  END,
  price_usdt = CASE level
    WHEN 1 THEN 10.00
    WHEN 2 THEN 30.00
    WHEN 3 THEN 80.00
    WHEN 4 THEN 150.00
    WHEN 5 THEN 350.00
    WHEN 6 THEN 800.00
    WHEN 7 THEN 1500.00
    WHEN 8 THEN 4000.00
    ELSE price_usdt
  END,
  daily_income_usdt = CASE level
    WHEN 1 THEN 0.40
    WHEN 2 THEN 1.50
    WHEN 3 THEN 4.20
    WHEN 4 THEN 8.50
    WHEN 5 THEN 22.00
    WHEN 6 THEN 55.00
    WHEN 7 THEN 110.00
    WHEN 8 THEN 320.00
    ELSE daily_income_usdt
  END,
  task_reward_usdt = CASE level
    WHEN 1 THEN 0.40
    WHEN 2 THEN 1.50
    WHEN 3 THEN 4.20
    WHEN 4 THEN 8.50
    WHEN 5 THEN 22.00
    WHEN 6 THEN 55.00
    WHEN 7 THEN 110.00
    WHEN 8 THEN 320.00
    ELSE task_reward_usdt
  END,
  valid_days = 30,
  task_cooldown_minutes = 1440,
  is_purchasable = true
WHERE level BETWEEN 1 AND 8;

COMMIT;

-- Validación rápida:
-- SELECT level, name, min_amount, max_amount, daily_reward_usdt, window_days FROM public.mining_plans ORDER BY level;

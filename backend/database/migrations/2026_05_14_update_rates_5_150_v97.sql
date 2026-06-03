-- GreenVest v97 - Rangos definitivos de planes y compatibilidad VIP
-- Ejecutar en producción después de desplegar backend v97.

BEGIN;

UPDATE public.mining_plans
SET
  name = CASE level
    WHEN 1 THEN 'GreenVest-1' WHEN 2 THEN 'GreenVest-2' WHEN 3 THEN 'GreenVest-3' WHEN 4 THEN 'GreenVest-4'
    WHEN 5 THEN 'GreenVest-5' WHEN 6 THEN 'GreenVest-6' WHEN 7 THEN 'GreenVest-7' WHEN 8 THEN 'GreenVest-8' ELSE name END,
  min_amount = CASE level
    WHEN 1 THEN 5.00 WHEN 2 THEN 150.00 WHEN 3 THEN 300.00 WHEN 4 THEN 800.00
    WHEN 5 THEN 1500.00 WHEN 6 THEN 4000.00 WHEN 7 THEN 8000.00 WHEN 8 THEN 15000.00 ELSE min_amount END,
  max_amount = CASE level
    WHEN 1 THEN 150.00 WHEN 2 THEN 300.00 WHEN 3 THEN 800.00 WHEN 4 THEN 1500.00
    WHEN 5 THEN 4000.00 WHEN 6 THEN 8000.00 WHEN 7 THEN 15000.00 WHEN 8 THEN NULL ELSE max_amount END,
  daily_percent = CASE level
    WHEN 1 THEN 8.00 WHEN 2 THEN 8.50 WHEN 3 THEN 9.00 WHEN 4 THEN 10.00
    WHEN 5 THEN 11.00 WHEN 6 THEN 12.00 WHEN 7 THEN 13.00 WHEN 8 THEN 14.00 ELSE daily_percent END,
  duration_hours = 24,
  window_days = 120,
  is_active = true,
  updated_at = NOW()
WHERE level BETWEEN 1 AND 8;

UPDATE public.vip_packages
SET
  name = CASE level
    WHEN 1 THEN 'GreenVest-1' WHEN 2 THEN 'GreenVest-2' WHEN 3 THEN 'GreenVest-3' WHEN 4 THEN 'GreenVest-4'
    WHEN 5 THEN 'GreenVest-5' WHEN 6 THEN 'GreenVest-6' WHEN 7 THEN 'GreenVest-7' WHEN 8 THEN 'GreenVest-8' ELSE name END,
  price_usdt = CASE level
    WHEN 1 THEN 5.00 WHEN 2 THEN 150.00 WHEN 3 THEN 300.00 WHEN 4 THEN 800.00
    WHEN 5 THEN 1500.00 WHEN 6 THEN 4000.00 WHEN 7 THEN 8000.00 WHEN 8 THEN 15000.00 ELSE price_usdt END,
  daily_income_usdt = CASE level
    WHEN 1 THEN 0.40 WHEN 2 THEN 12.75 WHEN 3 THEN 27.00 WHEN 4 THEN 80.00
    WHEN 5 THEN 165.00 WHEN 6 THEN 480.00 WHEN 7 THEN 1040.00 WHEN 8 THEN 2100.00 ELSE daily_income_usdt END,
  task_reward_usdt = CASE level
    WHEN 1 THEN 0.40 WHEN 2 THEN 12.75 WHEN 3 THEN 27.00 WHEN 4 THEN 80.00
    WHEN 5 THEN 165.00 WHEN 6 THEN 480.00 WHEN 7 THEN 1040.00 WHEN 8 THEN 2100.00 ELSE task_reward_usdt END,
  task_cooldown_minutes = 1440,
  valid_days = 120,
  is_purchasable = true
WHERE level BETWEEN 1 AND 8;

COMMIT;

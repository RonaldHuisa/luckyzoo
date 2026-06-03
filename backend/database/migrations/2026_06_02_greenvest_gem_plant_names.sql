-- GreenVest V1.1 - nombres por imagen/gema para plantas
-- Ejecutar en PRD/DEV si la base ya tenía los nombres anteriores.

INSERT INTO public.vip_packages
  (level, name, price_usdt, daily_income_usdt, valid_days, task_reward_usdt, task_cooldown_minutes, is_purchasable, updated_at)
VALUES
  (0, 'Brote de Pasantía', 0, 0.30, 3, 0.075, 360, false, CURRENT_TIMESTAMP),
  (1, 'Planta Esmeralda', 10, 0.68, 30, 0.170, 360, true, CURRENT_TIMESTAMP),
  (2, 'Planta Zafiro', 30, 2.00, 30, 0.500, 360, true, CURRENT_TIMESTAMP),
  (3, 'Planta Rubí', 80, 5.36, 30, 1.340, 360, true, CURRENT_TIMESTAMP),
  (4, 'Planta Amatista', 150, 10.00, 30, 2.500, 360, true, CURRENT_TIMESTAMP),
  (5, 'Planta Topacio', 350, 23.40, 30, 5.850, 360, true, CURRENT_TIMESTAMP),
  (6, 'Planta Aguamarina', 800, 53.40, 30, 13.350, 360, true, CURRENT_TIMESTAMP),
  (7, 'Planta Citrino', 1500, 100.00, 30, 25.000, 360, true, CURRENT_TIMESTAMP),
  (8, 'Planta Cuarzo Rosa', 4000, 266.80, 30, 66.700, 360, true, CURRENT_TIMESTAMP),
  (9, 'Planta Diamante', 8000, 533.60, 30, 133.400, 360, true, CURRENT_TIMESTAMP)
ON CONFLICT (level) DO UPDATE SET
  name = EXCLUDED.name,
  price_usdt = EXCLUDED.price_usdt,
  daily_income_usdt = EXCLUDED.daily_income_usdt,
  valid_days = EXCLUDED.valid_days,
  task_reward_usdt = EXCLUDED.task_reward_usdt,
  task_cooldown_minutes = EXCLUDED.task_cooldown_minutes,
  is_purchasable = EXCLUDED.is_purchasable,
  updated_at = CURRENT_TIMESTAMP;

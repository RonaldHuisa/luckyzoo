-- GreenVest Árboles V1.0
-- Ejecutar en pgAdmin sobre tu base GreenVest/DEV/PRD antes de levantar backend actualizado.

BEGIN;

CREATE TABLE IF NOT EXISTS public.vip_packages (
  id SERIAL PRIMARY KEY,
  level INTEGER NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  price_usdt NUMERIC(38,18) NOT NULL DEFAULT 0,
  daily_income_usdt NUMERIC(38,18) NOT NULL DEFAULT 0,
  valid_days INTEGER NOT NULL DEFAULT 30,
  task_reward_usdt NUMERIC(38,18),
  task_cooldown_minutes INTEGER,
  is_purchasable BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE public.vip_packages ADD COLUMN IF NOT EXISTS daily_income_usdt NUMERIC(38,18) NOT NULL DEFAULT 0;
ALTER TABLE public.vip_packages ADD COLUMN IF NOT EXISTS valid_days INTEGER NOT NULL DEFAULT 30;
ALTER TABLE public.vip_packages ADD COLUMN IF NOT EXISTS task_reward_usdt NUMERIC(38,18);
ALTER TABLE public.vip_packages ADD COLUMN IF NOT EXISTS task_cooldown_minutes INTEGER;
ALTER TABLE public.vip_packages ADD COLUMN IF NOT EXISTS is_purchasable BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.vip_packages ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS public.vip_purchases (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  package_id INTEGER NOT NULL REFERENCES public.vip_packages(id),
  level INTEGER NOT NULL,
  price_usdt NUMERIC(38,18) NOT NULL DEFAULT 0,
  daily_income_usdt NUMERIC(38,18) NOT NULL DEFAULT 0,
  purchased_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS public.vip_daily_tasks (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  vip_purchase_id INTEGER NOT NULL REFERENCES public.vip_purchases(id) ON DELETE CASCADE,
  vip_level INTEGER NOT NULL,
  period_start TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  period_end TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reward_usdt NUMERIC(38,18) NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'completed',
  completed_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE public.vip_daily_tasks ADD COLUMN IF NOT EXISTS period_start TIMESTAMP WITHOUT TIME ZONE;
ALTER TABLE public.vip_daily_tasks ADD COLUMN IF NOT EXISTS period_end TIMESTAMP WITHOUT TIME ZONE;
ALTER TABLE public.vip_daily_tasks ADD COLUMN IF NOT EXISTS reward_usdt NUMERIC(38,18) NOT NULL DEFAULT 0;
ALTER TABLE public.vip_daily_tasks ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_vip_purchases_user_level ON public.vip_purchases(user_id, level);
CREATE INDEX IF NOT EXISTS idx_vip_purchases_active ON public.vip_purchases(user_id, status, expires_at);
CREATE INDEX IF NOT EXISTS idx_vip_daily_tasks_purchase_completed ON public.vip_daily_tasks(vip_purchase_id, completed_at DESC);

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


-- Entrega Pasantía a usuarios existentes que todavía no la tengan.
-- La vigencia se calcula desde users.created_at, no desde la fecha de migración.
INSERT INTO public.vip_purchases
  (user_id, package_id, level, price_usdt, daily_income_usdt, purchased_at, expires_at, status)
SELECT
  u.id,
  pkg.id,
  0,
  0,
  pkg.daily_income_usdt,
  u.created_at,
  u.created_at + INTERVAL '3 days',
  CASE WHEN u.created_at + INTERVAL '3 days' > NOW() THEN 'active' ELSE 'expired' END
FROM public.users u
JOIN public.vip_packages pkg ON pkg.level = 0
WHERE NOT EXISTS (
  SELECT 1
  FROM public.vip_purchases vp
  WHERE vp.user_id = u.id
    AND vp.level = 0
);

-- Configuración de retiro por defecto GreenVest V1.0.
-- También puedes reforzarlo en .env:
-- BEP20_MIN_WITHDRAW_USDT=3
-- POLYGON_MIN_WITHDRAW_USDT=3
-- BEP20_WITHDRAW_FEE_PERCENT=5
-- POLYGON_WITHDRAW_FEE_PERCENT=5

COMMIT;

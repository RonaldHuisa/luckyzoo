-- GreenVest AI - Misiones por cooldown individual
-- Ejecutar en la base GreenVest_dev antes de usar la nueva versión.

ALTER TABLE public.vip_packages
ADD COLUMN IF NOT EXISTS task_reward_usdt numeric(38,18),
ADD COLUMN IF NOT EXISTS task_cooldown_minutes integer;

UPDATE public.vip_packages
SET
    task_reward_usdt = CASE level
        WHEN 1 THEN 0.25
        WHEN 2 THEN 0.50
        WHEN 3 THEN 1.00
        WHEN 4 THEN 2.00
        WHEN 5 THEN 5.00
        ELSE COALESCE(task_reward_usdt, daily_income_usdt, 0)
    END,
    task_cooldown_minutes = CASE level
        WHEN 1 THEN 360
        WHEN 2 THEN 360
        WHEN 3 THEN 300
        WHEN 4 THEN 240
        WHEN 5 THEN 180
        ELSE COALESCE(task_cooldown_minutes, 1440)
    END,
    daily_income_usdt = CASE level
        WHEN 1 THEN 1.00
        WHEN 2 THEN 2.00
        WHEN 3 THEN 4.80
        WHEN 4 THEN 12.00
        WHEN 5 THEN 40.00
        ELSE daily_income_usdt
    END
WHERE level IN (1,2,3,4,5);

CREATE INDEX IF NOT EXISTS idx_vip_daily_tasks_purchase_completed
ON public.vip_daily_tasks(vip_purchase_id, user_id, completed_at DESC);

CREATE INDEX IF NOT EXISTS idx_vip_packages_task_config
ON public.vip_packages(level, task_cooldown_minutes, task_reward_usdt);

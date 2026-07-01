-- v1.0.74 - Pre-lanzamiento hasta martes 7 de julio
-- Ejecutar en PRD si quieres actualizar la configuración sin esperar al primer request.

UPDATE prelaunch_config
SET
  is_active = TRUE,
  cutoff_date = DATE '2026-07-07',
  max_checkin_days = 5,
  checkin_reward_usdt = 1,
  invite_reward_usdt = 1,
  tiktok_reward_usdt = 3,
  max_bonus_usdt = 9,
  block_financial_actions = TRUE,
  updated_at = CURRENT_TIMESTAMP
WHERE id = 1;

UPDATE prelaunch_tiktok_submissions
SET reward_usdt = 3,
    updated_at = CURRENT_TIMESTAMP
WHERE status = 'pending'
  AND reward_usdt <> 3;

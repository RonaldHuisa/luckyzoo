-- Desactiva el evento de invitación GreenVest para que no pueda reclamarse en PRD.
-- El backend también devuelve el evento como no disponible.

UPDATE promo_events
SET is_active = false,
    ends_at = LEAST(ends_at, CURRENT_TIMESTAMP),
    updated_at = CURRENT_TIMESTAMP
WHERE code = 'PROMO_GREENVEST_2026_05_21_V2';

UPDATE promo_tasks
SET is_active = false,
    updated_at = CURRENT_TIMESTAMP
WHERE event_id IN (
  SELECT id
  FROM promo_events
  WHERE code = 'PROMO_GREENVEST_2026_05_21_V2'
);

-- GreenVest V68 - Evento permanente de puntos por invitados y plantas gratis
-- Ejecutar una sola vez en PostgreSQL antes o junto con el deploy del backend.

CREATE TABLE IF NOT EXISTS free_plant_point_events (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  source_type VARCHAR(40) NOT NULL,
  source_id INTEGER,
  points INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS free_plant_point_events_unique_source
ON free_plant_point_events(user_id, source_type, source_id)
WHERE source_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS free_plant_point_events_user_idx
ON free_plant_point_events(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS free_plant_redemptions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  package_id INTEGER NOT NULL REFERENCES vip_packages(id),
  level INTEGER NOT NULL,
  points_cost INTEGER NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  admin_note TEXT,
  requested_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TIMESTAMP WITHOUT TIME ZONE,
  reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  vip_purchase_id INTEGER REFERENCES vip_purchases(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS free_plant_redemptions_user_idx
ON free_plant_redemptions(user_id, status, requested_at DESC);

CREATE INDEX IF NOT EXISTS free_plant_redemptions_status_idx
ON free_plant_redemptions(status, requested_at DESC);

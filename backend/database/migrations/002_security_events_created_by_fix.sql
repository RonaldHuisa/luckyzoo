-- Royal Imperial AI v1.0.2
-- Corrige bases DEV creadas con el schema anterior: faltaba created_by en user_security_events.

CREATE TABLE IF NOT EXISTS user_security_events (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  event_type VARCHAR(80) NOT NULL,
  reason TEXT,
  ip_address VARCHAR(80),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE user_security_events
  ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_user_security_events_user_id ON user_security_events(user_id);
CREATE INDEX IF NOT EXISTS idx_user_security_events_created_by ON user_security_events(created_by);

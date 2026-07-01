-- Royal Imperial AI v1.0.7
-- Agrega Nivel 0/Pasantía, soporte editable, noticias/artículos e imágenes para contenido.

ALTER TABLE vip_packages
  ADD COLUMN IF NOT EXISTS daily_tasks INTEGER,
  ADD COLUMN IF NOT EXISTS task_cooldown_seconds INTEGER;

INSERT INTO vip_packages(level, name, price_usdt, daily_income_usdt, valid_days, is_purchasable, task_reward_usdt, task_cooldown_minutes, task_cooldown_seconds, daily_tasks, updated_at)
VALUES (0, 'Pasantía', 0, 0.02, 3650, false, 0.02, 1, 20, 1, NOW())
ON CONFLICT (level) DO UPDATE SET
  name = EXCLUDED.name,
  is_purchasable = false,
  task_reward_usdt = COALESCE(vip_packages.task_reward_usdt, EXCLUDED.task_reward_usdt),
  task_cooldown_seconds = COALESCE(vip_packages.task_cooldown_seconds, EXCLUDED.task_cooldown_seconds),
  daily_tasks = COALESCE(vip_packages.daily_tasks, EXCLUDED.daily_tasks),
  updated_at = NOW();

INSERT INTO ai_task_questions(level_min, category, asset, chart_type, title, question, option_a, option_b, option_c, correct_option, is_active)
SELECT 0,'trend','MARKET','uptrend','Pasantía · Tendencia','El escenario muestra una línea que avanza hacia arriba de forma constante. ¿Qué lectura debería marcar la IA?','Tendencia alcista','Tendencia bajista','Movimiento lateral','A',true
WHERE NOT EXISTS (SELECT 1 FROM ai_task_questions WHERE level_min=0);

CREATE TABLE IF NOT EXISTS support_channels (
  id SERIAL PRIMARY KEY,
  channel_type VARCHAR(40) NOT NULL DEFAULT 'whatsapp',
  label VARCHAR(120) NOT NULL,
  value VARCHAR(255) NOT NULL,
  url TEXT,
  description TEXT,
  sort_order INTEGER DEFAULT 0 NOT NULL,
  is_active BOOLEAN DEFAULT TRUE NOT NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_support_channels_active_order ON support_channels(is_active, sort_order, id);

CREATE TABLE IF NOT EXISTS royal_articles (
  id SERIAL PRIMARY KEY,
  title VARCHAR(180) NOT NULL,
  slug VARCHAR(220) NOT NULL UNIQUE,
  summary TEXT,
  cover_image_url TEXT,
  status VARCHAR(30) DEFAULT 'draft' NOT NULL,
  sort_order INTEGER DEFAULT 0 NOT NULL,
  sections JSONB DEFAULT '[]'::jsonb NOT NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  published_at TIMESTAMP WITHOUT TIME ZONE
);
CREATE INDEX IF NOT EXISTS idx_royal_articles_status_order ON royal_articles(status, sort_order, published_at DESC, id DESC);

INSERT INTO support_channels(channel_type,label,value,url,description,sort_order,is_active)
SELECT 'whatsapp','Canal oficial WhatsApp','Royal Imperial AI','https://wa.me/','Canal principal para anuncios y soporte general.',1,true
WHERE NOT EXISTS (SELECT 1 FROM support_channels);

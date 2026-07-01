-- Royal Imperial AI v1.0.0 schema
-- Limpio para DEV: crea solo tablas necesarias para auth, wallets, recargas, retiros, niveles, tareas IA y referidos.

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  security_password_hash TEXT,
  referral_code VARCHAR(20) NOT NULL UNIQUE,
  invited_by VARCHAR(20),
  referred_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  balance_usdt NUMERIC(38,18) DEFAULT 0 NOT NULL,
  recharge_balance_usdt NUMERIC(38,18) DEFAULT 0,
  withdrawable_usdt NUMERIC(38,18) DEFAULT 0 NOT NULL,
  earnings_balance_usdt NUMERIC(38,18) DEFAULT 0,
  withdrawal_address_bep20 TEXT,
  full_name VARCHAR(160),
  phone_country_iso VARCHAR(8),
  phone_country_name VARCHAR(80),
  phone_country_code VARCHAR(8),
  phone_number VARCHAR(24),
  withdraw_enabled BOOLEAN DEFAULT FALSE NOT NULL,
  withdraw_enabled_at TIMESTAMP WITHOUT TIME ZONE,
  withdraw_enabled_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  withdraw_enabled_note TEXT,
  is_admin BOOLEAN DEFAULT FALSE NOT NULL,
  vip_level INTEGER DEFAULT 0 NOT NULL,
  vip_purchased_at TIMESTAMP WITHOUT TIME ZONE,
  vip_expires_at TIMESTAMP WITHOUT TIME ZONE,
  register_ip VARCHAR(80),
  last_login_ip VARCHAR(80),
  last_login_at TIMESTAMP WITHOUT TIME ZONE,
  is_suspicious BOOLEAN DEFAULT FALSE NOT NULL,
  suspicious_reason TEXT,
  suspicious_at TIMESTAMP WITHOUT TIME ZONE,
  is_banned BOOLEAN DEFAULT FALSE NOT NULL,
  banned_reason TEXT,
  banned_at TIMESTAMP WITHOUT TIME ZONE,
  banned_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS wallets (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  network VARCHAR(50) DEFAULT 'BEP20-USDT' NOT NULL,
  address VARCHAR(255) NOT NULL,
  public_key TEXT,
  private_key_encrypted TEXT,
  last_scanned_block BIGINT DEFAULT 0 NOT NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_wallets_user_network ON wallets(user_id, network);

CREATE TABLE IF NOT EXISTS vip_packages (
  id SERIAL PRIMARY KEY,
  level INTEGER NOT NULL UNIQUE,
  name VARCHAR(50) NOT NULL,
  price_usdt NUMERIC(38,18) DEFAULT 0 NOT NULL,
  daily_income_usdt NUMERIC(38,18) DEFAULT 0 NOT NULL,
  valid_days INTEGER DEFAULT 30 NOT NULL,
  is_purchasable BOOLEAN DEFAULT TRUE NOT NULL,
  task_reward_usdt NUMERIC(38,18),
  task_cooldown_minutes INTEGER,
  task_cooldown_seconds INTEGER,
  daily_tasks INTEGER,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vip_purchases (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  package_id INTEGER NOT NULL REFERENCES vip_packages(id),
  level INTEGER NOT NULL,
  price_usdt NUMERIC(38,18) NOT NULL,
  daily_income_usdt NUMERIC(38,18) NOT NULL,
  purchased_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
  status VARCHAR(30) DEFAULT 'active' NOT NULL,
  cancelled_at TIMESTAMP WITHOUT TIME ZONE,
  cancel_fee_percent NUMERIC(8,4) DEFAULT 10,
  cancel_fee_usdt NUMERIC(38,18) DEFAULT 0,
  refund_usdt NUMERIC(38,18) DEFAULT 0,
  cancel_reason TEXT,
  metadata JSONB DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_vip_purchases_user_status ON vip_purchases(user_id, status, expires_at);
CREATE INDEX IF NOT EXISTS idx_vip_purchases_user_level_history ON vip_purchases(user_id, level, status, expires_at DESC);

CREATE TABLE IF NOT EXISTS ai_task_questions (
  id SERIAL PRIMARY KEY,
  level_min INTEGER NOT NULL DEFAULT 1,
  category VARCHAR(40) NOT NULL,
  asset VARCHAR(20) NOT NULL DEFAULT 'MARKET',
  chart_type VARCHAR(30),
  title VARCHAR(160) NOT NULL,
  question TEXT NOT NULL,
  option_a TEXT NOT NULL,
  option_b TEXT NOT NULL,
  option_c TEXT NOT NULL,
  correct_option CHAR(1) NOT NULL CHECK (correct_option IN ('A','B','C')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_ai_task_questions_level_active ON ai_task_questions(level_min, is_active);

CREATE TABLE IF NOT EXISTS ai_task_responses (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES ai_task_questions(id),
  vip_level INTEGER NOT NULL DEFAULT 0,
  selected_option CHAR(1) NOT NULL CHECK (selected_option IN ('A','B','C')),
  correct_option CHAR(1) NOT NULL CHECK (correct_option IN ('A','B','C')),
  is_correct BOOLEAN NOT NULL DEFAULT FALSE,
  reward_usdt NUMERIC(38,18) NOT NULL DEFAULT 0,
  cooldown_seconds INTEGER NOT NULL DEFAULT 60,
  next_available_at TIMESTAMP WITH TIME ZONE NOT NULL,
  completed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_ai_task_responses_user_completed ON ai_task_responses(user_id, completed_at DESC);

CREATE TABLE IF NOT EXISTS account_ledger (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  balance_type VARCHAR(50) NOT NULL,
  direction VARCHAR(20) NOT NULL,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(150) NOT NULL,
  amount_usdt NUMERIC(38,18) NOT NULL,
  description TEXT,
  reference_type VARCHAR(50),
  reference_id INTEGER,
  metadata JSONB DEFAULT '{}'::jsonb,
  status VARCHAR(30) DEFAULT 'completed',
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_account_ledger_user_created ON account_ledger(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS deposits (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wallet_id INTEGER REFERENCES wallets(id) ON DELETE SET NULL,
  network VARCHAR(50) NOT NULL,
  token_contract VARCHAR(120),
  tx_hash VARCHAR(120) NOT NULL,
  log_index INTEGER DEFAULT 0 NOT NULL,
  block_number BIGINT,
  amount_raw TEXT,
  amount_usdt NUMERIC(38,18) NOT NULL DEFAULT 0,
  status VARCHAR(30) DEFAULT 'confirmed' NOT NULL,
  sweep_status VARCHAR(30) DEFAULT 'pending',
  bnb_topup_tx_hash VARCHAR(255),
  sweep_tx_hash VARCHAR(255),
  swept_at TIMESTAMP WITHOUT TIME ZONE,
  detected_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  metadata JSONB DEFAULT '{}'::jsonb,
  UNIQUE(tx_hash, log_index)
);
CREATE INDEX IF NOT EXISTS idx_deposits_user_created ON deposits(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS deposit_scan_requests (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wallet_id INTEGER REFERENCES wallets(id) ON DELETE SET NULL,
  network VARCHAR(30) NOT NULL,
  wallet_address VARCHAR(120) NOT NULL,
  status VARCHAR(30) DEFAULT 'pending' NOT NULL,
  attempts INTEGER DEFAULT 0 NOT NULL,
  added_deposits INTEGER DEFAULT 0 NOT NULL,
  detected_transfers INTEGER DEFAULT 0 NOT NULL,
  last_error TEXT,
  requested_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP WITHOUT TIME ZONE,
  last_checked_at TIMESTAMP WITHOUT TIME ZONE,
  expires_at TIMESTAMP WITHOUT TIME ZONE,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS payment_network_scans (
  id SERIAL PRIMARY KEY,
  wallet_id INTEGER NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  network VARCHAR(30) NOT NULL,
  last_scanned_block BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(wallet_id, network)
);

CREATE TABLE IF NOT EXISTS withdrawals (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount_requested NUMERIC(38,18) NOT NULL,
  fee_percent NUMERIC(8,4) DEFAULT 5,
  fee_amount NUMERIC(38,18) DEFAULT 0,
  amount_to_receive NUMERIC(38,18) NOT NULL,
  withdrawal_address TEXT NOT NULL,
  network VARCHAR(50) DEFAULT 'BEP20-USDT' NOT NULL,
  status VARCHAR(30) DEFAULT 'pending' NOT NULL,
  tx_hash TEXT,
  admin_note TEXT,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  approved_at TIMESTAMP WITHOUT TIME ZONE,
  paid_at TIMESTAMP WITHOUT TIME ZONE,
  metadata JSONB DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_withdrawals_user_created ON withdrawals(user_id, created_at DESC);


CREATE TABLE IF NOT EXISTS user_withdrawal_accounts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  network VARCHAR(50) NOT NULL CHECK (network IN ('BEP20-USDT','POLYGON-USDT')),
  label VARCHAR(120),
  withdrawal_address TEXT NOT NULL,
  is_default BOOLEAN DEFAULT FALSE NOT NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, network)
);
CREATE INDEX IF NOT EXISTS idx_user_withdrawal_accounts_user ON user_withdrawal_accounts(user_id, is_default DESC, id);

CREATE TABLE IF NOT EXISTS user_withdrawal_addresses (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  network VARCHAR(50) NOT NULL,
  withdrawal_address TEXT NOT NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, network)
);

CREATE TABLE IF NOT EXISTS referral_commissions (
  id SERIAL PRIMARY KEY,
  receiver_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  level INTEGER NOT NULL,
  source_type VARCHAR(50) NOT NULL,
  source_id INTEGER NOT NULL,
  base_amount_usdt NUMERIC(38,18) NOT NULL,
  percent NUMERIC(8,4) NOT NULL,
  amount_usdt NUMERIC(38,18) NOT NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(receiver_user_id, source_type, source_id, level)
);

CREATE TABLE IF NOT EXISTS referral_reward_tiers (
  id SERIAL PRIMARY KEY,
  required_invites INTEGER NOT NULL UNIQUE,
  reward_usdt NUMERIC(38,18) NOT NULL,
  title VARCHAR(120) NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_referral_rewards (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tier_id INTEGER NOT NULL REFERENCES referral_reward_tiers(id),
  reward_usdt NUMERIC(38,18) NOT NULL,
  status VARCHAR(30) DEFAULT 'claimed',
  claimed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, tier_id)
);

CREATE TABLE IF NOT EXISTS user_security_events (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  event_type VARCHAR(80) NOT NULL,
  reason TEXT,
  ip_address VARCHAR(80),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO referral_reward_tiers(required_invites,reward_usdt,title) VALUES
  (3,0.5,'Primer avance'),
  (8,1,'Equipo activo'),
  (13,1,'Crecimiento Royal')
ON CONFLICT (required_invites) DO NOTHING;

-- Royal Imperial AI v1.0.7: soporte, noticias/artículos y contenido editable.
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

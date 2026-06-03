-- GreenVest Hash Rewards / Premios de Hash
-- 1 invitado directo válido = 1 punto hash
-- 1 punto hash canjeado = +0.10% hash extra
-- Máximo bonus acumulado = +5.00%

CREATE TABLE IF NOT EXISTS user_hash_points (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    available_points INTEGER NOT NULL DEFAULT 0,
    redeemed_points INTEGER NOT NULL DEFAULT 0,
    hash_bonus_percent NUMERIC(8,4) NOT NULL DEFAULT 0,
    max_bonus_percent NUMERIC(8,4) NOT NULL DEFAULT 5.00,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS hash_point_referrals (
    id SERIAL PRIMARY KEY,
    referrer_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    referred_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    invested_amount NUMERIC(38,18) NOT NULL DEFAULT 0,
    points_awarded INTEGER NOT NULL DEFAULT 1,
    status VARCHAR(30) NOT NULL DEFAULT 'awarded',
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(referrer_user_id, referred_user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_hash_points_user_id ON user_hash_points(user_id);
CREATE INDEX IF NOT EXISTS idx_hash_point_referrals_referrer ON hash_point_referrals(referrer_user_id);
CREATE INDEX IF NOT EXISTS idx_hash_point_referrals_referred ON hash_point_referrals(referred_user_id);

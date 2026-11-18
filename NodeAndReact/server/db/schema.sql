-- ============================================================
-- Stock Market Analysis Platform
-- Database schema for PostgreSQL (Neon)
-- Converted from the original SQL Server schema
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT,
    full_name TEXT NOT NULL,
    avatar_url TEXT,
    avatar_data BYTEA,
    avatar_mime TEXT,
    google_id TEXT UNIQUE,
    is_active INTEGER NOT NULL DEFAULT 1,
    email_verified INTEGER NOT NULL DEFAULT 0,
    is_premium INTEGER NOT NULL DEFAULT 0,
    subscription_start TEXT,
    subscription_end TEXT,
    payment_id TEXT,
    created_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'),
    last_login_at TEXT,
    updated_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
);

CREATE TABLE IF NOT EXISTS watchlist (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stock_symbol TEXT NOT NULL,
    stock_name TEXT,
    exchange TEXT NOT NULL DEFAULT 'NSE',
    price_at_add DOUBLE PRECISION,
    added_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'),
    UNIQUE (user_id, stock_symbol, exchange)
);

CREATE TABLE IF NOT EXISTS stock_targets (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stock_symbol TEXT NOT NULL,
    stock_name TEXT,
    exchange TEXT NOT NULL DEFAULT 'NSE',
    target_type TEXT NOT NULL DEFAULT 'price_rise'
        CHECK (target_type IN ('price_rise', 'price_fall', 'percent_change')),
    condition_value DOUBLE PRECISION NOT NULL,
    price_at_creation DOUBLE PRECISION NOT NULL DEFAULT 0,
    notify_email TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    is_triggered INTEGER NOT NULL DEFAULT 0,
    triggered_at TEXT,
    created_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'),
    updated_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
);

CREATE TABLE IF NOT EXISTS zerodha_accounts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    nickname TEXT NOT NULL,
    api_key TEXT NOT NULL,
    api_secret TEXT NOT NULL,
    access_token TEXT,
    token_generated_at TEXT,
    created_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
);

CREATE INDEX IF NOT EXISTS ix_watchlist_userid ON watchlist(user_id);
CREATE INDEX IF NOT EXISTS ix_targets_user_active ON stock_targets(user_id, is_active);
CREATE INDEX IF NOT EXISTS ix_targets_user_triggered ON stock_targets(user_id, is_triggered);
CREATE INDEX IF NOT EXISTS ix_zerodha_userid ON zerodha_accounts(user_id);

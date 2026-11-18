/**
 * Shared database bootstrap for PostgreSQL (Neon).
 *
 * Applies db/schema.sql and patches columns that are missing from databases
 * created by older versions. Safe to call on every server start: every
 * statement is idempotent.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(__dirname, 'schema.sql');

const NOW_TEXT = "to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')";

/** Columns that must exist, keyed by table. */
const REQUIRED_COLUMNS = {
    users: {
        password_hash: 'TEXT',
        full_name: "TEXT NOT NULL DEFAULT ''",
        avatar_url: 'TEXT',
        avatar_data: 'BYTEA',
        avatar_mime: 'TEXT',
        google_id: 'TEXT',
        is_active: 'INTEGER DEFAULT 1',
        email_verified: 'INTEGER DEFAULT 0',
        is_premium: 'INTEGER DEFAULT 0',
        subscription_start: 'TEXT',
        subscription_end: 'TEXT',
        payment_id: 'TEXT',
        created_at: `TEXT DEFAULT ${NOW_TEXT}`,
        last_login_at: 'TEXT',
        updated_at: `TEXT DEFAULT ${NOW_TEXT}`,
    },
    watchlist: {
        stock_name: 'TEXT',
        exchange: "TEXT DEFAULT 'NSE'",
        price_at_add: 'DOUBLE PRECISION',
        added_at: `TEXT DEFAULT ${NOW_TEXT}`,
    },
    stock_targets: {
        stock_name: 'TEXT',
        exchange: "TEXT DEFAULT 'NSE'",
        price_at_creation: 'DOUBLE PRECISION DEFAULT 0',
        notify_email: 'TEXT',
        is_active: 'INTEGER DEFAULT 1',
        is_triggered: 'INTEGER DEFAULT 0',
        triggered_at: 'TEXT',
        created_at: `TEXT DEFAULT ${NOW_TEXT}`,
        updated_at: `TEXT DEFAULT ${NOW_TEXT}`,
    },
    zerodha_accounts: {
        nickname: 'TEXT',
        api_key: 'TEXT',
        api_secret: 'TEXT',
        access_token: 'TEXT',
        token_generated_at: 'TEXT',
        created_at: `TEXT DEFAULT ${NOW_TEXT}`,
    },
};

async function ensureColumns(pool, log) {
    const { rows } = await pool.query(
        `SELECT table_name, column_name
           FROM information_schema.columns
          WHERE table_schema = current_schema()`
    );

    const existing = new Map();
    for (const row of rows) {
        if (!existing.has(row.table_name)) existing.set(row.table_name, new Set());
        existing.get(row.table_name).add(row.column_name);
    }

    for (const [table, columns] of Object.entries(REQUIRED_COLUMNS)) {
        const present = existing.get(table);
        // Table may not exist yet (fresh database) — schema.sql creates it.
        if (!present) continue;

        for (const [column, definition] of Object.entries(columns)) {
            if (present.has(column)) continue;
            await pool.query(
                `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column} ${definition}`
            );
            if (log) console.log(`  + added ${table}.${column}`);
        }
    }
}

/**
 * Older databases declared `users.password_hash` as NOT NULL, which makes
 * Google-only accounts impossible (they have no password).
 */
async function ensurePasswordHashNullable(pool, log) {
    const { rows } = await pool.query(
        `SELECT is_nullable
           FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'users'
            AND column_name = 'password_hash'`
    );
    if (rows[0]?.is_nullable === 'NO') {
        if (log) console.log('  ~ allowing password-less Google accounts');
        await pool.query('ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL');
    }
}

/**
 * Create missing tables/indexes and back-fill legacy NULL values.
 * @param {import('pg').Pool} pool open PostgreSQL pool
 * @param {{ log?: boolean }} [options]
 */
export async function initDatabase(pool, { log = false } = {}) {
    const sql = fs.readFileSync(schemaPath, 'utf8');
    await pool.query(sql);
    await ensureColumns(pool, log);

    // Back-fill NULL values introduced by older schemas.
    await pool.query("UPDATE users SET full_name = email WHERE full_name IS NULL OR full_name = ''");

    // Older databases cannot store password-less (Google) accounts.
    await ensurePasswordHashNullable(pool, log);

    await pool.query("UPDATE watchlist SET stock_name = stock_symbol WHERE stock_name IS NULL OR stock_name = ''");
    await pool.query("UPDATE stock_targets SET stock_name = stock_symbol WHERE stock_name IS NULL OR stock_name = ''");
    await pool.query("UPDATE stock_targets SET exchange = 'NSE' WHERE exchange IS NULL OR exchange = ''");
    await pool.query("UPDATE watchlist SET exchange = 'NSE' WHERE exchange IS NULL OR exchange = ''");
}

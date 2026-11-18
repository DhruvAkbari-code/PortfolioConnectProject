import 'dotenv/config';
import pg from 'pg';
import { initDatabase } from './init.js';

// PostgreSQL (Neon) is the project database. DATABASE_URL is required.
if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set. Add your Neon connection string to server/.env.');
}

// Neon requires TLS. Strip libpq-only query parameters (pg does not support
// channel binding) and verify the server certificate explicitly.
const url = new URL(process.env.DATABASE_URL);
url.searchParams.delete('sslmode');
url.searchParams.delete('channel_binding');

export const pool = new pg.Pool({
    connectionString: url.toString(),
    ssl: true,
    max: Number(process.env.PG_POOL_MAX) || 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
});

pool.on('error', (err) => {
    console.error('[db] idle PostgreSQL client error:', err.message);
});

/**
 * Convert SQLite-style `?` placeholders to PostgreSQL `$1`, `$2`, ….
 * The project queries use `?`; keeping the helper means routes stay readable.
 */
function toPgPlaceholders(sql) {
    let index = 0;
    return sql.replace(/\?/g, () => `$${++index}`);
}

/** Run a SELECT and return every row. */
export async function query(sql, params = []) {
    const result = await pool.query(toPgPlaceholders(sql), params);
    return result.rows;
}

/** Run a SELECT and return the first row (or undefined). */
export async function get(sql, params = []) {
    const rows = await query(sql, params);
    return rows[0];
}

/** Run INSERT/UPDATE/DELETE. Returns { changes, rows }. */
export async function run(sql, params = []) {
    const result = await pool.query(toPgPlaceholders(sql), params);
    return { changes: result.rowCount, rows: result.rows };
}

/** Close the pool when the app shuts down. */
export async function close() {
    await pool.end();
}

// Create/upgrade the schema before any route touches the database.
// Every statement in initDatabase is idempotent.
await initDatabase(pool);

/**
 * One-time import of the legacy local SQLite database into PostgreSQL (Neon).
 *
 * Usage:
 *   npm run import:sqlite
 *
 * The PostgreSQL schema is created automatically. The import is skipped when
 * the target `users` table already has rows (pass --force to merge anyway).
 * Existing rows are never overwritten: inserts use ON CONFLICT DO NOTHING.
 */
import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { pool, close } from './pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlitePath = process.env.SQLITE_PATH || path.resolve(__dirname, '..', 'database.sqlite');
const force = process.argv.includes('--force');

const TABLES = [
    { name: 'users', source: 'SELECT * FROM users ORDER BY id' },
    {
        name: 'watchlist',
        source: `SELECT w.* FROM watchlist w
                  JOIN users u ON u.id = w.user_id
                  ORDER BY w.id`,
    },
    {
        name: 'stock_targets',
        source: `SELECT t.* FROM stock_targets t
                  JOIN users u ON u.id = t.user_id
                  ORDER BY t.id`,
    },
    {
        name: 'zerodha_accounts',
        source: `SELECT z.* FROM zerodha_accounts z
                  JOIN users u ON u.id = z.user_id
                  ORDER BY z.id`,
    },
];

async function insertRow(client, table, row) {
    const columns = Object.keys(row);
    const placeholders = columns.map((_, i) => `$${i + 1}`);
    const values = columns.map((column) => row[column]);
    const result = await client.query(
        `INSERT INTO ${table} (${columns.join(', ')})
         VALUES (${placeholders.join(', ')})
         ON CONFLICT DO NOTHING`,
        values
    );
    return result.rowCount;
}

async function main() {
    const { rows } = await pool.query('SELECT COUNT(*)::int AS c FROM users');
    if (rows[0].c > 0 && !force) {
        console.log(`Target database already has ${rows[0].c} user(s). Skipping import.`);
        console.log('Run "npm run import:sqlite -- --force" to merge the SQLite rows.');
        return;
    }

    let sqlite;
    try {
        sqlite = new Database(sqlitePath, { readonly: true, fileMustExist: true });
    } catch (err) {
        console.log(`No SQLite database at ${sqlitePath} — nothing to import.`);
        return;
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        for (const table of TABLES) {
            const sourceRows = sqlite.prepare(table.source).all();
            let inserted = 0;
            for (const row of sourceRows) {
                inserted += await insertRow(client, table.name, row);
            }
            console.log(`  ${table.name}: ${inserted}/${sourceRows.length} row(s) imported`);
        }

        // Keep the SERIAL sequences ahead of the imported ids.
        for (const { name } of TABLES) {
            await client.query(
                `SELECT setval(
                     pg_get_serial_sequence('${name}', 'id'),
                     GREATEST(COALESCE((SELECT MAX(id) FROM ${name}), 1), 1),
                     (SELECT COUNT(*) FROM ${name}) > 0
                 )`
            );
        }

        await client.query('COMMIT');
        console.log('✔ SQLite data imported into PostgreSQL.');
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
        sqlite.close();
    }
}

try {
    console.log(`Importing ${sqlitePath} → PostgreSQL …`);
    await main();
} catch (err) {
    console.error('✖ Import failed:', err.message);
    process.exitCode = 1;
} finally {
    await close();
}

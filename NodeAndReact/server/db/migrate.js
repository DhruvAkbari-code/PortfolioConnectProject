/**
 * Applies db/schema.sql to the PostgreSQL (Neon) database.
 * Usage: npm run migrate
 *
 * The script is idempotent: it creates missing tables/indexes and adds any
 * columns that are missing from databases created by older versions. The
 * server also runs the same bootstrap automatically on startup, so this
 * command is only needed when you want to prepare the database explicitly.
 */
import 'dotenv/config';
import { pool, close } from './pool.js';
import { initDatabase } from './init.js';

async function main() {
    console.log('Applying schema to PostgreSQL …');
    await initDatabase(pool, { log: true });

    const { rows } = await pool.query(
        `SELECT table_name
           FROM information_schema.tables
          WHERE table_schema = current_schema()
            AND table_type = 'BASE TABLE'
          ORDER BY table_name`
    );
    console.log(`✔ Database ready. Tables: ${rows.map((t) => t.table_name).join(', ')}`);
}

try {
    await main();
} catch (err) {
    console.error('✖ Migration failed:', err.message);
    process.exitCode = 1;
} finally {
    await close();
}

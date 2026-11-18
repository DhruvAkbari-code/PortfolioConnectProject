/**
 * Price-target alert checker.
 *
 * Runs every 60 seconds (per the SRS integration test TC-I05: "Email alert
 * received within 60 seconds"). For every active, un-targeted stock target
 * it fetches the live price and, when the condition is met:
 *   - marks the target triggered
 *   - sends an email to notify_email
 */

import cron from 'node-cron';
import { query } from '../../db/pool.js';
import { getQuotesForItems } from './yahoo.js';
import { sendMail, targetAlertTemplate } from '../utils/mailer.js';

const CHECK_INTERVAL_SECONDS = 60;

async function checkAlerts() {
    try {
        const targets = await query(`
            SELECT t.id, t.user_id, t.stock_symbol, t.stock_name, t.exchange,
                   t.target_type, t.condition_value, t.price_at_creation,
                   t.notify_email, t.is_active, t.is_triggered,
                   u.full_name AS user_full_name
            FROM stock_targets t
            JOIN users u ON u.id = t.user_id
            WHERE t.is_active = 1 AND t.is_triggered = 0
        `);
        if (targets.length === 0) return;

        const quotes = await getQuotesForItems(targets);

        for (const t of targets) {
            const key = `${String(t.stock_symbol ?? '').toUpperCase()}|${String(t.exchange ?? 'NSE').toUpperCase()}`;
            const q = quotes[key];
            if (!q || q.price == null) continue;

            const price = Number(q.price);
            const cond = Number(t.condition_value);
            const base = Number(t.price_at_creation);

            let hit = false;
            if (t.target_type === 'price_rise') hit = price >= cond;
            else if (t.target_type === 'price_fall') hit = price <= cond;
            else if (t.target_type === 'percent_change') {
                const pct = base ? Math.abs(((price - base) / base) * 100) : 0;
                hit = pct >= cond;
            }

            if (!hit) continue;

            await query(
                `UPDATE stock_targets
                 SET is_triggered = 1,
                     triggered_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'),
                     updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
                 WHERE id = ?`,
                [t.id]
            );

            console.log(`[alerts] Target #${t.id} for ${t.stock_symbol} triggered at ₹${price}`);

            await sendMail({
                to: t.notify_email,
                subject: `🎯 Target alert: ${t.stock_symbol} is now ₹${price.toFixed(2)}`,
                html: targetAlertTemplate({
                    user: { full_name: t.user_full_name },
                    target: t,
                    price,
                }),
            });
        }
    } catch (err) {
        console.error('[alerts] check failed:', err.message);
    }
}

export function startAlertChecker() {
    // every minute, offset off the second boundary
    cron.schedule('* * * * *', checkAlerts);
    console.log('[alerts] price-target checker started (every 60s).');
}

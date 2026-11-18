import { Router } from 'express';
import { query, get } from '../../db/pool.js';
import { requireAuth, asyncHandler } from '../middleware/auth.js';
import { getQuotesForItems, getQuote } from '../services/yahoo.js';

const router = Router();
router.use(requireAuth);

const VALID_TYPES = ['price_rise', 'price_fall', 'percent_change'];

function normalizeType(type) {
    const t = String(type ?? '').trim().toLowerCase();
    if (t === 'above') return 'price_rise';
    if (t === 'below') return 'price_fall';
    if (t === 'percent' || t === 'percentage') return 'percent_change';
    return t || 'price_rise';
}

// GET /api/targets — the user's price-target alerts with live prices
router.get('/', asyncHandler(async (req, res) => {
    const items = await query(
        'SELECT * FROM stock_targets WHERE user_id = ? ORDER BY created_at DESC',
        [req.user.id]
    );

    const live = items.length ? await getQuotesForItems(items) : {};

    const enriched = items.map((t) => {
        const key = `${String(t.stock_symbol ?? '').toUpperCase()}|${String(t.exchange ?? 'NSE').toUpperCase()}`;
        const price = live[key]?.price ?? null;
        let progress = null;
        const created = Number(t.price_at_creation);
        if (price != null && created > 0) {
            if (t.target_type === 'percent_change') {
                const moved = Math.abs(((price - created) / created) * 100);
                progress = Math.min((moved / Number(t.condition_value)) * 100, 100);
            } else {
                const total = Math.abs(Number(t.condition_value) - created);
                const done = Math.abs(price - created);
                progress = total > 0 ? Math.min((done / total) * 100, 100) : 100;
            }
        }
        return { ...t, live_price: price, progress };
    });

    res.json({ items: enriched });
}));

// POST /api/targets — create an alert
router.post('/', asyncHandler(async (req, res) => {
    const symbol = String(req.body?.symbol ?? '').trim().toUpperCase();
    const name = String(req.body?.name ?? symbol).trim() || symbol;
    const exchange = String(req.body?.exchange ?? 'NSE').trim().toUpperCase() || 'NSE';
    const targetType = normalizeType(req.body?.targetType);
    const conditionValue = Number(req.body?.conditionValue);
    const notifyEmail = String(req.body?.notifyEmail ?? req.user.email).trim().toLowerCase();

    if (!symbol) return res.status(400).json({ error: 'A valid stock symbol is required.' });
    if (!VALID_TYPES.includes(targetType)) {
        return res.status(400).json({ error: 'Target type must be price_rise, price_fall or percent_change.' });
    }
    if (!Number.isFinite(conditionValue) || conditionValue <= 0) {
        return res.status(400).json({ error: 'Please enter a valid positive target value.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(notifyEmail)) {
        return res.status(400).json({ error: 'A valid notification email is required.' });
    }

    // Duplicate check (matches the original .NET behaviour)
    const exists = await get(
        `SELECT id FROM stock_targets
         WHERE user_id = ? AND stock_symbol = ? AND target_type = ?
           AND condition_value = ? AND is_active = 1`,
        [req.user.id, symbol, targetType, conditionValue]
    );
    if (exists) {
        return res.status(409).json({ error: 'An identical active target already exists for this stock.' });
    }

    // Snapshot the current price at creation (0 when the quote is unavailable)
    const quote = await getQuote(symbol, exchange);

    const rows = await query(
        `INSERT INTO stock_targets
            (user_id, stock_symbol, stock_name, exchange, target_type,
             condition_value, price_at_creation, notify_email)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
        [req.user.id, symbol, name, exchange, targetType, conditionValue, quote?.price ?? 0, notifyEmail]
    );

    res.status(201).json({
        success: true,
        message: `Target set for ${symbol}!`,
        item: rows[0],
    });
}));

// PATCH /api/targets/:id — update value / email / toggle active
router.patch('/:id', asyncHandler(async (req, res) => {
    const { conditionValue, notifyEmail, isActive } = req.body ?? {};
    const sets = [];
    const params = [];

    if (conditionValue !== undefined) {
        const v = Number(conditionValue);
        if (!Number.isFinite(v) || v <= 0) return res.status(400).json({ error: 'Please enter a valid positive target value.' });
        sets.push('condition_value = ?'); params.push(v);
        sets.push('is_triggered = 0', 'triggered_at = NULL');
    }
    if (notifyEmail !== undefined) {
        const email = String(notifyEmail).trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'A valid notification email is required.' });
        sets.push('notify_email = ?'); params.push(email);
    }
    if (isActive !== undefined) {
        const active = isActive ? 1 : 0;
        sets.push('is_active = ?'); params.push(active);
        if (active) { sets.push('is_triggered = 0', 'triggered_at = NULL'); }
    }
    if (sets.length === 0) return res.status(400).json({ error: 'Nothing to update.' });

    sets.push("updated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')");
    params.push(req.params.id, req.user.id);

    const rows = await query(
        `UPDATE stock_targets SET ${sets.join(', ')} WHERE id = ? AND user_id = ? RETURNING *`,
        params
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Target not found.' });

    res.json({ success: true, item: rows[0] });
}));

// DELETE /api/targets/:id
router.delete('/:id', asyncHandler(async (req, res) => {
    const deleted = await query(
        'DELETE FROM stock_targets WHERE id = ? AND user_id = ? RETURNING id',
        [req.params.id, req.user.id]
    );
    if (deleted.length === 0) return res.status(404).json({ error: 'Target not found.' });
    res.json({ success: true, message: 'Target deleted.' });
}));

export default router;

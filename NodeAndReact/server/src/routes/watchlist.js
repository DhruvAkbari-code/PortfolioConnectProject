import { Router } from 'express';
import { query, get } from '../../db/pool.js';
import { requireAuth, asyncHandler } from '../middleware/auth.js';
import { getQuotesForItems, getQuote, searchStocks } from '../services/yahoo.js';

const router = Router();
router.use(requireAuth);

// GET /api/watchlist — the user's watchlist
router.get('/', asyncHandler(async (req, res) => {
    const items = await query(
        'SELECT * FROM watchlist WHERE user_id = ? ORDER BY added_at DESC',
        [req.user.id]
    );
    res.json({ items });
}));

// GET /api/watchlist/search?q= — typeahead for the add-stock box
router.get('/search', asyncHandler(async (req, res) => {
    const q = String(req.query.q ?? '').trim();
    if (q.length < 1) return res.json({ results: [] });
    const results = await searchStocks(q, 8);
    res.json({ results });
}));

// GET /api/watchlist/quotes — live price for every watchlist entry
router.get('/quotes', asyncHandler(async (req, res) => {
    const items = await query('SELECT * FROM watchlist WHERE user_id = ?', [req.user.id]);
    const quoteMap = items.length ? await getQuotesForItems(items) : {};
    res.json({ quotes: quoteMap });
}));

// POST /api/watchlist — { symbol, name?, exchange? } add a stock
router.post('/', asyncHandler(async (req, res) => {
    const symbol = String(req.body?.symbol ?? '').trim().toUpperCase();
    const name = String(req.body?.name ?? symbol).trim() || symbol;
    const exchange = String(req.body?.exchange ?? 'NSE').trim().toUpperCase() || 'NSE';

    if (!symbol || symbol.length > 50) {
        return res.status(400).json({ error: 'A valid stock symbol is required.' });
    }

    const dup = await query(
        'SELECT id FROM watchlist WHERE user_id = ? AND stock_symbol = ? AND exchange = ?',
        [req.user.id, symbol, exchange]
    );
    if (dup.length > 0) {
        return res.status(409).json({ error: `${symbol} is already in your watchlist.` });
    }

    // Snapshot the price at the time of adding. If Yahoo is unavailable the
    // stock is still added — live prices are optional.
    const quote = await getQuote(symbol, exchange);

    const rows = await query(
        `INSERT INTO watchlist (user_id, stock_symbol, stock_name, exchange, price_at_add)
         VALUES (?, ?, ?, ?, ?) RETURNING *`,
        [req.user.id, symbol, name, exchange, quote?.price ?? null]
    );
    res.status(201).json({ success: true, item: rows[0] });
}));

// DELETE /api/watchlist/:id
router.delete('/:id', asyncHandler(async (req, res) => {
    const deleted = await query(
        'DELETE FROM watchlist WHERE id = ? AND user_id = ? RETURNING id',
        [req.params.id, req.user.id]
    );
    if (deleted.length === 0) return res.status(404).json({ error: 'Watchlist entry not found.' });
    res.json({ success: true, message: 'Removed from watchlist.' });
}));

// DELETE /api/watchlist/symbol/:symbol — convenience for the stock-details page
router.delete('/symbol/:symbol', asyncHandler(async (req, res) => {
    const symbol = String(req.params.symbol).toUpperCase();
    const deleted = await query(
        'DELETE FROM watchlist WHERE stock_symbol = ? AND user_id = ? RETURNING id',
        [symbol, req.user.id]
    );
    if (deleted.length === 0) return res.status(404).json({ error: 'Watchlist entry not found.' });
    res.json({ success: true, message: 'Removed from watchlist.' });
}));

export default router;

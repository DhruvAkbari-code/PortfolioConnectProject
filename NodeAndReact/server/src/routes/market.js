import { Router } from 'express';
import { requireAuth, asyncHandler } from '../middleware/auth.js';
import { getTrendingStocks } from '../services/nse.js';
import { getStockDetails, getQuote, getHistory, normalizeHistoryRange } from '../services/yahoo.js';

const router = Router();

// ── GET /api/market/trending — live movers from the NSE website ──
router.get('/trending', requireAuth, asyncHandler(async (req, res) => {
    try {
        const data = await getTrendingStocks();
        res.json({ success: true, ...data });
    } catch (err) {
        console.error('[trending] failed:', err.message);
        res.status(502).json({
            error: 'Could not fetch trending stocks from the NSE website right now. Please try Refresh in a moment.',
            code: 'NSE_UNAVAILABLE',
        });
    }
}));

// ── GET /api/market/stocks/:symbol?exchange=NSE — stock details page data ──
router.get('/stocks/:symbol', requireAuth, asyncHandler(async (req, res) => {
    const symbol = String(req.params.symbol ?? '').trim().toUpperCase();
    const exchange = String(req.query.exchange ?? 'NSE').toUpperCase();
    const details = await getStockDetails(symbol, exchange);
    if (!details) {
        return res.status(404).json({ error: `Stock "${symbol}" not found. Please check the symbol.` });
    }
    res.json({ success: true, ...details });
}));

// ── GET /api/market/history/:symbol?exchange=NSE&range=1mo — chart data ──
router.get('/history/:symbol', requireAuth, asyncHandler(async (req, res) => {
    const symbol = String(req.params.symbol ?? '').trim().toUpperCase();
    const exchange = String(req.query.exchange ?? 'NSE').toUpperCase();
    const range = normalizeHistoryRange(req.query.range);
    const history = await getHistory(symbol, exchange, range);
    res.json({ success: true, symbol, exchange, range, history });
}));

// ── GET /api/market/quote/:symbol — single quote ──
router.get('/quote/:symbol', requireAuth, asyncHandler(async (req, res) => {
    const symbol = String(req.params.symbol ?? '').trim().toUpperCase();
    const exchange = String(req.query.exchange ?? 'NSE').toUpperCase();
    const quote = await getQuote(symbol, exchange);
    if (!quote) return res.status(404).json({ error: `Could not fetch a quote for "${symbol}".` });
    res.json({ success: true, ...quote });
}));

export default router;

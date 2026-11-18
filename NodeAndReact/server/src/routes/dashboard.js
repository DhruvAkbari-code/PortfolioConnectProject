import { Router } from 'express';
import { query, run } from '../../db/pool.js';
import { requireAuth, publicUser, asyncHandler } from '../middleware/auth.js';
import { getHoldings } from '../services/kite.js';

const router = Router();

function emptyPortfolio() {
    return {
        holdings: [],
        totalInvestment: 0,
        totalValue: 0,
        totalProfitLoss: 0,
        totalPnlPercentage: 0,
    };
}

// ── GET /api/dashboard — multi-account portfolio (mirrors .NET DashboardController) ──
router.get('/', requireAuth, asyncHandler(async (req, res) => {
    const accountRows = await query(
        'SELECT * FROM zerodha_accounts WHERE user_id = ? ORDER BY created_at ASC',
        [req.user.id]
    );

    const accounts = await Promise.all(accountRows.map(async (account) => {
        const base = {
            accountId: account.id,
            nickname: account.nickname,
            isConnected: Boolean(account.access_token),
            ...emptyPortfolio(),
        };
        if (!account.access_token) return base;

        try {
            const portfolio = await getHoldings(account.api_key, account.access_token);
            return {
                ...base,
                isConnected: true,
                holdings: portfolio.holdings,
                totalInvestment: portfolio.summary.totalInvestment,
                totalValue: portfolio.summary.totalValue,
                totalProfitLoss: portfolio.summary.totalPnl,
                totalPnlPercentage: portfolio.summary.totalPnlPercent,
            };
        } catch {
            // Token expired — clear it so the UI shows a reconnect prompt.
            await run('UPDATE zerodha_accounts SET access_token = NULL, token_generated_at = NULL WHERE id = ?', [account.id]);
            return { ...base, isConnected: false };
        }
    }));

    const totals = accounts.reduce((acc, a) => ({
        totalInvestment: acc.totalInvestment + a.totalInvestment,
        totalValue: acc.totalValue + a.totalValue,
        totalProfitLoss: acc.totalProfitLoss + a.totalProfitLoss,
    }), { totalInvestment: 0, totalValue: 0, totalProfitLoss: 0 });
    totals.totalPnlPercentage = totals.totalInvestment > 0
        ? (totals.totalProfitLoss / totals.totalInvestment) * 100
        : 0;

    // Extra widgets used by the dashboard (watchlist + targets summaries).
    const watchlist = await query(
        'SELECT * FROM watchlist WHERE user_id = ? ORDER BY added_at DESC LIMIT 5',
        [req.user.id]
    );
    const targets = await query(
        'SELECT * FROM stock_targets WHERE user_id = ? ORDER BY created_at DESC LIMIT 5',
        [req.user.id]
    );
    const activeTargets = (await query(
        'SELECT COUNT(*)::int AS c FROM stock_targets WHERE user_id = ? AND is_active = 1 AND is_triggered = 0',
        [req.user.id]
    ))[0]?.c ?? 0;
    const triggeredTargets = (await query(
        'SELECT COUNT(*)::int AS c FROM stock_targets WHERE user_id = ? AND is_triggered = 1',
        [req.user.id]
    ))[0]?.c ?? 0;

    res.json({
        user: publicUser(req.user),
        accounts,
        ...totals,
        watchlistPreview: watchlist,
        targetsPreview: targets,
        activeTargets,
        triggeredTargets,
    });
}));

export default router;

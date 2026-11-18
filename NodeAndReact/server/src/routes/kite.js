import { Router } from 'express';
import { query, run, get } from '../../db/pool.js';
import { requireAuth, asyncHandler } from '../middleware/auth.js';
import {
    buildLoginUrl, generateSession, getKiteProfile, getHoldings,
} from '../services/kite.js';

const router = Router();

/**
 * Broker data note (per the SRS): the generated Kite access token is used
 * read-only to fetch holdings. Holdings data is never persisted — it is
 * fetched live and discarded after the response.
 */

// Pending OAuth handshakes (accountId → { userId, startedAt }). Kite redirects
// the browser back without our Bearer token, so this map lets the public
// callback route identify which user started the connection.
const pending = new Map();

function clientBase() {
    return (process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/$/, '');
}

async function accountForUser(userId, accountId) {
    return await get('SELECT * FROM zerodha_accounts WHERE id = ? AND user_id = ?', [accountId, userId]);
}

// ── GET /api/kite/accounts — Zerodha accounts the user has registered ──
router.get('/accounts', requireAuth, asyncHandler(async (req, res) => {
    const accounts = await query(
        `SELECT id, nickname, api_key, api_secret, access_token, token_generated_at, created_at
         FROM zerodha_accounts WHERE user_id = ? ORDER BY created_at ASC`,
        [req.user.id]
    );
    res.json({
        accounts: accounts.map((a) => ({
            ...a,
            api_secret: undefined,
            masked_key: a.api_key ? `${a.api_key.slice(0, 6)}…${a.api_key.slice(-4)}` : '—',
            connected: Boolean(a.access_token),
        })),
    });
}));

// ── POST /api/kite/accounts — { nickname, apiKey, apiSecret } ──
router.post('/accounts', requireAuth, asyncHandler(async (req, res) => {
    const { nickname, apiKey, apiSecret } = req.body ?? {};
    if (!nickname?.trim() || !apiKey?.trim() || !apiSecret?.trim()) {
        return res.status(400).json({ error: 'Nickname, API key and API secret are all required.' });
    }
    const rows = await query(
        `INSERT INTO zerodha_accounts (user_id, nickname, api_key, api_secret)
         VALUES (?, ?, ?, ?) RETURNING id, nickname, api_key, created_at`,
        [req.user.id, nickname.trim(), apiKey.trim(), apiSecret.trim()]
    );
    res.status(201).json({ success: true, account: rows[0], message: 'Account saved. Connect it to load your portfolio.' });
}));

// ── PUT /api/kite/accounts/:id — edit nickname / keys ──
router.put('/accounts/:id', requireAuth, asyncHandler(async (req, res) => {
    const account = await accountForUser(req.user.id, req.params.id);
    if (!account) return res.status(404).json({ error: 'Account not found.' });

    const nickname = String(req.body?.nickname ?? account.nickname).trim();
    const apiKey = String(req.body?.apiKey ?? account.api_key).trim();
    const apiSecret = String(req.body?.apiSecret ?? '').trim() || account.api_secret;

    if (!nickname || !apiKey) {
        return res.status(400).json({ error: 'Nickname and API key are required.' });
    }

    await query(
        `UPDATE zerodha_accounts
         SET nickname = ?, api_key = ?, api_secret = ?, access_token = NULL, token_generated_at = NULL
         WHERE id = ? AND user_id = ? RETURNING id`,
        [nickname, apiKey, apiSecret, req.params.id, req.user.id]
    );
    res.json({ success: true, message: 'Account updated. Reconnect it to refresh the session.' });
}));

// ── DELETE /api/kite/accounts/:id — remove a Zerodha account ──
router.delete('/accounts/:id', requireAuth, asyncHandler(async (req, res) => {
    pending.delete(String(req.params.id));
    const deleted = await query(
        'DELETE FROM zerodha_accounts WHERE id = ? AND user_id = ? RETURNING id',
        [req.params.id, req.user.id]
    );
    if (deleted.length === 0) return res.status(404).json({ error: 'Account not found.' });
    res.json({ success: true, message: 'Account removed.' });
}));

// ── POST /api/kite/accounts/:id/connect → returns Zerodha login URL ──
router.post('/accounts/:id/connect', requireAuth, asyncHandler(async (req, res) => {
    const account = await accountForUser(req.user.id, req.params.id);
    if (!account) return res.status(404).json({ error: 'Account not found.' });

    pending.set(String(account.id), { userId: req.user.id, startedAt: Date.now() });
    res.json({ success: true, loginUrl: buildLoginUrl(account.api_key, account.id) });
}));

// ── POST /api/kite/accounts/:id/session — exchange Kite's request_token ──
// The registered Kite redirect URL is the SPA route /kite/callback, so the
// request_token arrives in the browser. The signed-in client posts it here;
// ownership is checked against the JWT before the token is exchanged.
router.post('/accounts/:id/session', requireAuth, asyncHandler(async (req, res) => {
    const account = await accountForUser(req.user.id, req.params.id);
    if (!account) return res.status(404).json({ error: 'Account not found.' });

    const requestToken = String(req.body?.requestToken ?? '').trim();
    if (!requestToken) {
        return res.status(400).json({ error: 'No request token received from Zerodha.' });
    }

    try {
        const session = await generateSession(requestToken, account.api_key, account.api_secret);
        let profile = null;
        try {
            profile = await getKiteProfile(account.api_key, session.accessToken);
        } catch { /* the portfolio call will confirm the session later */ }

        await run(
            `UPDATE zerodha_accounts
                SET access_token = ?,
                    token_generated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
              WHERE id = ?`,
            [session.accessToken, account.id]
        );
        pending.delete(String(account.id));

        res.json({
            success: true,
            connected: true,
            account: account.nickname,
            user: profile?.userName ?? session.userFirstName ?? '',
        });
    } catch (err) {
        console.error('[kite] token exchange failed:', err.message);
        res.status(502).json({ error: err.message || 'Could not connect to Zerodha.' });
    }
}));

// ── GET /api/kite/callback?account=<id>&request_token=xxx ──
// Public route: Zerodha redirects the browser here without our JWT. The
// pending map identifies the user; then the browser is sent back to the app.
router.get('/callback', asyncHandler(async (req, res) => {
    const back = (params) => `${clientBase()}/kite/callback?${new URLSearchParams(params)}`;
    const accountId = String(req.query.account ?? '');
    const requestToken = String(req.query.request_token ?? '');

    if (!requestToken) {
        return res.redirect(back({ error: 'Authentication was cancelled or the request token is missing.' }));
    }

    const account = await get('SELECT * FROM zerodha_accounts WHERE id = ?', [accountId]);
    if (!account) {
        return res.redirect(back({ error: 'Broker account not found.' }));
    }

    // Only the user who started the handshake may complete it.
    const handshake = pending.get(String(account.id));
    if (!handshake || handshake.userId !== account.user_id) {
        return res.redirect(back({ error: 'Session expired or no connection is pending. Please try connecting again.' }));
    }
    pending.delete(String(account.id));

    try {
        const session = await generateSession(requestToken, account.api_key, account.api_secret);
        let profile = null;
        try {
            profile = await getKiteProfile(account.api_key, session.accessToken);
        } catch { /* portfolio call will confirm later */ }

        await run(
            `UPDATE zerodha_accounts
                SET access_token = ?,
                    token_generated_at = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
              WHERE id = ?`,
            [session.accessToken, account.id]
        );

        return res.redirect(back({
            connected: '1',
            account: account.nickname,
            user: profile?.userName ?? '',
        }));
    } catch (err) {
        console.error('[kite] callback failed:', err.message);
        return res.redirect(back({ error: err.message || 'Could not connect to Zerodha.' }));
    }
}));

// ── GET /api/kite/accounts/:id/portfolio — live holdings (read-only) ──
router.get('/accounts/:id/portfolio', requireAuth, asyncHandler(async (req, res) => {
    const account = await accountForUser(req.user.id, req.params.id);
    if (!account) return res.status(404).json({ error: 'Account not found.' });
    if (!account.access_token) {
        return res.status(409).json({
            error: 'This account is not connected. Click "Connect" to authorize with Zerodha first.',
            code: 'KITE_NOT_CONNECTED',
        });
    }

    try {
        // Verify the saved token is still valid before using it.
        await getKiteProfile(account.api_key, account.access_token);
    } catch {
        await run('UPDATE zerodha_accounts SET access_token = NULL, token_generated_at = NULL WHERE id = ?', [account.id]);
        return res.status(409).json({
            error: 'Your Kite session has expired. Reconnect the account to continue.',
            code: 'KITE_TOKEN_EXPIRED',
        });
    }

    try {
        const portfolio = await getHoldings(account.api_key, account.access_token);
        res.json({
            success: true,
            account: { id: account.id, nickname: account.nickname },
            ...portfolio,
            notice: 'Holdings are read-only. Broker holdings are fetched live and never stored in the database.',
        });
    } catch (err) {
        res.status(502).json({ error: err.message ?? 'Kite API request failed.' });
    }
}));

// ── POST /api/kite/accounts/:id/disconnect — discard the access token ──
router.post('/accounts/:id/disconnect', requireAuth, asyncHandler(async (req, res) => {
    await run(
        'UPDATE zerodha_accounts SET access_token = NULL, token_generated_at = NULL WHERE id = ? AND user_id = ?',
        [req.params.id, req.user.id]
    );
    res.json({ success: true, message: 'Disconnected. Broker session data discarded.' });
}));

export default router;

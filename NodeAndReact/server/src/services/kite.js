/**
 * Kite Connect (Zerodha) integration service.
 * Replaces the .NET KiteConnect library with direct REST calls.
 *
 * OAuth flow (read-only, session-only access):
 *   1. buildLoginUrl()        → user is redirected to Zerodha
 *   2. user authorizes        → Zerodha redirects back with request_token
 *   3. generateSession()      → exchange request_token for access_token
 *   4. getProfile/getHoldings → fetch live holdings; NEVER stored in the DB
 */

import crypto from 'node:crypto';

const KITE_API = 'https://api.kite.trade';
const KITE_VERSION = '3';

export function buildLoginUrl(apiKey, accountId) {
    const params = new URLSearchParams({ v: KITE_VERSION, api_key: apiKey });
    // Kite appends `redirect_params` to the registered redirect URL. Passing the
    // account id lets the SPA callback know which broker account to complete,
    // even though Kite sends the browser back without our Bearer token.
    if (accountId != null) {
        params.set('redirect_params', `account=${accountId}`);
    }
    return `https://kite.zerodha.com/connect/login?${params}`;
}

export async function generateSession(requestToken, apiKey, apiSecret) {
    if (!requestToken) throw new Error('No request token received from Zerodha.');

    const checksum = crypto.createHash('sha256')
        .update(`${apiKey}${requestToken}${apiSecret}`)
        .digest('hex');

    const body = new URLSearchParams({ api_key: apiKey, request_token: requestToken, checksum });

    const res = await fetch(`${KITE_API}/session/token`, {
        method: 'POST',
        headers: {
            'X-Kite-Version': KITE_VERSION,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
        signal: AbortSignal.timeout(15000),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || data?.status === 'error' || !data?.data?.access_token) {
        console.error('[kite] session generation failed:', data);
        throw new Error(data?.message || data?.data?.message || 'Failed to obtain access token from Zerodha.');
    }

    return {
        accessToken: data.data.access_token,
        publicToken: data.data.public_token,
        userFirstName: data.data.user_name,
        broker: data.data.broker,
        generatedAt: new Date().toISOString(),
    };
}

async function kiteGet(path, apiKey, accessToken) {
    const res = await fetch(`${KITE_API}${path}`, {
        headers: {
            'X-Kite-Version': KITE_VERSION,
            Authorization: `token ${apiKey}:${accessToken}`,
        },
        signal: AbortSignal.timeout(15000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.status === 'error') {
        console.error(`[kite] GET ${path} failed:`, data);
        throw new Error(data?.message || data?.data?.message || `Kite API error (${res.status})`);
    }
    return data.data;
}

/** User's Kite profile — proves the connection is alive. Returns null if unusable. */
export async function getKiteProfile(apiKey, accessToken) {
    const p = await kiteGet('/user/profile', apiKey, accessToken);
    return {
        userShortname: p?.user_shortname,
        userName: p?.user_name ?? p?.user_id,
        broker: p?.broker,
        email: p?.email,
    };
}

/** Current holdings, read-only. Includes live price, quantity & averages. */
export async function getHoldings(apiKey, accessToken) {
    const holdings = await kiteGet('/portfolio/holdings', apiKey, accessToken);
    const rows = (holdings ?? []).map((h) => ({
        symbol: h.tradingsymbol,
        name: h.name ?? h.tradingsymbol,
        quantity: h.quantity,
        averagePrice: h.average_price,
        lastPrice: h.last_price,
        currentValue: Number(h.last_price ?? 0) * Number(h.quantity ?? 0),
        investedValue: Number(h.average_price ?? 0) * Number(h.quantity ?? 0),
        pnl: h.pnl ?? null,
        pnlPercent: h?.pnl && h?.average_price && h?.quantity
            ? (h.pnl / (h.average_price * h.quantity)) * 100
            : null,
    }));

    const totalValue = rows.reduce((a, r) => a + (r.currentValue || 0), 0);
    const totalInvestment = rows.reduce((a, r) => a + (r.investedValue || 0), 0);
    const totalPnl = totalValue - totalInvestment;
    const totalPnlPercent = totalInvestment > 0 ? (totalPnl / totalInvestment) * 100 : 0;

    return {
        holdings: rows,
        summary: {
            totalValue,
            totalInvestment,
            totalPnl,
            totalPnlPercent,
            holdingsCount: rows.length,
        },
        fetchedAt: new Date().toISOString(),
    };
}

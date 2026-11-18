/**
 * NSE (National Stock Exchange) trending-stocks service.
 *
 * Mirrors the approach of StockPriceService.cs in the original .NET app:
 * 1. "Seed" a session by visiting nseindia.com with browser-like headers
 *    so NSE sets its cookies.
 * 2. Reuse those cookies for the JSON data endpoints.
 * 3. Re-seed and retry once on failure.
 */

import { getQuotes } from './yahoo.js';

const BASE = 'https://www.nseindia.com';

// Used when nseindia.com blocks the server (common on cloud/CI networks).
// Prices still come from Yahoo Finance, so the Trending page stays useful.
const FALLBACK_SYMBOLS = [
    'RELIANCE', 'TCS', 'HDFCBANK', 'ICICIBANK', 'INFY', 'SBIN', 'BHARTIARTL',
    'ITC', 'LT', 'HINDUNILVR', 'KOTAKBANK', 'AXISBANK', 'BAJFINANCE',
    'ASIANPAINT', 'MARUTI', 'TITAN', 'SUNPHARMA', 'WIPRO', 'ULTRACEMCO',
    'NESTLEIND', 'POWERGRID', 'NTPC', 'TATAPOWER', 'TATASTEEL', 'ADANIENT',
    'ADANIPORTS', 'JSWSTEEL', 'TECHM', 'HCLTECH', 'GRASIM',
];

// NSE blocks many server networks; cache both sources briefly so the client's
// 30-second auto-refresh doesn't hammer the upstream APIs.
const TRENDING_TTL_MS = 20_000;
let trendingCache = { at: 0, data: null };

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    Connection: 'keep-alive',
    'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124", "Not.A/Brand";v="99"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
    Referer: 'https://www.nseindia.com/market-data/live-equity-market',
};

let cookieJar = '';
let lastSeedAt = 0;
let seeding = null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function seed() {
    const parts = [];
    for (const url of [`${BASE}/`, `${BASE}/market-data/live-equity-market`]) {
        try {
            const res = await fetch(url, {
                headers: { ...HEADERS },
                redirect: 'follow',
                signal: AbortSignal.timeout(8000),
            });
            const setCookies = res.headers.getSetCookie?.() ?? [];
            parts.push(...setCookies.map((c) => c.split(';')[0]));
            await sleep(300);
        } catch (err) {
            console.error(`[nse] seed step failed for ${url}:`, err.message);
        }
    }
    cookieJar = parts.join('; ');
    lastSeedAt = Date.now();
    if (!cookieJar) throw new Error('NSE did not return any session cookies.');
}

async function ensureSeeded() {
    const age = Date.now() - lastSeedAt;
    if (cookieJar && age < 4 * 60 * 1000) return; // refresh jar every ~4 min
    if (!seeding) {
        seeding = seed().finally(() => { seeding = null; });
    }
    return seeding;
}

async function getNseJson(url) {
    await ensureSeeded();
    try {
        const res = await fetch(url, {
            headers: { ...HEADERS, Cookie: cookieJar },
            signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) throw new Error(`NSE returned ${res.status}`);
        return await res.json();
    } catch (err) {
        // Re-seed once and retry
        console.error('[nse] request failed, retrying after re-seed:', err.message);
        await seed();
        const res = await fetch(url, {
            headers: { ...HEADERS, Cookie: cookieJar },
            signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) throw new Error(`NSE returned ${res.status} after retry`);
        return await res.json();
    }
}

const mapRow = (r) => ({
    symbol: r.symbol,
    name: r.symbol ? (r.companyName || r.symbol) : null,
    lastPrice: r.lastPrice ?? null,
    change: r.change ?? null,
    percentChange: r.pChange ?? null,
    open: r.open ?? null,
    dayHigh: r.dayHigh ?? null,
    dayLow: r.dayLow ?? null,
    previousClose: r.previousClose ?? null,
    yearHigh: r.yearHigh ?? null,
    yearLow: r.yearLow ?? null,
    volume: r.totalTradedVolume ?? null,
    value: r.totalTradedValue ?? null,
});

/**
 * Trending stocks from NSE: the most-moved constituents of NIFTY 50
 * (limitable moves from the live equity market feed).
 */
export async function getTrendingStocks() {
    if (trendingCache.data && Date.now() - trendingCache.at < TRENDING_TTL_MS) {
        return trendingCache.data;
    }

    let result;
    try {
        const data = await getNseJson(`${BASE}/api/equity-stockIndices?index=NIFTY%2050`);
        const rows = (data?.data ?? []).filter((r) => r.symbol && !['NIFTY 50', 'NIFTY 500'].includes(r.symbol));
        const mapped = rows.map(mapRow);

        if (mapped.length === 0) throw new Error('NSE returned no rows.');

        // "Trending" = largest absolute % change, with better-traded names ranked first on ties
        mapped.sort((a, b) => Math.abs(b.percentChange ?? 0) - Math.abs(a.percentChange ?? 0) || (b.volume ?? 0) - (a.volume ?? 0));

        result = {
            fetchedAt: new Date().toISOString(),
            index: 'NIFTY 50',
            source: 'nse',
            stocks: mapped.slice(0, 30),
        };
    } catch (err) {
        console.error('[nse] trending unavailable, using Yahoo fallback:', err.message);
        result = await getFallbackTrending();
    }

    trendingCache = { at: Date.now(), data: result };
    return result;
}

/** Build the same trending payload from Yahoo quotes when NSE is blocked. */
async function getFallbackTrending() {
    const quotes = await getQuotes(FALLBACK_SYMBOLS, 'NSE');
    const stocks = FALLBACK_SYMBOLS
        .map((symbol) => {
            const q = quotes[symbol];
            if (!q || q.price == null) return null;
            return {
                symbol,
                name: q.name || symbol,
                lastPrice: q.price,
                change: q.change,
                percentChange: q.changePercent,
                open: q.open,
                dayHigh: q.dayHigh,
                dayLow: q.dayLow,
                previousClose: q.previousClose,
                yearHigh: q.fiftyTwoWeekHigh,
                yearLow: q.fiftyTwoWeekLow,
                volume: q.volume,
                value: q.volume != null ? q.volume * q.price : null,
            };
        })
        .filter(Boolean)
        .sort((a, b) => Math.abs(b.percentChange ?? 0) - Math.abs(a.percentChange ?? 0));

    if (stocks.length === 0) {
        throw new Error('Neither NSE nor Yahoo Finance is reachable right now.');
    }

    return {
        fetchedAt: new Date().toISOString(),
        index: 'NIFTY 50',
        source: 'yahoo-fallback',
        stocks: stocks.slice(0, 30),
    };
}

/** Validate a symbol exists on NSE (used when adding to wishlist). */
export async function isValidNseSymbol(symbol) {
    try {
        const data = await getNseJson(`${BASE}/api/quote-equity?symbol=${encodeURIComponent(symbol)}`);
        return !!(data?.symbol || data?.info?.symbol);
    } catch {
        return false;
    }
}

/**
 * Yahoo Finance price/details service.
 * Replaces the C# usage of the Yahoo Finance API for live quotes,
 * basic fundamentals and stock search.
 *
 * Uses the public chart endpoint (no auth required).
 * Symbols on NSE get a ".NS" suffix (e.g. RELIANCE.NS).
 */

const DEFAULT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    Accept: 'application/json,text/plain,*/*',
    'Accept-Language': 'en-US,en;q=0.9',
};

export function toYahooSymbol(symbol, exchange = 'NSE') {
    if (/[.=^]/.test(symbol)) return symbol;           // already suffixed, or an index (^NSEI)
    if (exchange === 'BSE') return `${symbol}.BO`;
    return `${symbol}.NS`;
}

export function stripYahooSymbol(sym) {
    return String(sym || '').replace(/\.(NS|BO)$/i, '').toUpperCase();
}

async function getJson(url, timeoutMs = 12000) {
    const res = await fetch(url, { headers: DEFAULT_HEADERS, signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) {
        const err = new Error(`Yahoo returned ${res.status} for ${url}`);
        err.status = res.status;
        throw err;
    }
    return res.json();
}

/** Live quote for a single symbol (NSE default). Returns null when not found. */
export async function getQuote(symbol, exchange = 'NSE') {
    try {
        const data = await getJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(toYahooSymbol(symbol, exchange))}?range=1d&interval=5m`);
        const result = data?.chart?.result?.[0];
        const meta = result?.meta;
        if (!meta) return null;

        // The chart meta sometimes omits open/high/low/volume, so fall back to
        // the intraday candle series (same approach as the original .NET view).
        const candles = result?.indicators?.quote?.[0] ?? {};
        const first = (arr) => (Array.isArray(arr) ? arr.find((v) => v != null) ?? null : null);
        const last = (arr) => (Array.isArray(arr) ? [...arr].reverse().find((v) => v != null) ?? null : null);
        const highValues = (candles.high ?? []).filter((v) => v != null);
        const lowValues = (candles.low ?? []).filter((v) => v != null);

        const prevClose = meta.chartPreviousClose ?? meta.previousClose;
        const price = meta.regularMarketPrice ?? meta.price ?? last(candles.close);
        const pct = prevClose ? ((price - prevClose) / prevClose) * 100 : 0;

        return {
            symbol: stripYahooSymbol(meta.symbol ?? symbol),
            name: meta.longName ?? meta.shortName ?? null,
            price,
            open: meta.regularMarketOpen ?? first(candles.open),
            previousClose: prevClose,
            change: price != null && prevClose != null ? price - prevClose : null,
            changePercent: Number(pct.toFixed(2)),
            currency: meta.currency ?? 'INR',
            exchange,
            dayHigh: meta.regularMarketDayHigh ?? (highValues.length ? Math.max(...highValues) : null),
            dayLow: meta.regularMarketDayLow ?? (lowValues.length ? Math.min(...lowValues) : null),
            fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh ?? null,
            fiftyTwoWeekLow: meta.fiftyTwoWeekLow ?? null,
            volume: meta.regularMarketVolume ?? last(candles.volume),
            marketCap: meta.marketCap ?? null,
            fetchedAt: new Date().toISOString(),
        };
    } catch (err) {
        console.error(`[yahoo] quote failed for ${symbol}:`, err.message);
        return null;
    }
}

/** Batched live quotes (concurrency-limited). */
export async function getQuotes(symbols, exchange = 'NSE') {
    const results = await Promise.all(symbols.slice(0, 40).map((s) => getQuote(s, exchange)));
    const map = {};
    symbols.forEach((s, i) => { map[stripYahooSymbol(s)] = results[i]; });
    return map;
}

/**
 * Batched quotes for database rows that store their own exchange.
 * Returns a map keyed by "SYMBOL|EXCHANGE" so the same symbol can be held on
 * both NSE and BSE without one quote overwriting the other.
 */
export async function getQuotesForItems(items, symbolKey = 'stock_symbol', exchangeKey = 'exchange') {
    const groups = new Map();
    for (const item of items) {
        const symbol = String(item[symbolKey] ?? '').trim().toUpperCase();
        if (!symbol) continue;
        const exchange = String(item[exchangeKey] ?? 'NSE').trim().toUpperCase() || 'NSE';
        if (!groups.has(exchange)) groups.set(exchange, new Set());
        groups.get(exchange).add(symbol);
    }

    const map = {};
    await Promise.all([...groups].map(async ([exchange, symbols]) => {
        const list = [...symbols].slice(0, 40);
        const results = await Promise.all(list.map((s) => getQuote(s, exchange)));
        list.forEach((s, i) => { map[`${s}|${exchange}`] = results[i]; });
    }));
    return map;
}

const HISTORY_RANGES = {
    '1d': { range: '1d', interval: '5m' },
    '5d': { range: '5d', interval: '30m' },
    '1mo': { range: '1mo', interval: '1d' },
    '3mo': { range: '3mo', interval: '1d' },
    '6mo': { range: '6mo', interval: '1d' },
    '1y': { range: '1y', interval: '1d' },
};

export function normalizeHistoryRange(range) {
    const key = String(range ?? '').trim().toLowerCase();
    return HISTORY_RANGES[key] ? key : '1mo';
}

/** Price closes for the requested range. Returns [] when unavailable. */
export async function getHistory(symbol, exchange = 'NSE', range = '1mo') {
    const spec = HISTORY_RANGES[normalizeHistoryRange(range)];
    try {
        const data = await getJson(
            `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(toYahooSymbol(symbol, exchange))}?range=${spec.range}&interval=${spec.interval}`
        );
        const result = data?.chart?.result?.[0];
        const timestamps = result?.timestamp ?? [];
        const quote = result?.indicators?.quote?.[0] ?? {};
        const closes = quote.close ?? [];
        const volumes = quote.volume ?? [];
        return timestamps.map((ts, i) => {
            const iso = new Date(ts * 1000).toISOString();
            return {
                date: iso.slice(0, 10),
                time: iso,
                close: closes[i],
                volume: volumes[i],
            };
        }).filter((r) => r.close != null);
    } catch (err) {
        console.error(`[yahoo] history failed for ${symbol}:`, err.message);
        return [];
    }
}

/** Stock search (used for the "add stock" typeahead). */
export async function searchStocks(q, limit = 10) {
    if (!q) return [];
    try {
        const data = await getJson(`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=${limit}&newsCount=0`);
        const quotes = data?.quotes ?? [];
        return quotes
            .filter((it) => it.symbol && (it.quoteType === 'EQUITY' || it.quoteType === 'ETF'))
            .map((it) => ({
                symbol: stripYahooSymbol(it.symbol),
                yahooSymbol: it.symbol,
                name: it.shortname || it.longname || it.symbol,
                exchange: it.exchDisp || it.exchange || 'NSE',
            }));
    } catch (err) {
        console.error('[yahoo] search failed:', err.message);
        return [];
    }
}

/**
 * Basic fundamentals + technical-ish details for the Stock Details page.
 * Uses chart meta plus the assetProfile/quoteSummary endpoints.
 */
export async function getStockDetails(symbol, exchange = 'NSE') {
    const ySym = toYahooSymbol(symbol, exchange);
    const quote = await getQuote(symbol, exchange);
    if (!quote) return null;

    let fundamentals = {};
    try {
        const data = await getJson(`https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ySym)}?modules=assetProfile,summaryDetail,defaultKeyStatistics,financialData`);
        const r = data?.quoteSummary?.result?.[0] ?? {};
        const summary = r.summaryDetail ?? {};
        const stats = r.defaultKeyStatistics ?? {};
        const fin = r.financialData ?? {};
        const num = (o) => (o && typeof o.raw === 'number' ? o.raw : null);
        fundamentals = {
            longName: summary.longName || null,
            sector: r.assetProfile?.sector ?? null,
            industry: r.assetProfile?.industry ?? null,
            website: r.assetProfile?.website ?? null,
            about: r.assetProfile?.longBusinessSummary ?? null,
            marketCap: num(summary.marketCap),
            peRatio: num(summary.trailingPE) ?? num(stats.trailingEps_forwardRatio) ?? null,
            forwardPE: num(summary.forwardPE),
            dividendYield: num(summary.dividendYield),
            fiftyTwoWeekHigh: num(summary.fiftyTwoWeekHigh),
            fiftyTwoWeekLow: num(summary.fiftyTwoWeekLow),
            avgVolume: num(summary.averageVolume),
            targetMeanPrice: num(fin.targetMeanPrice),
            recommendationKey: fin.recommendationKey ?? null,
        };
    } catch {
        // quoteSummary sometimes throttled — degrade gracefully
    }

    return { ...quote, ...fundamentals };
}

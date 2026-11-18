/**
 * Identify the NSE/BSE stock (or index) a chat question is about.
 *
 * Two passes:
 *   1. A curated alias table for the names Indian retail investors use most
 *      ("Reliance", "TCS", "HDFC Bank", "Nifty 50", …).
 *   2. A cleaned Yahoo Finance symbol search for anything not in the table.
 *
 * The result is fed to getQuote() so the assistant can quote a live price
 * instead of relying on stale model knowledge.
 */

import { searchStocks, stripYahooSymbol } from './yahoo.js';

const NSE = 'NSE';
const BSE = 'BSE';

// [alias, { symbol, exchange, name }]
// Aliases are matched on lower-cased, whitespace-collapsed questions. Longer
// aliases always win, so "hdfc bank" beats "hdfc" and "tata consultancy
// services" beats "tata consultancy".
const ALIASES = [
    // Indices
    ['nifty 50', { symbol: '^NSEI', exchange: NSE, name: 'Nifty 50' }],
    ['nifty50', { symbol: '^NSEI', exchange: NSE, name: 'Nifty 50' }],
    ['nifty', { symbol: '^NSEI', exchange: NSE, name: 'Nifty 50' }],
    ['bank nifty', { symbol: '^NSEBANK', exchange: NSE, name: 'Bank Nifty' }],
    ['banknifty', { symbol: '^NSEBANK', exchange: NSE, name: 'Bank Nifty' }],
    ['sensex', { symbol: '^BSESN', exchange: BSE, name: 'Sensex' }],

    // Large caps / most-asked names
    ['reliance industries', { symbol: 'RELIANCE', exchange: NSE, name: 'Reliance Industries' }],
    ['reliance', { symbol: 'RELIANCE', exchange: NSE, name: 'Reliance Industries' }],
    ['ril', { symbol: 'RELIANCE', exchange: NSE, name: 'Reliance Industries' }],
    ['tata consultancy services', { symbol: 'TCS', exchange: NSE, name: 'Tata Consultancy Services' }],
    ['tata consultancy', { symbol: 'TCS', exchange: NSE, name: 'Tata Consultancy Services' }],
    ['tcs', { symbol: 'TCS', exchange: NSE, name: 'Tata Consultancy Services' }],
    ['infosys', { symbol: 'INFY', exchange: NSE, name: 'Infosys' }],
    ['infy', { symbol: 'INFY', exchange: NSE, name: 'Infosys' }],
    ['hdfc bank', { symbol: 'HDFCBANK', exchange: NSE, name: 'HDFC Bank' }],
    ['hdfcbank', { symbol: 'HDFCBANK', exchange: NSE, name: 'HDFC Bank' }],
    ['hdfc', { symbol: 'HDFCBANK', exchange: NSE, name: 'HDFC Bank' }],
    ['icici bank', { symbol: 'ICICIBANK', exchange: NSE, name: 'ICICI Bank' }],
    ['icicibank', { symbol: 'ICICIBANK', exchange: NSE, name: 'ICICI Bank' }],
    ['state bank of india', { symbol: 'SBIN', exchange: NSE, name: 'State Bank of India' }],
    ['state bank', { symbol: 'SBIN', exchange: NSE, name: 'State Bank of India' }],
    ['sbi', { symbol: 'SBIN', exchange: NSE, name: 'State Bank of India' }],
    ['axis bank', { symbol: 'AXISBANK', exchange: NSE, name: 'Axis Bank' }],
    ['axisbank', { symbol: 'AXISBANK', exchange: NSE, name: 'Axis Bank' }],
    ['kotak mahindra bank', { symbol: 'KOTAKBANK', exchange: NSE, name: 'Kotak Mahindra Bank' }],
    ['kotak bank', { symbol: 'KOTAKBANK', exchange: NSE, name: 'Kotak Mahindra Bank' }],
    ['kotak', { symbol: 'KOTAKBANK', exchange: NSE, name: 'Kotak Mahindra Bank' }],
    ['bharti airtel', { symbol: 'BHARTIARTL', exchange: NSE, name: 'Bharti Airtel' }],
    ['airtel', { symbol: 'BHARTIARTL', exchange: NSE, name: 'Bharti Airtel' }],
    ['itc', { symbol: 'ITC', exchange: NSE, name: 'ITC' }],
    ['larsen and toubro', { symbol: 'LT', exchange: NSE, name: 'Larsen & Toubro' }],
    ['larsen & toubro', { symbol: 'LT', exchange: NSE, name: 'Larsen & Toubro' }],
    ['larsen', { symbol: 'LT', exchange: NSE, name: 'Larsen & Toubro' }],
    ['l&t', { symbol: 'LT', exchange: NSE, name: 'Larsen & Toubro' }],
    ['wipro', { symbol: 'WIPRO', exchange: NSE, name: 'Wipro' }],
    ['hcl technologies', { symbol: 'HCLTECH', exchange: NSE, name: 'HCL Technologies' }],
    ['hcl tech', { symbol: 'HCLTECH', exchange: NSE, name: 'HCL Technologies' }],
    ['hcl', { symbol: 'HCLTECH', exchange: NSE, name: 'HCL Technologies' }],
    ['tech mahindra', { symbol: 'TECHM', exchange: NSE, name: 'Tech Mahindra' }],
    ['ltimindtree', { symbol: 'LTIM', exchange: NSE, name: 'LTIMindtree' }],
    ['ltim', { symbol: 'LTIM', exchange: NSE, name: 'LTIMindtree' }],
    ['mphasis', { symbol: 'MPHASIS', exchange: NSE, name: 'Mphasis' }],
    ['persistent systems', { symbol: 'PERSISTENT', exchange: NSE, name: 'Persistent Systems' }],
    ['coforge', { symbol: 'COFORGE', exchange: NSE, name: 'Coforge' }],
    ['adani enterprises', { symbol: 'ADANIENT', exchange: NSE, name: 'Adani Enterprises' }],
    ['adani ports', { symbol: 'ADANIPORTS', exchange: NSE, name: 'Adani Ports' }],
    ['adani green', { symbol: 'ADANIGREEN', exchange: NSE, name: 'Adani Green Energy' }],
    ['adani power', { symbol: 'ADANIPOWER', exchange: NSE, name: 'Adani Power' }],
    ['maruti suzuki', { symbol: 'MARUTI', exchange: NSE, name: 'Maruti Suzuki' }],
    ['maruti', { symbol: 'MARUTI', exchange: NSE, name: 'Maruti Suzuki' }],
    ['bajaj finance', { symbol: 'BAJFINANCE', exchange: NSE, name: 'Bajaj Finance' }],
    ['bajaj finserv', { symbol: 'BAJAJFINSV', exchange: NSE, name: 'Bajaj Finserv' }],
    ['bajaj auto', { symbol: 'BAJAJ-AUTO', exchange: NSE, name: 'Bajaj Auto' }],
    ['sun pharma', { symbol: 'SUNPHARMA', exchange: NSE, name: 'Sun Pharmaceutical' }],
    ['dr reddy', { symbol: 'DRREDDY', exchange: NSE, name: "Dr. Reddy's Laboratories" }],
    ['tata motors', { symbol: 'TATAMOTORS', exchange: NSE, name: 'Tata Motors' }],
    ['tata steel', { symbol: 'TATASTEEL', exchange: NSE, name: 'Tata Steel' }],
    ['tata power', { symbol: 'TATAPOWER', exchange: NSE, name: 'Tata Power' }],
    ['tata consumer', { symbol: 'TATACONSUM', exchange: NSE, name: 'Tata Consumer Products' }],
    ['tata elxsi', { symbol: 'TATAELXSI', exchange: NSE, name: 'Tata Elxsi' }],
    ['jsw steel', { symbol: 'JSWSTEEL', exchange: NSE, name: 'JSW Steel' }],
    ['jindal steel', { symbol: 'JINDALSTEL', exchange: NSE, name: 'Jindal Steel' }],
    ['hindalco', { symbol: 'HINDALCO', exchange: NSE, name: 'Hindalco Industries' }],
    ['vedanta', { symbol: 'VEDL', exchange: NSE, name: 'Vedanta' }],
    ['ntpc', { symbol: 'NTPC', exchange: NSE, name: 'NTPC' }],
    ['power grid', { symbol: 'POWERGRID', exchange: NSE, name: 'Power Grid Corporation' }],
    ['ongc', { symbol: 'ONGC', exchange: NSE, name: 'ONGC' }],
    ['coal india', { symbol: 'COALINDIA', exchange: NSE, name: 'Coal India' }],
    ['indian oil', { symbol: 'IOC', exchange: NSE, name: 'Indian Oil Corporation' }],
    ['ioc', { symbol: 'IOC', exchange: NSE, name: 'Indian Oil Corporation' }],
    ['bpcl', { symbol: 'BPCL', exchange: NSE, name: 'Bharat Petroleum' }],
    ['hpcl', { symbol: 'HPCL', exchange: NSE, name: 'Hindustan Petroleum' }],
    ['gail', { symbol: 'GAIL', exchange: NSE, name: 'GAIL India' }],
    ['bhel', { symbol: 'BHEL', exchange: NSE, name: 'BHEL' }],
    ['titan company', { symbol: 'TITAN', exchange: NSE, name: 'Titan Company' }],
    ['titan', { symbol: 'TITAN', exchange: NSE, name: 'Titan Company' }],
    ['asian paints', { symbol: 'ASIANPAINT', exchange: NSE, name: 'Asian Paints' }],
    ['hindustan unilever', { symbol: 'HINDUNILVR', exchange: NSE, name: 'Hindustan Unilever' }],
    ['hul', { symbol: 'HINDUNILVR', exchange: NSE, name: 'Hindustan Unilever' }],
    ['nestle india', { symbol: 'NESTLEIND', exchange: NSE, name: 'Nestle India' }],
    ['nestle', { symbol: 'NESTLEIND', exchange: NSE, name: 'Nestle India' }],
    ['ultratech cement', { symbol: 'ULTRACEMCO', exchange: NSE, name: 'UltraTech Cement' }],
    ['ultracemco', { symbol: 'ULTRACEMCO', exchange: NSE, name: 'UltraTech Cement' }],
    ['avenue supermarts', { symbol: 'DMART', exchange: NSE, name: 'Avenue Supermarts (DMart)' }],
    ['dmart', { symbol: 'DMART', exchange: NSE, name: 'Avenue Supermarts (DMart)' }],
    ['zomato', { symbol: 'ZOMATO', exchange: NSE, name: 'Zomato' }],
    ['eternal', { symbol: 'ETERNAL', exchange: NSE, name: 'Eternal' }],
    ['paytm', { symbol: 'PAYTM', exchange: NSE, name: 'One97 Communications (Paytm)' }],
    ['one97', { symbol: 'PAYTM', exchange: NSE, name: 'One97 Communications (Paytm)' }],
    ['irctc', { symbol: 'IRCTC', exchange: NSE, name: 'IRCTC' }],
    ['irfc', { symbol: 'IRFC', exchange: NSE, name: 'Indian Railway Finance Corporation' }],
    ['hindustan aeronautics', { symbol: 'HAL', exchange: NSE, name: 'Hindustan Aeronautics' }],
    ['bharat electronics', { symbol: 'BEL', exchange: NSE, name: 'Bharat Electronics' }],
    ['jio financial', { symbol: 'JIOFIN', exchange: NSE, name: 'Jio Financial Services' }],
    ['life insurance corporation', { symbol: 'LICI', exchange: NSE, name: 'Life Insurance Corporation' }],
    ['lic', { symbol: 'LICI', exchange: NSE, name: 'Life Insurance Corporation' }],
    ['indusind bank', { symbol: 'INDUSINDBK', exchange: NSE, name: 'IndusInd Bank' }],
    ['federal bank', { symbol: 'FEDERALBNK', exchange: NSE, name: 'Federal Bank' }],
    ['yes bank', { symbol: 'YESBANK', exchange: NSE, name: 'Yes Bank' }],
    ['punjab national bank', { symbol: 'PNB', exchange: NSE, name: 'Punjab National Bank' }],
    ['pnb', { symbol: 'PNB', exchange: NSE, name: 'Punjab National Bank' }],
    ['bank of baroda', { symbol: 'BANKBARODA', exchange: NSE, name: 'Bank of Baroda' }],
    ['canara bank', { symbol: 'CANBK', exchange: NSE, name: 'Canara Bank' }],
    ['idfc first', { symbol: 'IDFCFIRSTB', exchange: NSE, name: 'IDFC First Bank' }],
    ['mahindra & mahindra', { symbol: 'M&M', exchange: NSE, name: 'Mahindra & Mahindra' }],
    ['mahindra and mahindra', { symbol: 'M&M', exchange: NSE, name: 'Mahindra & Mahindra' }],
    ['m&m', { symbol: 'M&M', exchange: NSE, name: 'Mahindra & Mahindra' }],
    ['hero motocorp', { symbol: 'HEROMOTOCO', exchange: NSE, name: 'Hero MotoCorp' }],
    ['eicher motors', { symbol: 'EICHERMOT', exchange: NSE, name: 'Eicher Motors' }],
    ['ashok leyland', { symbol: 'ASHOKLEY', exchange: NSE, name: 'Ashok Leyland' }],
    ['interglobe aviation', { symbol: 'INDIGO', exchange: NSE, name: 'InterGlobe Aviation (IndiGo)' }],
    ['indigo', { symbol: 'INDIGO', exchange: NSE, name: 'InterGlobe Aviation (IndiGo)' }],
    ['apollo hospitals', { symbol: 'APOLLOHOSP', exchange: NSE, name: 'Apollo Hospitals' }],
    ['max healthcare', { symbol: 'MAXHEALTH', exchange: NSE, name: 'Max Healthcare' }],
    ['cipla', { symbol: 'CIPLA', exchange: NSE, name: 'Cipla' }],
    ['lupin', { symbol: 'LUPIN', exchange: NSE, name: 'Lupin' }],
    ['divis labs', { symbol: 'DIVISLAB', exchange: NSE, name: "Divi's Laboratories" }],
    ['biocon', { symbol: 'BIOCON', exchange: NSE, name: 'Biocon' }],
    ['zydus', { symbol: 'ZYDUSLIFE', exchange: NSE, name: 'Zydus Lifesciences' }],
    ['aurobindo pharma', { symbol: 'AUROPHARMA', exchange: NSE, name: 'Aurobindo Pharma' }],
    ['torrent pharma', { symbol: 'TORNTPHARM', exchange: NSE, name: 'Torrent Pharmaceuticals' }],
    ['hdfc life', { symbol: 'HDFCLIFE', exchange: NSE, name: 'HDFC Life Insurance' }],
    ['sbi life', { symbol: 'SBILIFE', exchange: NSE, name: 'SBI Life Insurance' }],
    ['icici prudential', { symbol: 'ICICIPRULI', exchange: NSE, name: 'ICICI Prudential Life' }],
    ['icici lombard', { symbol: 'ICICIGI', exchange: NSE, name: 'ICICI Lombard' }],
    ['hdfc amc', { symbol: 'HDFCAMC', exchange: NSE, name: 'HDFC Asset Management' }],
    ['britannia', { symbol: 'BRITANNIA', exchange: NSE, name: 'Britannia Industries' }],
    ['dabur', { symbol: 'DABUR', exchange: NSE, name: 'Dabur India' }],
    ['godrej consumer', { symbol: 'GODREJCP', exchange: NSE, name: 'Godrej Consumer Products' }],
    ['pidilite', { symbol: 'PIDILITIND', exchange: NSE, name: 'Pidilite Industries' }],
    ['berger paints', { symbol: 'BERGEPAINT', exchange: NSE, name: 'Berger Paints' }],
    ['colgate', { symbol: 'COLPAL', exchange: NSE, name: 'Colgate-Palmolive India' }],
    ['trent', { symbol: 'TRENT', exchange: NSE, name: 'Trent' }],
    ['page industries', { symbol: 'PAGEIND', exchange: NSE, name: 'Page Industries' }],
    ['varun beverages', { symbol: 'VBL', exchange: NSE, name: 'Varun Beverages' }],
    ['jubilant food', { symbol: 'JUBLFOOD', exchange: NSE, name: 'Jubilant FoodWorks' }],
    ['indian hotels', { symbol: 'INDHOTEL', exchange: NSE, name: 'Indian Hotels' }],
    ['delhivery', { symbol: 'DELHIVERY', exchange: NSE, name: 'Delhivery' }],
    ['nykaa', { symbol: 'NYKAA', exchange: NSE, name: 'FSN E-Commerce (Nykaa)' }],
    ['swiggy', { symbol: 'SWIGGY', exchange: NSE, name: 'Swiggy' }],
    ['policybazaar', { symbol: 'POLICYBZR', exchange: NSE, name: 'PB Fintech (Policybazaar)' }],
    ['pb fintech', { symbol: 'POLICYBZR', exchange: NSE, name: 'PB Fintech (Policybazaar)' }],
    ['ola electric', { symbol: 'OLAELEC', exchange: NSE, name: 'Ola Electric Mobility' }],
    ['honasa', { symbol: 'HONASA', exchange: NSE, name: 'Honasa Consumer (Mamaearth)' }],
    ['mamaearth', { symbol: 'HONASA', exchange: NSE, name: 'Honasa Consumer (Mamaearth)' }],
    ['angel one', { symbol: 'ANGELONE', exchange: NSE, name: 'Angel One' }],
    ['cdsl', { symbol: 'CDSL', exchange: NSE, name: 'Central Depository Services' }],
    ['motilal oswal', { symbol: 'MOTILALOFS', exchange: NSE, name: 'Motilal Oswal Financial Services' }],
    ['suzlon', { symbol: 'SUZLON', exchange: NSE, name: 'Suzlon Energy' }],
    ['vodafone idea', { symbol: 'IDEA', exchange: NSE, name: 'Vodafone Idea' }],
    ['hindustan zinc', { symbol: 'HINDZINC', exchange: NSE, name: 'Hindustan Zinc' }],
    ['bosch', { symbol: 'BOSCHLTD', exchange: NSE, name: 'Bosch' }],
    ['siemens', { symbol: 'SIEMENS', exchange: NSE, name: 'Siemens India' }],
    ['cummins', { symbol: 'CUMMINSIND', exchange: NSE, name: 'Cummins India' }],
    ['oracle financial', { symbol: 'OFSS', exchange: NSE, name: 'Oracle Financial Services' }],
];

const SORTED_ALIASES = ALIASES
    .map(([alias, target]) => ({ alias: alias.toLowerCase(), target }))
    .sort((a, b) => b.alias.length - a.alias.length);

const SEARCH_STOPWORDS = new Set([
    'what', 'whats', 'what is', 'is', 'are', 'was', 'were', 'the', 'a', 'an', 'of', 'for', 'on',
    'in', 'at', 'to', 'me', 'my', 'please', 'tell', 'give', 'show', 'find', 'get', 'know', 'about',
    'current', 'currently', 'latest', 'recent', 'today', 'todays', 'now', 'live', 'ltp',
    'share', 'shares', 'stock', 'stocks', 'scrip', 'price', 'prices', 'quote', 'quotes',
    'value', 'worth', 'rupees', 'inr', 'nse', 'bse', 'india', 'indian', 'market', 'markets',
    'news', 'update', 'updates', 'analysis', 'analyze', 'analyse', 'trend', 'trending',
    'performance', 'performing', 'doing', 'going', 'high', 'low', '52', 'week', 'year',
    'target', 'buy', 'sell', 'hold', 'should', 'how', 'why', 'when', 'which', 'who',
    'trading', 'trade', 'and', 'or', 'vs', 'versus'
]);

const UPPER_STOPWORDS = new Set([
    'WHAT', 'WHATS', 'THE', 'IS', 'ARE', 'WAS', 'WERE', 'OF', 'FOR', 'ON', 'IN', 'AT', 'TO',
    'ME', 'MY', 'PLEASE', 'TELL', 'GIVE', 'SHOW', 'FIND', 'GET', 'KNOW', 'ABOUT',
    'CURRENT', 'CURRENTLY', 'LATEST', 'RECENT', 'TODAY', 'NOW', 'LIVE', 'LTP',
    'SHARE', 'SHARES', 'STOCK', 'STOCKS', 'PRICE', 'PRICES', 'QUOTE', 'QUOTES',
    'NEWS', 'UPDATE', 'UPDATES', 'ANALYSIS', 'ANALYZE', 'ANALYSE', 'TREND', 'TRENDING',
    'HIGH', 'LOW', 'TARGET', 'BUY', 'SELL', 'HOLD', 'SHOULD', 'HOW', 'WHY', 'WHEN',
    'WHICH', 'WHO', 'NSE', 'BSE', 'INR', 'INDIA', 'INDIAN', 'MARKET', 'AI', 'OK',
]);

const INDIAN_EXCHANGES = new Set([
    'NSE', 'BSE', 'NSI', 'BOM', 'NATIONAL STOCK EXCHANGE', 'BOMBAY STOCK EXCHANGE',
]);

function normalize(text) {
    return String(text ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findAlias(question) {
    const text = normalize(question);
    for (const { alias, target } of SORTED_ALIASES) {
        const pattern = new RegExp(`(?<![a-z0-9])${escapeRegExp(alias)}(?![a-z0-9])`, 'i');
        if (pattern.test(text)) return { ...target, matchedAlias: alias };
    }
    return null;
}

function isIndianListing(item) {
    if (!item) return false;
    if (/\.(NS|BO)$/i.test(item.yahooSymbol ?? '')) return true;
    return INDIAN_EXCHANGES.has(String(item.exchange ?? '').toUpperCase());
}

function toTarget(item) {
    const yahooSymbol = String(item.yahooSymbol ?? '').toUpperCase();
    return {
        symbol: stripYahooSymbol(item.symbol),
        exchange: yahooSymbol.endsWith('.BO') ? BSE : NSE,
        name: item.name || stripYahooSymbol(item.symbol),
        matchedAlias: null,
    };
}

function searchCandidates(question) {
    const candidates = [];

    // Ticker-like uppercase words: "KPITTECH", "POLYCAB", "M&M"
    const upperTokens = String(question ?? '').match(/\b[A-Z][A-Z0-9&.-]{1,14}\b/g) ?? [];
    for (const token of upperTokens) {
        const cleaned = token.replace(/[.-]+$/, '');
        if (cleaned.length >= 2 && !UPPER_STOPWORDS.has(cleaned.toUpperCase())) {
            candidates.push(cleaned);
        }
    }

    // Natural-language fallback: drop question/price/news words.
    const words = normalize(question)
        .replace(/[^a-z0-9&.\- ]/g, ' ')
        .split(/\s+/)
        .filter((word) => word && !SEARCH_STOPWORDS.has(word));
    if (words.length > 0) candidates.push(words.slice(0, 5).join(' '));

    return [...new Set(candidates)];
}

/**
 * @returns {Promise<{symbol:string, exchange:string, name:string, matchedAlias:string|null}|null>}
 */
export async function extractStock(question) {
    const alias = findAlias(question);
    if (alias) return alias;

    for (const candidate of searchCandidates(question)) {
        const results = await searchStocks(candidate, 8);
        const indian = results.filter(isIndianListing);
        if (indian.length === 0) continue;

        const wanted = candidate.replace(/[^A-Z0-9]/gi, '').toUpperCase();
        const exact = indian.find((item) => (
            stripYahooSymbol(item.symbol).replace(/[^A-Z0-9]/gi, '').toUpperCase() === wanted
        ));

        return toTarget(exact ?? indian[0]);
    }

    return null;
}

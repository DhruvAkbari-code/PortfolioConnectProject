/**
 * Tavily news search for the AI assistant.
 *
 * Docs: https://docs.tavily.com — POST /search with topic "news" returns
 * recent articles (title, url, snippet, published_date). The key stays on the
 * server; the browser only receives the trimmed source list.
 */

const TAVILY_SEARCH_URL = 'https://api.tavily.com/search';
const NEWS_LOOKBACK_DAYS = 14;

export const newsConfigured = () => Boolean(process.env.TAVILY_API_KEY);

/** Questions that should be answered with fresh news context. */
const NEWS_INTENT = /\b(news|headline|latest|today|yesterday|recent|recently|update|updates|announcement|announced|earnings|results|quarterly|q[1-4]|dividend|ipo|merger|acquisition|stake|deal|why|fall|fell|rise|rose|drop|surge|jump|rally|crash|trend|outlook)\b/i;

export function shouldSearchNews(question) {
    return NEWS_INTENT.test(String(question ?? ''));
}

/**
 * Search recent news articles for a question.
 * Returns [] when Tavily found nothing, or null when the search could not run.
 * @returns {Promise<Array<{title:string,url:string,content:string,publishedDate:string|null}>|null>}
 */
export async function searchLatestNews(question, { maxResults = 5 } = {}) {
    if (!newsConfigured()) return null;

    try {
        const res = await fetch(TAVILY_SEARCH_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${process.env.TAVILY_API_KEY}`,
            },
            body: JSON.stringify({
                query: String(question).slice(0, 400),
                topic: 'news',
                search_depth: 'basic',
                max_results: maxResults,
                days: NEWS_LOOKBACK_DAYS,
                include_answer: false,
                include_raw_content: false,
            }),
            signal: AbortSignal.timeout(15_000),
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            console.error('[tavily] news search failed:', data?.detail || data?.error || res.status);
            return null;
        }

        return (data.results ?? [])
            .filter((item) => item?.title && item?.url)
            .map((item) => ({
                title: String(item.title).slice(0, 200),
                url: item.url,
                content: String(item.content ?? '').replace(/\s+/g, ' ').slice(0, 800),
                publishedDate: item.published_date ?? null,
            }));
    } catch (err) {
        // News is an enhancement: never fail the chat because Tavily is down.
        console.error('[tavily] news search error:', err.message);
        return null;
    }
}

/**
 * Fallback price lookup when the direct Yahoo quote feed is unavailable.
 * Tavily's general search returns snippets (and sometimes an answer) that
 * mention the latest traded price. The model is told to cite these sources.
 *
 * @returns {Promise<{answer:string, results:Array, fetchedAt:string}|null>}
 */
export async function searchPriceInfo(stock, { maxResults = 5 } = {}) {
    if (!newsConfigured() || !stock?.symbol) return null;

    const query = `${stock.name || stock.symbol} ${stock.symbol} share price today NSE India INR`;
    try {
        const res = await fetch(TAVILY_SEARCH_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${process.env.TAVILY_API_KEY}`,
            },
            body: JSON.stringify({
                query,
                topic: 'general',
                search_depth: 'basic',
                max_results: maxResults,
                include_answer: 'basic',
                include_raw_content: false,
                time_range: 'week',
            }),
            signal: AbortSignal.timeout(15_000),
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            console.error('[tavily] price lookup failed:', data?.detail || data?.error || res.status);
            return null;
        }

        const results = (data.results ?? [])
            .filter((item) => item?.title && item?.url)
            .map((item) => ({
                title: String(item.title).slice(0, 200),
                url: item.url,
                content: String(item.content ?? '').replace(/\s+/g, ' ').slice(0, 800),
                publishedDate: item.published_date ?? null,
            }));

        if (!data.answer && results.length === 0) return null;
        return {
            answer: String(data.answer ?? '').replace(/\s+/g, ' ').slice(0, 1200),
            results,
            fetchedAt: new Date().toISOString(),
        };
    } catch (err) {
        console.error('[tavily] price lookup error:', err.message);
        return null;
    }
}

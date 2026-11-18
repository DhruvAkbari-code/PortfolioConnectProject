import { Router } from 'express';
import { requireAuth, asyncHandler } from '../middleware/auth.js';
import { askChatbot, streamChatbot, chatbotConfigured } from '../services/openai.js';
import {
    searchLatestNews, searchPriceInfo, shouldSearchNews, newsConfigured,
} from '../services/tavily.js';
import { extractStock } from '../services/stockLookup.js';
import { getQuote } from '../services/yahoo.js';

const router = Router();
router.use(requireAuth); // the AI assistant is available to every signed-in user

// Per-user in-memory conversation history (matches the original .NET session behaviour:
// chat history is not stored in the database)
const chatHistory = new Map(); // userId → [{ role, content, timestamp, quote?, sources? }]
const MAX_HISTORY = 50;

const PRICE_QUERY = /\b(price|prices|quote|ltp|rate|value|trading at|high|low|52[\s-]?week|market cap)\b/i;
const NEWS_TOPIC = /\b(news|headlines?|updates?|announcements?|earnings|results|dividend|ipo|merger|acquisition|deal|why|fall|fell|rise|rose|drop|surge|jump|rally|crash|trend|outlook)\b/i;

/** Pure "what's the price" questions don't need a Tavily news search. */
function wantsNews(question) {
    if (!newsConfigured() || !shouldSearchNews(question)) return false;
    if (PRICE_QUERY.test(question) && !NEWS_TOPIC.test(question)) return false;
    return true;
}

function clockTime(date = new Date()) {
    return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function uniqueSources(...groups) {
    const seen = new Set();
    const out = [];
    for (const group of groups) {
        for (const item of group ?? []) {
            const url = String(item?.url ?? '').trim();
            if (!url || seen.has(url)) continue;
            seen.add(url);
            out.push(item);
        }
    }
    return out;
}

/**
 * Identify the stock, fetch its live quote, and gather fresh news.
 * Quote and news lookups run in parallel; Tavily is only used for a price
 * when the Yahoo feed fails.
 */
async function prepareContext(question) {
    const newsWanted = wantsNews(question);
    const [stock, newsResults] = await Promise.all([
        extractStock(question),
        newsWanted ? searchLatestNews(question) : Promise.resolve(null),
    ]);

    let quote = null;
    let priceInfo = null;
    if (stock) {
        quote = await getQuote(stock.symbol, stock.exchange);
        if (quote) {
            quote = { ...quote, label: stock.name || quote.name || quote.symbol };
        } else if (newsConfigured()) {
            // Live feed unavailable — ask Tavily for the latest reported price.
            priceInfo = await searchPriceInfo(stock);
        }
    }

    const news = newsResults ?? [];
    return {
        stock,
        quote,
        priceInfo,
        news,
        newsRequested: newsWanted && newsResults !== null,
        sources: uniqueSources(news, priceInfo?.results),
    };
}

function contextForModel(context) {
    return {
        news: context.news,
        newsRequested: context.newsRequested,
        quote: context.quote,
        priceInfo: context.priceInfo,
        stock: context.stock,
    };
}

function sendEvent(res, event, data) {
    if (res.writableEnded || res.destroyed) return;
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

// ── GET /api/chat — conversation status + configuration state ──
router.get('/', (req, res) => {
    res.json({
        configured: chatbotConfigured(),
        newsConfigured: newsConfigured(),
        history: (chatHistory.get(req.user.id) ?? []).slice(-20),
    });
});

// ── POST /api/chat — { question } → assistant answer (single JSON response) ──
router.post('/', asyncHandler(async (req, res) => {
    const question = String(req.body?.question ?? '').trim();
    if (!question) {
        return res.status(400).json({ error: 'Please enter a question before sending.' }); // TC-U29
    }

    const history = chatHistory.get(req.user.id) ?? [];
    const context = await prepareContext(question);
    const answer = await askChatbot(question, history, contextForModel(context));

    const timestamp = clockTime();
    const updated = [...history,
        { role: 'user', content: question, timestamp },
        { role: 'assistant', content: answer, timestamp, sources: context.sources, quote: context.quote },
    ].slice(-MAX_HISTORY);
    chatHistory.set(req.user.id, updated);

    res.json({
        success: true,
        answer,
        sources: context.sources,
        quote: context.quote,
        stock: context.stock,
        timestamp,
    });
}));

// ── POST /api/chat/stream — same as above, streamed as Server-Sent Events ──
router.post('/stream', asyncHandler(async (req, res) => {
    const question = String(req.body?.question ?? '').trim();
    if (!question) {
        return res.status(400).json({ error: 'Please enter a question before sending.' });
    }

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const controller = new AbortController();
    res.on('close', () => {
        if (!res.writableEnded) controller.abort();
    });

    const history = chatHistory.get(req.user.id) ?? [];
    const timestamp = clockTime();

    try {
        const context = await prepareContext(question);

        // Send sources/quote first so the UI can render the live price card
        // while the answer is still streaming in.
        sendEvent(res, 'meta', {
            sources: context.sources,
            quote: context.quote,
            stock: context.stock,
            timestamp,
        });

        const answer = await streamChatbot(
            question,
            history,
            contextForModel(context),
            (text) => sendEvent(res, 'delta', { text }),
            { signal: controller.signal },
        );

        const updated = [...history,
            { role: 'user', content: question, timestamp },
            { role: 'assistant', content: answer, timestamp, sources: context.sources, quote: context.quote },
        ].slice(-MAX_HISTORY);
        chatHistory.set(req.user.id, updated);

        sendEvent(res, 'done', {
            answer,
            sources: context.sources,
            quote: context.quote,
            stock: context.stock,
            timestamp,
        });
    } catch (err) {
        console.error('[chat] stream failed:', err.message);
        if (!controller.signal.aborted) {
            sendEvent(res, 'error', {
                message: err.code === 'CHATBOT_NOT_CONFIGURED'
                    ? 'The AI assistant is not configured on the server.'
                    : err.message || 'The assistant failed to respond.',
            });
        }
    } finally {
        if (!res.writableEnded && !res.destroyed) res.end();
    }
}));

// ── POST /api/chat/clear ──
router.post('/clear', (req, res) => {
    chatHistory.delete(req.user.id);
    res.json({ success: true });
});

export default router;

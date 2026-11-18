import { useEffect, useRef, useState } from 'react';
import { api, streamChat } from '../api';
import { useAuth } from '../AuthContext';
import { ErrorToast, InlineSpinner, initials, PageLoader } from '../components/ui';

const QUICK_QUESTIONS = [
    { icon: 'fa-chart-line', label: 'Reliance Price', prompt: 'What is Reliance share price?' },
    { icon: 'fa-newspaper', label: 'TCS News', prompt: 'Latest news about TCS' },
    { icon: 'fa-chart-simple', label: 'Analyze Infosys', prompt: 'Analyze Infosys stock trend' },
    { icon: 'fa-chart-pie', label: 'Nifty 50', prompt: 'Nifty 50 performance today' },
    { icon: 'fa-bullseye', label: 'HDFC Bank Range', prompt: 'HDFC Bank 52 week high low' },
];

const NUMBER = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

function quoteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value) ? NUMBER.format(value) : '—';
}

function quoteTime(iso) {
    if (!iso) return '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Kolkata',
    });
}

function QuoteCard({ quote }) {
    if (!quote || typeof quote.price !== 'number') return null;

    const hasChange = typeof quote.change === 'number';
    const direction = !hasChange ? 'flat' : quote.change >= 0 ? 'up' : 'down';
    const sign = !hasChange ? '' : quote.change >= 0 ? '+' : '-';

    return (
        <div className={`msg-quote ${direction}`}>
            <div className="msg-quote-main">
                <div className="msg-quote-id">
                    <span className="msg-quote-symbol">{quote.label || quote.name || quote.symbol}</span>
                    <span className="msg-quote-exchange">
                        {quote.exchange || 'NSE'} · {quote.symbol}
                    </span>
                </div>
                <div className="msg-quote-price">₹{quoteNumber(quote.price)}</div>
                {hasChange && (
                    <div className="msg-quote-change">
                        {sign}₹{quoteNumber(Math.abs(quote.change))}
                        {typeof quote.changePercent === 'number' && (
                            <> ({sign}{quoteNumber(Math.abs(quote.changePercent))}%)</>
                        )}
                    </div>
                )}
            </div>
            <div className="msg-quote-meta">
                {typeof quote.previousClose === 'number' && (
                    <span>Prev ₹{quoteNumber(quote.previousClose)}</span>
                )}
                {typeof quote.dayLow === 'number' && typeof quote.dayHigh === 'number' && (
                    <span>Day ₹{quoteNumber(quote.dayLow)} – ₹{quoteNumber(quote.dayHigh)}</span>
                )}
                {typeof quote.fiftyTwoWeekLow === 'number' && typeof quote.fiftyTwoWeekHigh === 'number' && (
                    <span>52W ₹{quoteNumber(quote.fiftyTwoWeekLow)} – ₹{quoteNumber(quote.fiftyTwoWeekHigh)}</span>
                )}
                {quoteTime(quote.fetchedAt) && <span>As of {quoteTime(quote.fetchedAt)} IST</span>}
                <span className="msg-quote-source"><i className="fas fa-bolt" /> Yahoo Finance</span>
            </div>
        </div>
    );
}

export default function Chat() {
    const { user } = useAuth();
    const [history, setHistory] = useState([]);
    const [configured, setConfigured] = useState(true);
    const [newsEnabled, setNewsEnabled] = useState(false);
    const [question, setQuestion] = useState('');
    const [sending, setSending] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const areaRef = useRef(null);
    const textareaRef = useRef(null);

    useEffect(() => {
        api('/chat')
            .then((data) => {
                setHistory(data.history ?? []);
                setConfigured(Boolean(data.configured));
                setNewsEnabled(Boolean(data.newsConfigured));
            })
            .catch((err) => {
                setError(err.message);
            })
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        if (areaRef.current) {
            areaRef.current.scrollTop = areaRef.current.scrollHeight;
        }
    }, [history, sending]);

    function resizeTextarea() {
        const el = textareaRef.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
    }

    /** Update the assistant message that is currently being streamed. */
    function patchStreaming(patch) {
        setHistory((current) => {
            let index = -1;
            for (let i = current.length - 1; i >= 0; i -= 1) {
                if (current[i].role === 'assistant' && current[i].streaming) {
                    index = i;
                    break;
                }
            }
            if (index === -1) return current;

            const message = current[index];
            const nextMessage = typeof patch === 'function' ? patch(message) : { ...message, ...patch };
            const next = current.slice();
            next[index] = nextMessage;
            return next;
        });
    }

    async function send(text) {
        const message = String(text ?? question).trim();
        if (!message || sending) return;
        setError('');
        setQuestion('');
        if (textareaRef.current) textareaRef.current.style.height = 'auto';

        const now = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
        setHistory((current) => [...current,
            { role: 'user', content: message, timestamp: now },
            { role: 'assistant', content: '', timestamp: now, sources: [], quote: null, streaming: true },
        ]);
        setSending(true);

        try {
            await streamChat({ question: message }, {
                onMeta: (meta) => {
                    patchStreaming({
                        sources: meta.sources ?? [],
                        quote: meta.quote ?? null,
                        timestamp: meta.timestamp || now,
                    });
                },
                onDelta: (chunk) => {
                    patchStreaming((current) => ({
                        ...current,
                        content: (current.content ?? '') + chunk,
                    }));
                },
                onDone: (done) => {
                    patchStreaming((current) => ({
                        ...current,
                        content: done.answer ?? current.content,
                        sources: done.sources ?? current.sources,
                        quote: done.quote ?? current.quote,
                        timestamp: done.timestamp || current.timestamp,
                        streaming: false,
                    }));
                },
            });
        } catch (err) {
            setError(err.message);
            patchStreaming((current) => ({
                ...current,
                streaming: false,
                content: current.content
                    ? `${current.content}\n\n[Error: ${err.message}]`
                    : `Error: ${err.message}`,
            }));
        } finally {
            setSending(false);
            // Safety net: never leave a bubble stuck in the streaming state.
            patchStreaming({ streaming: false });
        }
    }

    function onSubmit(e) {
        e.preventDefault();
        send();
    }

    function onKeyDown(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            send();
        }
    }

    async function clearChat() {
        if (!window.confirm('Clear the chat history?')) return;
        setError('');
        try {
            await api('/chat/clear', { method: 'POST' });
            setHistory([]);
        } catch (err) {
            setError(err.message);
        }
    }

    if (loading) return <PageLoader text="Opening the assistant…" />;

    const userInitials = initials(user?.fullName);

    return (
        <>
            {error && <ErrorToast error={error} />}
            {!configured && (
                <div className="toast-msg toast-info">
                    <i className="fas fa-circle-info" />
                    <span>
                        The AI assistant is not configured on the server. Add OPENAI_API_KEY and
                        OPENAI_BASE_URL to the server&apos;s .env and restart.
                    </span>
                </div>
            )}

            <div className="chat-container">
                <div className="chat-header">
                    <div className="chat-header-icon">
                        <i className="fas fa-robot" />
                    </div>
                    <div className="chat-header-info">
                        <h2>AI Stock Assistant</h2>
                        <p>Live prices, market trends &amp; latest news</p>
                    </div>
                    <span className="ai-badge">
                        <i className={`fas ${newsEnabled ? 'fa-newspaper' : 'fa-bolt'}`} style={{ marginRight: 5 }} />
                        {newsEnabled ? 'Live prices + news' : 'Live prices'}
                    </span>
                </div>

                <div className="quick-actions">
                    {QUICK_QUESTIONS.map(({ icon, label, prompt }) => (
                        <button
                            key={label}
                            type="button"
                            className="quick-btn"
                            disabled={!configured || sending}
                            onClick={() => send(prompt)}
                        >
                            <i className={`fas ${icon}`} style={{ marginRight: 6 }} />
                            {label}
                        </button>
                    ))}
                </div>

                <div className="messages-area" ref={areaRef}>
                    {history.length === 0 && !sending && (
                        <div className="chat-empty">
                            <i className="fas fa-comments" />
                            <h4>Ask the market assistant</h4>
                            <p>
                                Try “What is the Reliance share price?” or “Latest news about TCS”.
                                <br />
                                <span>Informational only — no trading or investment advice.</span>
                            </p>
                        </div>
                    )}

                    {history.map((message, index) => (
                        <div
                            key={`${message.role}-${index}`}
                            className={`message ${message.role === 'user' ? 'user-message' : 'assistant-message'}`}
                        >
                            {message.role === 'assistant' && (
                                <div className="msg-avatar"><i className="fas fa-robot" style={{ fontSize: 12 }} /></div>
                            )}
                            <div className="msg-body">
                                <div className="msg-bubble">
                                    {message.streaming && !message.content ? (
                                        <div className="typing-indicator typing-inline">
                                            <span /><span /><span />
                                        </div>
                                    ) : (
                                        <>
                                            {String(message.content ?? '').split('\n').map((line, i) => (
                                                <span key={i}>{line}<br /></span>
                                            ))}
                                            {message.streaming && <span className="stream-caret" />}
                                        </>
                                    )}
                                </div>
                                <div className="msg-time">{message.timestamp || ''}</div>
                                {message.role === 'assistant' && <QuoteCard quote={message.quote} />}
                                {message.role === 'assistant' && message.sources?.length > 0 && (
                                    <div className="msg-sources">
                                        <span className="msg-sources-label">
                                            <i className="fas fa-newspaper" /> Sources &amp; latest news
                                        </span>
                                        {message.sources.map((source, sourceIndex) => (
                                            <a
                                                key={source.url || sourceIndex}
                                                href={source.url}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="msg-source-link"
                                                title={source.publishedDate || ''}
                                            >
                                                <span className="msg-source-index">[{sourceIndex + 1}]</span> {source.title}
                                            </a>
                                        ))}
                                    </div>
                                )}
                            </div>
                            {message.role === 'user' && (
                                <div className="msg-avatar">{userInitials}</div>
                            )}
                        </div>
                    ))}
                </div>

                <form className="chat-input-area" onSubmit={onSubmit}>
                    <textarea
                        ref={textareaRef}
                        className="chat-input"
                        placeholder="Ask about stocks, prices, news, trends..."
                        rows={1}
                        value={question}
                        onChange={(e) => { setQuestion(e.target.value); resizeTextarea(); }}
                        onKeyDown={onKeyDown}
                        disabled={!configured}
                    />
                    <button
                        type="button"
                        className="clear-btn"
                        onClick={clearChat}
                        title="Clear chat"
                        disabled={history.length === 0}
                    >
                        <i className="fas fa-trash-alt" />
                    </button>
                    <button
                        type="submit"
                        className="send-btn"
                        disabled={sending || !configured || !question.trim()}
                        title="Send"
                    >
                        {sending ? <InlineSpinner /> : <i className="fas fa-paper-plane" />}
                    </button>
                </form>
            </div>
        </>
    );
}

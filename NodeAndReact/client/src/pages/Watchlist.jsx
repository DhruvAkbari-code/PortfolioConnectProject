import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import {
    EmptyState, ErrorToast, formatDate, formatINR, initials, InlineSpinner,
    Modal, PageLoader, Toast,
} from '../components/ui';

export default function Watchlist() {
    const [items, setItems] = useState([]);
    const [quotes, setQuotes] = useState({});
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [busy, setBusy] = useState(true);
    const [quotesBusy, setQuotesBusy] = useState(false);
    const [modalOpen, setModalOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [removing, setRemoving] = useState(null);
    const [form, setForm] = useState({ symbol: '', name: '', exchange: 'NSE' });

    const loadQuotes = useCallback(async () => {
        setQuotesBusy(true);
        try {
            const data = await api('/watchlist/quotes');
            setQuotes(data.quotes ?? {});
        } catch (err) {
            // Quotes are best-effort; keep the watchlist usable if Yahoo is unavailable.
            console.warn('Could not load live quotes:', err.message);
        } finally {
            setQuotesBusy(false);
        }
    }, []);

    const load = useCallback(async ({ silent = false } = {}) => {
        if (!silent) setBusy(true);
        setError('');
        try {
            const data = await api('/watchlist');
            setItems(data.items ?? []);
            loadQuotes();
        } catch (err) {
            setError(err.message);
        } finally {
            if (!silent) setBusy(false);
        }
    }, [loadQuotes]);

    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        const timer = setInterval(() => {
            if (!document.hidden) loadQuotes();
        }, 60_000);
        return () => clearInterval(timer);
    }, [loadQuotes]);

    async function onAdd(e) {
        e.preventDefault();
        setError('');
        setNotice('');
        setSaving(true);
        try {
            const symbol = form.symbol.trim().toUpperCase();
            const name = form.name.trim() || symbol;
            await api('/watchlist', {
                method: 'POST',
                body: { symbol, name, exchange: form.exchange },
            });
            setNotice(`${symbol} added to your watchlist.`);
            setModalOpen(false);
            setForm({ symbol: '', name: '', exchange: 'NSE' });
            await load({ silent: true });
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    }

    async function remove(item) {
        setError('');
        setNotice('');
        setRemoving(item.id);
        try {
            await api(`/watchlist/${item.id}`, { method: 'DELETE' });
            setNotice(`${item.stock_symbol} removed from your watchlist.`);
            setItems((current) => current.filter((row) => row.id !== item.id));
        } catch (err) {
            setError(err.message);
        } finally {
            setRemoving(null);
        }
    }

    if (busy && items.length === 0) return <PageLoader text="Loading your watchlist…" />;

    return (
        <>
            {error && <ErrorToast error={error} />}
            {notice && <Toast type="success">{notice}</Toast>}

            <div className="page-head">
                <p>
                    Live prices via Yahoo Finance, updated automatically every minute.
                    {quotesBusy && <span className="inline-muted"> <InlineSpinner /> updating</span>}
                </p>
                <button type="button" className="btn btn-primary" onClick={() => setModalOpen(true)}>
                    <i className="fas fa-plus" /> Add Stock
                </button>
            </div>

            <div className="card">
                <div className="card-header">
                    <span className="card-title">
                        <i className="fas fa-heart" style={{ color: 'var(--red)', marginRight: 8 }} />
                        Watchlist ({items.length})
                    </span>
                    <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={loadQuotes}
                        disabled={quotesBusy || items.length === 0}
                        title="Refresh live prices"
                    >
                        <i className={`fas fa-rotate-right${quotesBusy ? ' fa-spin' : ''}`} /> Refresh
                    </button>
                </div>

                {items.length > 0 ? (
                    <div style={{ overflowX: 'auto' }}>
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Symbol</th>
                                    <th>Name</th>
                                    <th>Exchange</th>
                                    <th>Price When Added</th>
                                    <th>Live Price</th>
                                    <th>Day Change</th>
                                    <th>Day Change %</th>
                                    <th>Added On</th>
                                    <th />
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((item) => {
                                    const symbol = item.stock_symbol?.toUpperCase();
                                    const quote = quotes[`${symbol}|${item.exchange?.toUpperCase() || 'NSE'}`] ?? quotes[symbol];
                                    const change = Number(quote?.change ?? 0);
                                    const pct = Number(quote?.changePercent ?? 0);
                                    const up = change >= 0;
                                    const color = quote ? (up ? 'var(--green)' : 'var(--red)') : 'var(--text-secondary)';
                                    const pillBg = up ? 'rgba(0,160,90,0.12)' : 'rgba(200,40,40,0.10)';
                                    const arrow = up ? '▲' : '▼';

                                    return (
                                        <tr key={item.id}>
                                            <td>
                                                <div className="symbol-cell">
                                                    <div className="symbol-icon">{initials(item.stock_symbol, '—')}</div>
                                                    <Link to={`/stocks/${item.stock_symbol}?exchange=${item.exchange || 'NSE'}`} className="symbol-link">
                                                        {item.stock_symbol}
                                                    </Link>
                                                </div>
                                            </td>
                                            <td>{item.stock_name}</td>
                                            <td><span className="badge badge-blue">{item.exchange}</span></td>
                                            <td>{item.price_at_add != null ? formatINR(item.price_at_add) : '—'}</td>
                                            <td style={{ fontWeight: 600 }}>
                                                {quote?.price != null ? formatINR(quote.price) : '—'}
                                            </td>
                                            <td style={{ color, fontWeight: 500 }}>
                                                {quote?.change != null
                                                    ? <>{arrow} {formatINR(Math.abs(change))}</>
                                                    : <span className="text-muted">—</span>}
                                            </td>
                                            <td>
                                                {quote?.changePercent != null ? (
                                                    <span style={{
                                                        background: pillBg,
                                                        color,
                                                        padding: '3px 10px',
                                                        borderRadius: 20,
                                                        fontSize: 12,
                                                        fontWeight: 600,
                                                    }}>
                                                        {arrow} {Math.abs(pct).toFixed(2)}%
                                                    </span>
                                                ) : (
                                                    <span className="text-muted">—</span>
                                                )}
                                            </td>
                                            <td className="text-muted-cell">{formatDate(item.added_at)}</td>
                                            <td>
                                                <button
                                                    type="button"
                                                    className="btn btn-danger btn-sm"
                                                    title={`Remove ${item.stock_symbol}`}
                                                    disabled={removing === item.id}
                                                    onClick={() => remove(item)}
                                                >
                                                    {removing === item.id ? <InlineSpinner /> : <i className="fas fa-trash" />}
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <EmptyState
                        icon="fa-heart-crack"
                        title="Your watchlist is empty"
                        action={(
                            <button type="button" className="btn btn-primary" onClick={() => setModalOpen(true)}>
                                <i className="fas fa-plus" /> Add First Stock
                            </button>
                        )}
                    >
                        Add stocks to track their live prices.
                    </EmptyState>
                )}
            </div>

            <Modal
                open={modalOpen}
                onClose={() => !saving && setModalOpen(false)}
                title="Add to Watchlist"
                subtitle="Live price will be fetched automatically"
                icon="fa-heart"
                iconColor="var(--red)"
            >
                <form onSubmit={onAdd}>
                    <div className="form-group">
                        <label className="form-label" htmlFor="watchSymbol">Stock Symbol</label>
                        <input
                            id="watchSymbol"
                            className="form-input"
                            placeholder="e.g. RELIANCE, TCS, INFY"
                            value={form.symbol}
                            onChange={(e) => setForm({ ...form, symbol: e.target.value.toUpperCase() })}
                            style={{ textTransform: 'uppercase' }}
                            required
                            autoFocus
                        />
                    </div>
                    <div className="form-group">
                        <label className="form-label" htmlFor="watchName">Stock Name</label>
                        <input
                            id="watchName"
                            className="form-input"
                            placeholder="e.g. Reliance Industries Ltd"
                            value={form.name}
                            onChange={(e) => setForm({ ...form, name: e.target.value })}
                        />
                    </div>
                    <div className="form-group">
                        <label className="form-label" htmlFor="watchExchange">Exchange</label>
                        <select
                            id="watchExchange"
                            className="form-input"
                            value={form.exchange}
                            onChange={(e) => setForm({ ...form, exchange: e.target.value })}
                        >
                            <option value="NSE">NSE</option>
                            <option value="BSE">BSE</option>
                        </select>
                    </div>
                    <div className="modal-actions">
                        <button type="button" className="btn btn-ghost" disabled={saving} onClick={() => setModalOpen(false)}>
                            Cancel
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={saving}>
                            {saving ? <InlineSpinner /> : <i className="fas fa-heart" />}
                            {saving ? 'Adding…' : 'Add to Watchlist'}
                        </button>
                    </div>
                </form>
            </Modal>
        </>
    );
}

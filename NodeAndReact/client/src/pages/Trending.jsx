import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import {
    ErrorToast, formatINR, formatVolume, initials, InlineSpinner, Toast,
} from '../components/ui';

export default function Trending() {
    const navigate = useNavigate();
    const [data, setData] = useState(null);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [busy, setBusy] = useState(true);
    const [loading, setLoading] = useState(false);
    const [adding, setAdding] = useState('');
    const [lastUpdated, setLastUpdated] = useState(null);

    const load = useCallback(async ({ initial = false } = {}) => {
        if (initial) setBusy(true);
        setLoading(true);
        setError('');
        try {
            const result = await api('/market/trending');
            setData(result);
            setLastUpdated(new Date());
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
            setBusy(false);
        }
    }, []);

    useEffect(() => {
        load({ initial: true });
        const timer = setInterval(() => {
            if (!document.hidden) load();
        }, 30_000);
        return () => clearInterval(timer);
    }, [load]);

    async function addToWatchlist(stock) {
        setAdding(stock.symbol);
        setError('');
        setNotice('');
        try {
            await api('/watchlist', {
                method: 'POST',
                body: { symbol: stock.symbol, name: stock.name || stock.symbol, exchange: 'NSE' },
            });
            setNotice(`${stock.symbol} added to your watchlist.`);
        } catch (err) {
            setError(err.message);
        } finally {
            setAdding('');
        }
    }

    const stocks = data?.stocks ?? [];

    return (
        <>
            {notice && <Toast type="success">{notice}</Toast>}
            {error && <ErrorToast error={error} />}

            <div className="page-head">
                <p>Today&apos;s top movers on NSE — auto-refreshes every 30 seconds.</p>
                <div className="page-head-actions">
                    {lastUpdated && (
                        <span className="last-updated">
                            Updated at {lastUpdated.toLocaleTimeString('en-IN', {
                                hour: '2-digit', minute: '2-digit', second: '2-digit',
                            })}
                        </span>
                    )}
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => load()} disabled={loading}>
                        <i className={`fas fa-rotate-right${loading ? ' fa-spin' : ''}`} /> Refresh Now
                    </button>
                </div>
            </div>

            <div className="card">
                <div className="card-header">
                    <span className="card-title">
                        <i className="fas fa-fire" style={{ color: '#e25c1a', marginRight: 8 }} />
                        Trending on NSE
                        {stocks.length > 0 && <span className="card-title-muted"> ({stocks.length})</span>}
                    </span>
                    {loading ? (
                        <span className="status-inline"><InlineSpinner /> Updating…</span>
                    ) : error ? null : (
                        <span className="status-live">
                            <i className="fas fa-circle" style={{ fontSize: 8, marginRight: 4 }} /> Live
                        </span>
                    )}
                </div>

                {busy && !data ? (
                    <div className="loading-state">
                        <i className="fas fa-circle-notch fa-spin" />
                        <p>Fetching today&apos;s top movers from NSE…</p>
                    </div>
                ) : error && stocks.length === 0 ? (
                    <div className="empty-state">
                        <i className="fas fa-triangle-exclamation" />
                        <h4>Could not load data</h4>
                        <p>{error}</p>
                        <button type="button" className="btn btn-primary" onClick={() => load({ initial: true })}>
                            <i className="fas fa-rotate-right" /> Retry
                        </button>
                    </div>
                ) : stocks.length === 0 ? (
                    <div className="empty-state">
                        <i className="fas fa-chart-line" />
                        <h4>No trending stocks right now</h4>
                        <p>NSE may have returned no data. Try refreshing in a moment.</p>
                    </div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Symbol</th>
                                    <th>Live Price</th>
                                    <th>Day Change</th>
                                    <th>Change %</th>
                                    <th>Volume</th>
                                    <th />
                                </tr>
                            </thead>
                            <tbody>
                                {stocks.map((stock, index) => {
                                    const up = Number(stock.percentChange ?? stock.change ?? 0) >= 0;
                                    const color = up ? 'var(--green)' : 'var(--red)';
                                    const pillBg = up ? 'rgba(0,160,90,0.12)' : 'rgba(200,40,40,0.10)';
                                    const arrow = up ? '▲' : '▼';

                                    return (
                                        <tr
                                            key={stock.symbol}
                                            className="clickable-row"
                                            onClick={() => navigate(`/stocks/${stock.symbol}`)}
                                        >
                                            <td className="row-index">{index + 1}</td>
                                            <td>
                                                <div className="symbol-cell">
                                                    <div className="symbol-icon">{initials(stock.symbol, '—')}</div>
                                                    <span className="symbol-link">{stock.symbol}</span>
                                                </div>
                                            </td>
                                            <td className="price-cell">{formatINR(stock.lastPrice)}</td>
                                            <td style={{ color, fontWeight: 500 }}>
                                                {stock.change != null
                                                    ? <>{arrow} {formatINR(Math.abs(Number(stock.change)))}</>
                                                    : '—'}
                                            </td>
                                            <td>
                                                <span style={{
                                                    background: pillBg,
                                                    color,
                                                    padding: '3px 10px',
                                                    borderRadius: 20,
                                                    fontSize: 12,
                                                    fontWeight: 600,
                                                }}>
                                                    {arrow} {Math.abs(Number(stock.percentChange ?? 0)).toFixed(2)}%
                                                </span>
                                            </td>
                                            <td className="text-muted-cell">{formatVolume(stock.volume)}</td>
                                            <td onClick={(e) => e.stopPropagation()}>
                                                <button
                                                    type="button"
                                                    className="btn btn-ghost btn-sm"
                                                    title="Add to Watchlist"
                                                    disabled={adding === stock.symbol}
                                                    onClick={() => addToWatchlist(stock)}
                                                >
                                                    {adding === stock.symbol
                                                        ? <InlineSpinner />
                                                        : <i className="fas fa-heart" />}
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <div className="disclaimer">
                <i className="fas fa-circle-info" /> Informational only — not trading advice. Click any stock for details.
            </div>
        </>
    );
}

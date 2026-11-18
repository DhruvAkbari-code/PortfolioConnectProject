import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import PriceChart from '../components/PriceChart';
import {
    ErrorToast, formatCompactINR, formatINR, formatVolume, InlineSpinner,
    PageLoader, Toast,
} from '../components/ui';

export default function StockDetails() {
    const { symbol: routeSymbol } = useParams();
    const [searchParams] = useSearchParams();
    const symbol = String(routeSymbol || '').toUpperCase();
    const exchange = String(searchParams.get('exchange') || 'NSE').toUpperCase();
    const navigate = useNavigate();
    const [stock, setStock] = useState(null);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [busy, setBusy] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [adding, setAdding] = useState(false);
    const [updatedAt, setUpdatedAt] = useState(null);
    const [chartRange, setChartRange] = useState('1mo');
    const [history, setHistory] = useState([]);
    const [historyBusy, setHistoryBusy] = useState(true);
    const [historyError, setHistoryError] = useState('');
    const [historyNonce, setHistoryNonce] = useState(0);

    const load = useCallback(async ({ silent = false } = {}) => {
        if (!symbol) return;
        if (silent) setRefreshing(true);
        else setBusy(true);
        setError('');
        try {
            const data = await api(`/market/stocks/${encodeURIComponent(symbol)}?exchange=${encodeURIComponent(exchange)}`);
            setStock(data);
            setUpdatedAt(new Date());
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
            setRefreshing(false);
        }
    }, [symbol, exchange]);

    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        let cancelled = false;
        if (!symbol) return undefined;

        setHistoryBusy(true);
        setHistoryError('');
        api(`/market/history/${encodeURIComponent(symbol)}?exchange=${encodeURIComponent(exchange)}&range=${chartRange}`)
            .then((data) => {
                if (!cancelled) setHistory(data.history ?? []);
            })
            .catch((err) => {
                if (cancelled) return;
                setHistory([]);
                setHistoryError(err.message || 'Could not load price history.');
            })
            .finally(() => {
                if (!cancelled) setHistoryBusy(false);
            });

        return () => { cancelled = true; };
    }, [symbol, exchange, chartRange, historyNonce]);

    async function addToWatchlist() {
        setAdding(true);
        setNotice('');
        setError('');
        try {
            await api('/watchlist', {
                method: 'POST',
                body: {
                    symbol,
                    name: stock?.longName || stock?.name || symbol,
                    exchange,
                },
            });
            setNotice(`${symbol} added to your watchlist.`);
        } catch (err) {
            setError(err.message);
        } finally {
            setAdding(false);
        }
    }

    if (busy && !stock) return <PageLoader text={`Loading ${symbol}…`} />;

    const price = Number(stock?.price);
    const change = Number(stock?.change);
    const pct = Number(stock?.changePercent);
    const up = change >= 0;
    const companyName = stock?.longName || stock?.name || symbol;
    const weekLow = Number(stock?.fiftyTwoWeekLow);
    const weekHigh = Number(stock?.fiftyTwoWeekHigh);
    const rangeValid = Number.isFinite(weekLow) && Number.isFinite(weekHigh) && weekHigh > weekLow;
    const position = rangeValid && Number.isFinite(price)
        ? Math.max(0, Math.min(100, ((price - weekLow) / (weekHigh - weekLow)) * 100))
        : 0;

    return (
        <>
            {error && <ErrorToast error={error} />}
            {notice && <Toast type="success">{notice}</Toast>}

            <div className="stock-topbar">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>
                    <i className="fas fa-arrow-left" /> Back
                </button>

                <div className="stock-identity">
                    <div className="stock-avatar">{symbol.slice(0, 2) || '—'}</div>
                    <div>
                        <div className="stock-company" id="companyName">{companyName}</div>
                        <div className="stock-exchange" id="exchangeName">
                            {stock?.exchange || 'NSE'} · {symbol}
                        </div>
                    </div>
                </div>

                <div className="stock-actions">
                    <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => {
                            load({ silent: true });
                            setHistoryNonce((value) => value + 1);
                        }}
                        disabled={refreshing}
                    >
                        <i className={`fas fa-sync-alt${refreshing ? ' fa-spin' : ''}`} /> Refresh
                    </button>
                    <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={addToWatchlist}
                        disabled={adding}
                    >
                        {adding ? <InlineSpinner /> : <i className="fas fa-plus" />} Watchlist
                    </button>
                </div>
            </div>

            {error && !stock ? (
                <div className="card empty-state">
                    <i className="fas fa-triangle-exclamation" />
                    <h4>Could not load {symbol}</h4>
                    <p>{error}</p>
                    <button type="button" className="btn btn-primary" onClick={() => load()}>
                        <i className="fas fa-rotate-right" /> Retry
                    </button>
                </div>
            ) : (
                <>
                    <div className="stock-price-card">
                        <div className="stock-price-row">
                            <span
                                className="stock-price"
                                style={{ color: change >= 0 ? 'var(--green)' : 'var(--red)' }}
                            >
                                {Number.isFinite(price) && price > 0 ? formatINR(price) : '—'}
                            </span>
                            {stock?.change != null && (
                                <span className={`stock-change ${up ? 'text-up' : 'text-down'}`}>
                                    {up ? '▲' : '▼'} {formatINR(Math.abs(change))} ({Math.abs(pct).toFixed(2)}%)
                                </span>
                            )}
                        </div>
                        <div className="stock-update">
                            {updatedAt
                                ? `Updated: ${updatedAt.toLocaleTimeString('en-IN')}`
                                : 'Live data from Yahoo Finance'}
                        </div>
                    </div>

                    <PriceChart
                        data={history}
                        loading={historyBusy}
                        error={historyError}
                        range={chartRange}
                        onRangeChange={setChartRange}
                        onRetry={() => setHistoryNonce((value) => value + 1)}
                    />

                    <div className="grid-4 stock-detail-grid">
                        <div className="stat-card">
                            <div className="stat-label">Day High</div>
                            <div className="stock-stat-value">{stock?.dayHigh != null ? formatINR(stock.dayHigh) : '—'}</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-label">Day Low</div>
                            <div className="stock-stat-value">{stock?.dayLow != null ? formatINR(stock.dayLow) : '—'}</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-label">Open</div>
                            <div className="stock-stat-value">{stock?.open != null ? formatINR(stock.open) : '—'}</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-label">Prev Close</div>
                            <div className="stock-stat-value">
                                {stock?.previousClose != null ? formatINR(stock.previousClose) : '—'}
                            </div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-label">Volume</div>
                            <div className="stock-stat-value">{formatVolume(stock?.volume)}</div>
                        </div>
                    </div>

                    <div className="stat-card stock-range-card">
                        <div className="stat-label">52-Week Range</div>
                        <div className="range-labels">
                            <span style={{ color: 'var(--red)' }}>
                                {weekLow ? formatINR(weekLow) : '—'}
                            </span>
                            <span className="range-position">
                                {rangeValid ? `${position.toFixed(1)}% from low` : '—'}
                            </span>
                            <span style={{ color: 'var(--green)' }}>
                                {weekHigh ? formatINR(weekHigh) : '—'}
                            </span>
                        </div>
                        <div className="range-track">
                            <div className="range-fill" style={{ width: `${position}%` }} />
                        </div>
                    </div>

                    {(stock?.marketCap || stock?.peRatio || stock?.sector || stock?.about) && (
                        <div className="card stock-about-card">
                            <div className="card-header">
                                <span className="card-title">
                                    <i className="fas fa-building" style={{ marginRight: 8, color: 'var(--text-secondary)' }} />
                                    Company Overview
                                </span>
                            </div>
                            <div className="fundamental-grid">
                                {stock?.sector && (
                                    <div>
                                        <div className="stat-label">Sector</div>
                                        <div className="stock-stat-value">{stock.sector}</div>
                                    </div>
                                )}
                                {stock?.industry && (
                                    <div>
                                        <div className="stat-label">Industry</div>
                                        <div className="stock-stat-value">{stock.industry}</div>
                                    </div>
                                )}
                                {Number(stock?.marketCap) > 0 && (
                                    <div>
                                        <div className="stat-label">Market Cap</div>
                                        <div className="stock-stat-value">{formatCompactINR(stock.marketCap)}</div>
                                    </div>
                                )}
                                {Number(stock?.peRatio) > 0 && (
                                    <div>
                                        <div className="stat-label">P/E Ratio</div>
                                        <div className="stock-stat-value">{Number(stock.peRatio).toFixed(2)}</div>
                                    </div>
                                )}
                            </div>
                            {stock?.about && <p className="stock-about-text">{stock.about}</p>}
                            <div className="stock-about-footer">
                                <Link to={`/targets`} className="btn btn-ghost btn-sm">
                                    <i className="fas fa-bullseye" /> Set a target
                                </Link>
                                <Link to="/trending" className="btn btn-ghost btn-sm">
                                    <i className="fas fa-fire" /> Back to Trending
                                </Link>
                            </div>
                        </div>
                    )}
                </>
            )}
        </>
    );
}

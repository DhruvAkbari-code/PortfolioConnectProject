import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import {
    EmptyState, ErrorToast, formatINR, initials, InlineSpinner, PageLoader,
} from '../components/ui';

export default function Dashboard() {
    const [data, setData] = useState(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(true);
    const [activeTab, setActiveTab] = useState(0);
    const [disconnecting, setDisconnecting] = useState(null);

    const load = useCallback(async () => {
        setBusy(true);
        setError('');
        try {
            const result = await api('/dashboard');
            setData(result);
            setActiveTab((current) => (current < (result.accounts?.length ?? 0) ? current : 0));
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    async function disconnect(account) {
        if (!window.confirm(`Disconnect ${account.nickname}? You can reconnect it any time with Zerodha OAuth.`)) return;
        setDisconnecting(account.accountId);
        setError('');
        try {
            await api(`/kite/accounts/${account.accountId}/disconnect`, { method: 'POST' });
            await load();
        } catch (err) {
            setError(err.message);
        } finally {
            setDisconnecting(null);
        }
    }

    if (busy && !data) return <PageLoader text="Loading your portfolio…" />;

    if (error && !data) {
        return (
            <>
                <ErrorToast error={error} />
                <button type="button" className="btn btn-primary" onClick={load}>
                    <i className="fas fa-rotate-right" /> Retry
                </button>
            </>
        );
    }

    const accounts = data?.accounts ?? [];
    const totalPnl = Number(data?.totalProfitLoss ?? 0);
    const totalPct = Number(data?.totalPnlPercentage ?? 0);
    const hasAccounts = accounts.length > 0;
    const account = accounts[activeTab];

    return (
        <>
            {error && <ErrorToast error={error} />}

            <div className="stat-grid">
                <div className="stat-card blue">
                    <div className="stat-label">Total Investment</div>
                    <div className="stat-value">{formatINR(data?.totalInvestment ?? 0, 0)}</div>
                    <div className="stat-badge up"><i className="fas fa-wallet" /> All Accounts</div>
                </div>
                <div className="stat-card green">
                    <div className="stat-label">Current Value</div>
                    <div className="stat-value">{formatINR(data?.totalValue ?? 0, 0)}</div>
                    <div className="stat-badge up"><i className="fas fa-arrow-trend-up" /> Live Value</div>
                </div>
                <div className={`stat-card ${totalPnl >= 0 ? 'green' : 'red'}`}>
                    <div className="stat-label">Total P&amp;L</div>
                    <div className={`stat-value ${totalPnl >= 0 ? 'positive' : 'negative'}`}>
                        {totalPnl >= 0 ? '+' : '−'}{formatINR(Math.abs(totalPnl), 0)}
                    </div>
                    <div className={`stat-badge ${totalPnl >= 0 ? 'up' : 'down'}`}>
                        <i className={`fas fa-arrow-${totalPnl >= 0 ? 'up' : 'down'}`} /> Unrealised P&amp;L
                    </div>
                </div>
                <div className={`stat-card ${totalPct >= 0 ? 'green' : 'red'}`}>
                    <div className="stat-label">Returns</div>
                    <div className={`stat-value ${totalPct >= 0 ? 'positive' : 'negative'}`}>
                        {totalPct >= 0 ? '+' : '−'}{Math.abs(totalPct).toFixed(2)}%
                    </div>
                    <div className={`stat-badge ${totalPct >= 0 ? 'up' : 'down'}`}>
                        <i className="fas fa-percent" /> Overall
                    </div>
                </div>
            </div>

            {!hasAccounts ? (
                <div className="card" style={{ textAlign: 'center', padding: 48 }}>
                    <i className="fas fa-key empty-large-icon" />
                    <h4>No Zerodha accounts configured</h4>
                    <p className="text-muted">Add your API keys and connect to see your portfolio.</p>
                    <Link to="/kite/add" className="btn btn-primary" style={{ marginTop: 8 }}>
                        <i className="fas fa-key" /> Add Account
                    </Link>
                </div>
            ) : (
                <>
                    <div className="account-tabs">
                        {accounts.map((acc, index) => (
                            <button
                                key={acc.accountId}
                                type="button"
                                className={`account-tab${index === activeTab ? ' active' : ''}`}
                                onClick={() => setActiveTab(index)}
                            >
                                {acc.nickname}
                                <span className={`connection-dot${acc.isConnected ? ' connected' : ''}`} />
                            </button>
                        ))}
                    </div>

                    {account && (
                        <div className="card">
                            <div className="card-header">
                                <span className="card-title">
                                    <i className="fas fa-briefcase" style={{ color: 'var(--accent)', marginRight: 8 }} />
                                    {account.nickname}
                                    {account.holdings?.length > 0 && (
                                        <span className="card-title-muted"> ({account.holdings.length} holdings)</span>
                                    )}
                                </span>
                                <div className="card-header-actions">
                                    {account.isConnected ? (
                                        <>
                                            <span className="badge badge-green">
                                                <i className="fas fa-circle" style={{ fontSize: 7 }} /> Connected
                                            </span>
                                            <button
                                                type="button"
                                                className="link-btn"
                                                disabled={disconnecting === account.accountId}
                                                onClick={() => disconnect(account)}
                                            >
                                                {disconnecting === account.accountId
                                                    ? <InlineSpinner />
                                                    : <i className="fas fa-plug-circle-xmark" />} Disconnect
                                            </button>
                                        </>
                                    ) : (
                                        <Link to="/kite/connect" className="badge badge-amber" style={{ cursor: 'pointer' }}>
                                            <i className="fas fa-plug" /> Connect
                                        </Link>
                                    )}
                                </div>
                            </div>

                            {account.isConnected && account.holdings?.length > 0 ? (
                                <>
                                    <div className="account-mini-stats">
                                        <div>
                                            <div className="mini-label">Invested</div>
                                            <div className="mini-value">{formatINR(account.totalInvestment ?? 0, 0)}</div>
                                        </div>
                                        <div>
                                            <div className="mini-label">Current</div>
                                            <div className="mini-value">{formatINR(account.totalValue ?? 0, 0)}</div>
                                        </div>
                                        <div>
                                            <div className="mini-label">P&amp;L</div>
                                            <div className={`mini-value ${Number(account.totalProfitLoss) >= 0 ? 'text-up' : 'text-down'}`}>
                                                {Number(account.totalProfitLoss) >= 0 ? '+' : '−'}
                                                {formatINR(Math.abs(Number(account.totalProfitLoss ?? 0)), 0)}
                                                <span className="mini-pct">
                                                    ({Number(account.totalPnlPercentage) >= 0 ? '+' : '−'}
                                                    {Math.abs(Number(account.totalPnlPercentage ?? 0)).toFixed(2)}%)
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <div style={{ overflowX: 'auto' }}>
                                        <table className="data-table">
                                            <thead>
                                                <tr>
                                                    <th>Symbol</th>
                                                    <th>Exchange</th>
                                                    <th>Qty</th>
                                                    <th>Avg Price</th>
                                                    <th>LTP</th>
                                                    <th>Invested</th>
                                                    <th>Curr. Value</th>
                                                    <th>P&amp;L</th>
                                                    <th>P&amp;L %</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {account.holdings.map((h) => {
                                                    const qty = Number(h.quantity ?? 0);
                                                    const avg = Number(h.averagePrice ?? 0);
                                                    const last = Number(h.lastPrice ?? 0);
                                                    const invested = h.investedValue != null ? Number(h.investedValue) : avg * qty;
                                                    const current = h.currentValue != null ? Number(h.currentValue) : last * qty;
                                                    const profit = h.pnl != null ? Number(h.pnl) : current - invested;
                                                    const pct = h.pnlPercent != null
                                                        ? Number(h.pnlPercent)
                                                        : (avg > 0 ? ((last - avg) / avg) * 100 : 0);
                                                    const symbol = h.symbol || h.tradingsymbol || '—';
                                                    return (
                                                        <tr key={symbol}>
                                                            <td>
                                                                <div className="symbol-cell">
                                                                    <div className="symbol-icon">{initials(symbol, '—')}</div>
                                                                    <div className="symbol-name">
                                                                        <Link to={`/stocks/${symbol}?exchange=${h.exchange || 'NSE'}`}>{symbol}</Link>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            <td><span className="badge badge-blue">{h.exchange || 'NSE'}</span></td>
                                                            <td className="text-primary-val">{qty}</td>
                                                            <td className="text-primary-val">{formatINR(avg)}</td>
                                                            <td className="text-primary-val">{formatINR(last)}</td>
                                                            <td>{formatINR(invested, 0)}</td>
                                                            <td>{formatINR(current, 0)}</td>
                                                            <td className={profit >= 0 ? 'badge-up' : 'badge-down'}>
                                                                {profit >= 0 ? '+' : '−'}{formatINR(Math.abs(profit))}
                                                            </td>
                                                            <td>
                                                                <span className={`badge ${pct >= 0 ? 'badge-green' : 'badge-red'}`}>
                                                                    {pct >= 0 ? '▲' : '▼'} {Math.abs(pct).toFixed(2)}%
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </>
                            ) : (
                                <EmptyState
                                    icon={account.isConnected ? 'fa-chart-pie' : 'fa-plug'}
                                    title={account.isConnected ? 'No holdings in this account' : 'Not connected'}
                                    action={!account.isConnected ? (
                                        <Link to="/kite/connect" className="btn btn-primary">
                                            <i className="fas fa-plug" /> Connect Accounts
                                        </Link>
                                    ) : null}
                                >
                                    {account.isConnected
                                        ? 'This account has no holdings yet.'
                                        : 'Connect this account via Zerodha OAuth to load its portfolio.'}
                                </EmptyState>
                            )}
                        </div>
                    )}
                </>
            )}
        </>
    );
}

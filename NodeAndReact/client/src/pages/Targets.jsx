import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import {
    EmptyState, ErrorToast, formatDate, formatDateTime, formatINR, initials,
    InlineSpinner, Modal, PageLoader, Toast,
} from '../components/ui';

function conditionMeta(type) {
    switch (type) {
        case 'price_rise':
            return { label: '▲ Above', color: 'var(--green)', bg: 'rgba(0,160,90,0.1)' };
        case 'price_fall':
            return { label: '▼ Below', color: 'var(--red)', bg: 'rgba(200,40,40,0.08)' };
        case 'percent_change':
            return { label: '⟳ Percent Change', color: 'var(--text-secondary)', bg: 'rgba(100,100,100,0.08)' };
        default:
            return { label: type, color: 'var(--text-secondary)', bg: 'rgba(100,100,100,0.08)' };
    }
}

function targetValue(target) {
    if (target.target_type === 'percent_change') {
        return `${Number(target.condition_value).toFixed(2)}%`;
    }
    return formatINR(target.condition_value);
}

export default function Targets() {
    const { user } = useAuth();
    const [items, setItems] = useState([]);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [busy, setBusy] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [workingId, setWorkingId] = useState(null);
    const [form, setForm] = useState({
        symbol: '',
        name: '',
        exchange: 'NSE',
        targetType: 'above',
        conditionValue: '',
        notifyEmail: '',
    });

    useEffect(() => {
        if (user?.email) setForm((f) => ({ ...f, notifyEmail: f.notifyEmail || user.email }));
    }, [user?.email]);

    async function load() {
        setBusy(true);
        setError('');
        try {
            const data = await api('/targets');
            setItems(data.items ?? []);
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    }

    useEffect(() => { load(); }, []);

    async function onCreate(e) {
        e.preventDefault();
        setError('');
        setNotice('');
        setSaving(true);
        try {
            await api('/targets', {
                method: 'POST',
                body: {
                    symbol: form.symbol.trim().toUpperCase(),
                    name: form.name.trim() || form.symbol.trim().toUpperCase(),
                    exchange: form.exchange,
                    targetType: form.targetType,
                    conditionValue: Number(form.conditionValue),
                    notifyEmail: form.notifyEmail.trim(),
                },
            });
            setNotice(
                `Target set for ${form.symbol.toUpperCase()}. Prices are checked every minute and `
                + `you'll get an email at ${form.notifyEmail}.`
            );
            setModalOpen(false);
            setForm((f) => ({ ...f, symbol: '', name: '', conditionValue: '' }));
            await load();
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    }

    async function toggle(item) {
        setWorkingId(item.id);
        setError('');
        setNotice('');
        try {
            await api(`/targets/${item.id}`, {
                method: 'PATCH',
                body: { isActive: !Boolean(item.is_active) },
            });
            setNotice(`${item.stock_symbol} target ${item.is_active ? 'paused' : 'resumed'}.`);
            await load();
        } catch (err) {
            setError(err.message);
        } finally {
            setWorkingId(null);
        }
    }

    async function remove(item) {
        if (!window.confirm(`Delete the ${item.stock_symbol} target?`)) return;
        setWorkingId(item.id);
        setError('');
        setNotice('');
        try {
            await api(`/targets/${item.id}`, { method: 'DELETE' });
            setNotice('Target deleted.');
            setItems((current) => current.filter((t) => t.id !== item.id));
        } catch (err) {
            setError(err.message);
        } finally {
            setWorkingId(null);
        }
    }

    if (busy && items.length === 0) return <PageLoader text="Loading your targets…" />;

    const total = items.length;
    const active = items.filter((t) => t.is_active && !t.is_triggered).length;
    const triggered = items.filter((t) => t.is_triggered).length;
    const inactive = items.filter((t) => !t.is_active).length;

    return (
        <>
            {error && <ErrorToast error={error} />}
            {notice && <Toast type="success">{notice}</Toast>}

            <div className="page-head">
                <p>Get alerted when a stock crosses your target price.</p>
                <button type="button" className="btn btn-primary" onClick={() => setModalOpen(true)}>
                    <i className="fas fa-plus" /> Set Target
                </button>
            </div>

            <div className="target-summary">
                <div>
                    <div className="summary-label">Total Targets</div>
                    <div className="summary-value">{total}</div>
                </div>
                <div>
                    <div className="summary-label">Active</div>
                    <div className="summary-value" style={{ color: 'var(--green)' }}>{active}</div>
                </div>
                <div>
                    <div className="summary-label">Triggered</div>
                    <div className="summary-value" style={{ color: '#e25c1a' }}>{triggered}</div>
                </div>
                <div>
                    <div className="summary-label">Paused</div>
                    <div className="summary-value" style={{ color: 'var(--text-secondary)' }}>{inactive}</div>
                </div>
            </div>

            <div className="card">
                <div className="card-header">
                    <span className="card-title">
                        <i className="fas fa-bullseye" style={{ color: '#e25c1a', marginRight: 8 }} />
                        My Targets ({total})
                    </span>
                </div>

                {items.length > 0 ? (
                    <div style={{ overflowX: 'auto' }}>
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Stock</th>
                                    <th>Exchange</th>
                                    <th>Condition</th>
                                    <th>Target Price</th>
                                    <th>Price at Creation</th>
                                    <th>Live Price</th>
                                    <th>Progress</th>
                                    <th>Status</th>
                                    <th>Created</th>
                                    <th />
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((target) => {
                                    const meta = conditionMeta(target.target_type);
                                    const statusColor = target.is_triggered
                                        ? '#e25c1a'
                                        : target.is_active ? 'var(--green)' : 'var(--text-secondary)';
                                    const statusText = target.is_triggered
                                        ? 'Triggered'
                                        : target.is_active ? 'Active' : 'Paused';
                                    const statusIcon = target.is_triggered
                                        ? 'fa-bell'
                                        : target.is_active ? 'fa-circle-dot' : 'fa-pause';
                                    const rawProgress = target.progress;
                                    const progress = rawProgress == null ? null : Math.max(0, Math.min(100, Math.round(Number(rawProgress))));
                                    const barColor = target.is_triggered
                                        ? '#e25c1a'
                                        : target.target_type === 'price_fall' ? 'var(--red)' : 'var(--green)';

                                    return (
                                        <tr key={target.id}>
                                            <td>
                                                <div className="symbol-cell">
                                                    <div className="symbol-icon">{initials(target.stock_symbol, '—')}</div>
                                                    <div>
                                                        <div className="symbol-name">{target.stock_symbol}</div>
                                                        <div className="symbol-sub">{target.stock_name}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td><span className="badge badge-blue">{target.exchange || 'NSE'}</span></td>
                                            <td>
                                                <span style={{
                                                    fontSize: 12,
                                                    padding: '3px 10px',
                                                    borderRadius: 20,
                                                    fontWeight: 500,
                                                    background: meta.bg,
                                                    color: meta.color,
                                                    whiteSpace: 'nowrap',
                                                }}>
                                                    {meta.label}
                                                </span>
                                            </td>
                                            <td style={{ fontWeight: 600 }}>{targetValue(target)}</td>
                                            <td className="text-muted-cell">{formatINR(target.price_at_creation)}</td>
                                            <td style={{ fontWeight: 500 }}>
                                                {target.live_price != null ? formatINR(target.live_price) : '—'}
                                            </td>
                                            <td style={{ minWidth: 100 }}>
                                                {progress != null ? (
                                                    <div className="target-progress">
                                                        <div className="progress-bar-wrap">
                                                            <div
                                                                className="progress-bar-fill"
                                                                style={{ width: `${progress}%`, background: barColor }}
                                                            />
                                                        </div>
                                                        <span>{progress}%</span>
                                                    </div>
                                                ) : (
                                                    <span className="text-muted-cell">—</span>
                                                )}
                                            </td>
                                            <td>
                                                <span style={{ fontSize: 12, color: statusColor, fontWeight: 500, whiteSpace: 'nowrap' }}>
                                                    <i className={`fas ${statusIcon}`} style={{ fontSize: 10, marginRight: 4 }} />
                                                    {statusText}
                                                </span>
                                                {Boolean(target.is_triggered) && target.triggered_at && (
                                                    <div className="symbol-sub">{formatDateTime(target.triggered_at)}</div>
                                                )}
                                            </td>
                                            <td className="text-muted-cell" style={{ fontSize: 12 }}>
                                                {formatDate(target.created_at)}
                                            </td>
                                            <td>
                                                <div className="row-actions">
                                                    {!target.is_triggered && (
                                                        <button
                                                            type="button"
                                                            className="btn btn-ghost btn-sm"
                                                            title={target.is_active ? 'Pause' : 'Resume'}
                                                            disabled={workingId === target.id}
                                                            onClick={() => toggle(target)}
                                                        >
                                                            {workingId === target.id
                                                                ? <InlineSpinner />
                                                                : <i className={`fas ${target.is_active ? 'fa-pause' : 'fa-play'}`} />}
                                                        </button>
                                                    )}
                                                    <button
                                                        type="button"
                                                        className="btn btn-danger btn-sm"
                                                        title="Delete"
                                                        disabled={workingId === target.id}
                                                        onClick={() => remove(target)}
                                                    >
                                                        <i className="fas fa-trash" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <EmptyState
                        icon="fa-bullseye"
                        title="No targets set"
                        action={(
                            <button type="button" className="btn btn-primary" onClick={() => setModalOpen(true)}>
                                <i className="fas fa-plus" /> Set First Target
                            </button>
                        )}
                    >
                        Set a price target to track when a stock crosses your desired price.
                    </EmptyState>
                )}
            </div>

            <Modal
                open={modalOpen}
                onClose={() => !saving && setModalOpen(false)}
                title="Set Price Target"
                subtitle="Get notified when a stock hits your price"
                icon="fa-bullseye"
                iconColor="#e25c1a"
            >
                <form onSubmit={onCreate}>
                    <div className="form-grid-2">
                        <div className="form-group">
                            <label className="form-label" htmlFor="targetSymbol">Stock Symbol</label>
                            <input
                                id="targetSymbol"
                                className="form-input"
                                placeholder="e.g. RELIANCE"
                                value={form.symbol}
                                onChange={(e) => setForm({ ...form, symbol: e.target.value.toUpperCase() })}
                                style={{ textTransform: 'uppercase' }}
                                required
                                autoFocus
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label" htmlFor="targetName">Stock Name</label>
                            <input
                                id="targetName"
                                className="form-input"
                                placeholder="e.g. Reliance Industries"
                                value={form.name}
                                onChange={(e) => setForm({ ...form, name: e.target.value })}
                            />
                        </div>
                    </div>

                    <div className="form-grid-2">
                        <div className="form-group">
                            <label className="form-label" htmlFor="targetExchange">Exchange</label>
                            <select
                                id="targetExchange"
                                className="form-input"
                                value={form.exchange}
                                onChange={(e) => setForm({ ...form, exchange: e.target.value })}
                            >
                                <option value="NSE">NSE</option>
                                <option value="BSE">BSE</option>
                            </select>
                        </div>
                        <div className="form-group">
                            <label className="form-label" htmlFor="targetType">Condition</label>
                            <select
                                id="targetType"
                                className="form-input"
                                value={form.targetType}
                                onChange={(e) => setForm({ ...form, targetType: e.target.value })}
                            >
                                <option value="above">▲ Price goes Above</option>
                                <option value="below">▼ Price goes Below</option>
                            </select>
                        </div>
                    </div>

                    <div className="form-group">
                        <label className="form-label" htmlFor="conditionValue">Target Price (₹)</label>
                        <input
                            id="conditionValue"
                            type="number"
                            className="form-input"
                            placeholder="0.00"
                            step="0.01"
                            min="0.01"
                            value={form.conditionValue}
                            onChange={(e) => setForm({ ...form, conditionValue: e.target.value })}
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label className="form-label" htmlFor="notifyEmail">Notify Email</label>
                        <input
                            id="notifyEmail"
                            type="email"
                            className="form-input"
                            placeholder="your@email.com"
                            value={form.notifyEmail}
                            onChange={(e) => setForm({ ...form, notifyEmail: e.target.value })}
                            required
                        />
                    </div>

                    <div className="modal-actions">
                        <button type="button" className="btn btn-ghost" disabled={saving} onClick={() => setModalOpen(false)}>
                            Cancel
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={saving}>
                            {saving ? <InlineSpinner /> : <i className="fas fa-bullseye" />}
                            {saving ? 'Setting…' : 'Set Target'}
                        </button>
                    </div>
                </form>
            </Modal>
        </>
    );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, assetUrl } from '../api';
import {
    EmptyState, ErrorToast, formatDate, InlineSpinner, PageLoader,
    Toast,
} from '../components/ui';

/* ─────────────────────────────────────────────────────────────
   Shared accounts loader
   ───────────────────────────────────────────────────────────── */
function useKiteAccounts() {
    const [accounts, setAccounts] = useState([]);
    const [busy, setBusy] = useState(true);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');

    const load = useCallback(async ({ silent = false } = {}) => {
        if (!silent) setBusy(true);
        setError('');
        try {
            const data = await api('/kite/accounts');
            setAccounts(data.accounts ?? []);
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    return {
        accounts, setAccounts, busy, error, setError, notice, setNotice,
        load,
    };
}

async function connectAccount(account, setError, setConnecting) {
    setError('');
    setConnecting(account.id);
    try {
        const data = await api(`/kite/accounts/${account.id}/connect`, { method: 'POST' });
        if (!data.loginUrl) throw new Error('Zerodha did not return a login URL.');
        // Fallback for callbacks that do not echo the account id (also covers
        // connections started before redirect_params was added).
        sessionStorage.setItem('kite_pending_account', String(account.id));
        window.location.assign(data.loginUrl);
    } catch (err) {
        setError(err.message);
        setConnecting(null);
    }
}

/* ─────────────────────────────────────────────────────────────
   /kite — Zerodha settings (API keys)
   ───────────────────────────────────────────────────────────── */
export function KiteAccounts() {
    const {
        accounts, busy, error, setError, notice, setNotice,
        load,
    } = useKiteAccounts();
    const [removing, setRemoving] = useState(null);

    async function remove(account) {
        if (!window.confirm(`Remove ${account.nickname}? This cannot be undone.`)) return;
        setRemoving(account.id);
        setError('');
        setNotice('');
        try {
            await api(`/kite/accounts/${account.id}`, { method: 'DELETE' });
            setNotice(`${account.nickname} removed.`);
            await load({ silent: true });
        } catch (err) {
            setError(err.message);
        } finally {
            setRemoving(null);
        }
    }

    if (busy) return <PageLoader text="Loading Zerodha accounts…" />;

    return (
        <>
            {error && <ErrorToast error={error} />}
            {notice && <Toast type="success">{notice}</Toast>}

            <div className="kite-page-narrow">
                <div className="kite-page-head">
                    <h2>
                        <i className="fas fa-key" style={{ color: 'var(--accent)', marginRight: 8 }} />
                        Zerodha Accounts
                    </h2>
                    <Link to="/kite/add" className="btn btn-primary">
                        <i className="fas fa-plus" /> Add Account
                    </Link>
                </div>

                {accounts.length === 0 ? (
                    <div className="card" style={{ textAlign: 'center', padding: 48 }}>
                        <i className="fas fa-key empty-large-icon" />
                        <h4>No accounts added yet</h4>
                        <p className="text-muted">Add your Zerodha API keys to connect your portfolio.</p>
                        <Link to="/kite/add" className="btn btn-primary" style={{ marginTop: 8 }}>
                            <i className="fas fa-plus" /> Add Account
                        </Link>
                    </div>
                ) : (
                    <>
                        {accounts.map((account) => (
                            <div className="card kite-account-card" key={account.id}>
                                <div className="kite-account-row">
                                    <div className="kite-account-info">
                                        <div className="kite-icon"><i className="fas fa-key" /></div>
                                        <div>
                                            <div className="kite-account-name">{account.nickname}</div>
                                            <div className="kite-account-key">
                                                {account.masked_key || `${account.api_key?.slice(0, 8) || ''}••••`}
                                            </div>
                                            {account.connected && (
                                                <div className="kite-connected-label">
                                                    <i className="fas fa-circle" style={{ fontSize: 7 }} /> Connected
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="kite-account-actions">
                                        <Link
                                            to={`/kite/edit/${account.id}`}
                                            className="btn btn-ghost btn-sm"
                                        >
                                            <i className="fas fa-pencil" /> Edit
                                        </Link>
                                        <button
                                            type="button"
                                            className="btn btn-danger btn-sm"
                                            onClick={() => remove(account)}
                                            disabled={removing === account.id}
                                            title={`Remove ${account.nickname}`}
                                        >
                                            {removing === account.id ? <InlineSpinner /> : <i className="fas fa-trash" />}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}

                        <div style={{ marginTop: 8 }}>
                            <Link to="/kite/connect" className="btn btn-ghost" style={{ fontSize: 13 }}>
                                <i className="fas fa-plug" /> Manage Connections
                            </Link>
                        </div>
                    </>
                )}
            </div>
        </>
    );
}

/* ─────────────────────────────────────────────────────────────
   /kite/connect — OAuth connection status
   ───────────────────────────────────────────────────────────── */
export function KiteConnect() {
    const {
        accounts, busy, error, setError, notice, setNotice,
        load,
    } = useKiteAccounts();
    const [connecting, setConnecting] = useState(null);
    const [disconnecting, setDisconnecting] = useState(null);

    async function disconnect(account) {
        if (!window.confirm(`Disconnect ${account.nickname}?`)) return;
        setDisconnecting(account.id);
        setError('');
        setNotice('');
        try {
            await api(`/kite/accounts/${account.id}/disconnect`, { method: 'POST' });
            setNotice(`${account.nickname} disconnected. Broker session data discarded.`);
            await load({ silent: true });
        } catch (err) {
            setError(err.message);
        } finally {
            setDisconnecting(null);
        }
    }

    if (busy) return <PageLoader text="Loading Zerodha connections…" />;

    return (
        <>
            {error && <ErrorToast error={error} />}
            {notice && <Toast type="success">{notice}</Toast>}

            <div className="kite-page-narrow-narrow">
                <div className="kite-page-head">
                    <h2>Zerodha Connections</h2>
                    <Link to="/kite" className="btn btn-ghost" style={{ fontSize: 12 }}>
                        <i className="fas fa-gear" /> Manage Keys
                    </Link>
                </div>

                {accounts.length === 0 ? (
                    <div className="card" style={{ textAlign: 'center', padding: 48 }}>
                        <i className="fas fa-plug empty-large-icon" />
                        <h4>No accounts configured</h4>
                        <p className="text-muted">Add your Zerodha API keys first to connect.</p>
                        <Link to="/kite/add" className="btn btn-primary" style={{ marginTop: 8 }}>
                            <i className="fas fa-key" /> Add Account
                        </Link>
                    </div>
                ) : (
                    <>
                        {accounts.map((account) => (
                            <div
                                className={`card kite-connect-card${account.connected ? ' connected' : ''}`}
                                key={account.id}
                            >
                                <div className="kite-account-row">
                                    <div className="kite-account-info">
                                        <div className={`kite-connect-icon${account.connected ? ' connected' : ''}`}>
                                            <i className={`fas ${account.connected ? 'fa-circle-check' : 'fa-plug'}`} />
                                        </div>
                                        <div>
                                            <div className="kite-account-name">{account.nickname}</div>
                                            <div className={`kite-connection-status${account.connected ? ' connected' : ''}`}>
                                                {account.connected
                                                    ? 'Connected — portfolio syncing'
                                                    : 'Not connected'}
                                            </div>
                                            {account.token_generated_at && account.connected && (
                                                <div className="kite-token-date">
                                                    Session started {formatDate(account.token_generated_at)}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {account.connected ? (
                                        <button
                                            type="button"
                                            className="btn btn-danger"
                                            style={{ fontSize: 12, padding: '7px 14px' }}
                                            onClick={() => disconnect(account)}
                                            disabled={disconnecting === account.id}
                                        >
                                            {disconnecting === account.id
                                                ? <InlineSpinner />
                                                : <i className="fas fa-plug-circle-xmark" />} Disconnect
                                        </button>
                                    ) : (
                                        <button
                                            type="button"
                                            className="btn btn-primary"
                                            style={{ fontSize: 12, padding: '7px 14px' }}
                                            onClick={() => connectAccount(account, setError, setConnecting)}
                                            disabled={connecting === account.id}
                                        >
                                            {connecting === account.id
                                                ? <InlineSpinner />
                                                : <i className="fas fa-plug" />} Connect
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}

                        <div className="card kite-security-card">
                            <div className="kite-security-row">
                                <i className="fas fa-shield-halved" />
                                <div>
                                    Your credentials are <strong>never shared</strong> by us beyond your API keys.
                                    OAuth tokens are used read-only and can be disconnected at any time.
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </>
    );
}

/* ─────────────────────────────────────────────────────────────
   /kite/add — add API keys
   ───────────────────────────────────────────────────────────── */
export function KiteAddAccount() {
    const navigate = useNavigate();
    const [form, setForm] = useState({ nickname: '', apiKey: '', apiSecret: '' });
    const [showSecret, setShowSecret] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    async function onSubmit(e) {
        e.preventDefault();
        setError('');
        setBusy(true);
        try {
            await api('/kite/accounts', { method: 'POST', body: form });
            navigate('/kite', { replace: true });
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="kite-page-form">
            <div className="kite-form-head">
                <Link to="/kite" className="back-link-inline">
                    <i className="fas fa-arrow-left" /> Back to accounts
                </Link>
                <h2>Add Zerodha Account</h2>
            </div>

            {error && <ErrorToast error={error} />}

            <div className="card">
                <div className="info-banner" style={{ marginBottom: 24 }}>
                    <i className="fas fa-info-circle" />
                    <span>
                        Get your keys from{' '}
                        <a href="https://developers.kite.trade" target="_blank" rel="noreferrer">developers.kite.trade</a>.
                        Each account needs its own API key pair.
                    </span>
                </div>

                <form onSubmit={onSubmit}>
                    <div className="form-group">
                        <label className="form-label" htmlFor="nickname">Nickname</label>
                        <input
                            id="nickname"
                            className="field-input"
                            placeholder="e.g. My Account, Dad's Account"
                            value={form.nickname}
                            onChange={(e) => setForm({ ...form, nickname: e.target.value })}
                            required
                            autoFocus
                        />
                    </div>

                    <div className="form-group">
                        <label className="form-label" htmlFor="apiKey">API Key</label>
                        <input
                            id="apiKey"
                            className="field-input"
                            placeholder="abc123xyz"
                            autoComplete="off"
                            value={form.apiKey}
                            onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                            required
                        />
                    </div>

                    <div className="form-group" style={{ marginBottom: 28 }}>
                        <label className="form-label" htmlFor="apiSecret">API Secret</label>
                        <div className="password-wrap">
                            <input
                                id="apiSecret"
                                type={showSecret ? 'text' : 'password'}
                                className="field-input password-input"
                                placeholder="Enter your API secret"
                                autoComplete="new-password"
                                value={form.apiSecret}
                                onChange={(e) => setForm({ ...form, apiSecret: e.target.value })}
                                required
                            />
                            <button
                                type="button"
                                className="password-toggle"
                                onClick={() => setShowSecret((v) => !v)}
                                aria-label={showSecret ? 'Hide API secret' : 'Show API secret'}
                            >
                                <i className={`fas ${showSecret ? 'fa-eye-slash' : 'fa-eye'}`} />
                            </button>
                        </div>
                    </div>

                    <div className="kite-form-actions">
                        <button type="submit" className="btn btn-primary" disabled={busy}>
                            {busy ? <InlineSpinner /> : <i className="fas fa-save" />}
                            {busy ? 'Saving…' : 'Save Account'}
                        </button>
                        <Link to="/kite" className="btn btn-ghost">Cancel</Link>
                    </div>
                </form>
            </div>
        </div>
    );
}

/* ─────────────────────────────────────────────────────────────
   /kite/edit/:id — change keys
   ───────────────────────────────────────────────────────────── */
export function KiteEditAccount() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [form, setForm] = useState({ nickname: '', apiKey: '', apiSecret: '' });
    const [showSecret, setShowSecret] = useState(false);
    const [busy, setBusy] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [notFound, setNotFound] = useState(false);

    useEffect(() => {
        (async () => {
            setBusy(true);
            try {
                const data = await api('/kite/accounts');
                const account = (data.accounts ?? []).find((a) => String(a.id) === String(id));
                if (!account) {
                    setNotFound(true);
                    return;
                }
                setForm({
                    nickname: account.nickname || '',
                    apiKey: account.api_key || '',
                    apiSecret: '',
                });
            } catch (err) {
                setError(err.message);
            } finally {
                setBusy(false);
            }
        })();
    }, [id]);

    async function onSubmit(e) {
        e.preventDefault();
        setError('');
        setSaving(true);
        try {
            await api(`/kite/accounts/${id}`, {
                method: 'PUT',
                body: {
                    nickname: form.nickname,
                    apiKey: form.apiKey,
                    ...(form.apiSecret ? { apiSecret: form.apiSecret } : {}),
                },
            });
            navigate('/kite', { replace: true });
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    }

    if (busy) return <PageLoader text="Loading account…" />;

    if (notFound) {
        return (
            <div className="card empty-state">
                <i className="fas fa-key" />
                <h4>Account not found</h4>
                <p>It may have been removed.</p>
                <Link to="/kite" className="btn btn-primary">Back to accounts</Link>
            </div>
        );
    }

    return (
        <div className="kite-page-form">
            <div className="kite-form-head">
                <Link to="/kite" className="back-link-inline">
                    <i className="fas fa-arrow-left" /> Back to accounts
                </Link>
                <h2>Edit Account</h2>
            </div>

            {error && <ErrorToast error={error} />}

            <div className="card">
                <form onSubmit={onSubmit}>
                    <div className="form-group">
                        <label className="form-label" htmlFor="editNickname">Nickname</label>
                        <input
                            id="editNickname"
                            className="field-input"
                            value={form.nickname}
                            onChange={(e) => setForm({ ...form, nickname: e.target.value })}
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label className="form-label" htmlFor="editApiKey">API Key</label>
                        <input
                            id="editApiKey"
                            className="field-input"
                            autoComplete="off"
                            value={form.apiKey}
                            onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                            required
                        />
                    </div>

                    <div className="form-group" style={{ marginBottom: 28 }}>
                        <label className="form-label" htmlFor="editApiSecret">API Secret</label>
                        <div className="password-wrap">
                            <input
                                id="editApiSecret"
                                type={showSecret ? 'text' : 'password'}
                                className="field-input password-input"
                                placeholder="Leave blank to keep existing"
                                autoComplete="new-password"
                                value={form.apiSecret}
                                onChange={(e) => setForm({ ...form, apiSecret: e.target.value })}
                            />
                            <button
                                type="button"
                                className="password-toggle"
                                onClick={() => setShowSecret((v) => !v)}
                                aria-label={showSecret ? 'Hide API secret' : 'Show API secret'}
                            >
                                <i className={`fas ${showSecret ? 'fa-eye-slash' : 'fa-eye'}`} />
                            </button>
                        </div>
                        <div className="form-hint">Leave blank to keep your existing secret.</div>
                    </div>

                    <div className="kite-form-actions">
                        <button type="submit" className="btn btn-primary" disabled={saving}>
                            {saving ? <InlineSpinner /> : <i className="fas fa-save" />}
                            {saving ? 'Saving…' : 'Save Changes'}
                        </button>
                        <Link to="/kite" className="btn btn-ghost">Cancel</Link>
                    </div>
                </form>
            </div>
        </div>
    );
}

/* ─────────────────────────────────────────────────────────────
   /kite/callback — Zerodha OAuth return
   ───────────────────────────────────────────────────────────── */
// Guards against duplicate exchanges (React StrictMode, back/forward cache).
const exchangesStarted = new Set();

export function KiteCallback() {
    const [params] = useSearchParams();
    const navigate = useNavigate();
    const connected = params.get('connected') === '1';
    const errorMessage = params.get('error');
    const account = params.get('account');
    const userName = params.get('user');
    const requestToken = params.get('request_token');
    const [seconds, setSeconds] = useState(3);
    const [exchanging, setExchanging] = useState(Boolean(requestToken));
    const [exchangeError, setExchangeError] = useState('');

    // Kite sends the browser back to this SPA route with ?request_token=… .
    // Exchange it through the API (the JWT proves account ownership) and then
    // remove the one-time token from the URL.
    useEffect(() => {
        if (!requestToken || exchangesStarted.has(requestToken)) return undefined;
        exchangesStarted.add(requestToken);

        const accountId = account || sessionStorage.getItem('kite_pending_account');
        if (!accountId) {
            setExchanging(false);
            setExchangeError('Could not identify which Zerodha account this login belongs to. Please click Connect again.');
            return undefined;
        }

        let cancelled = false;
        (async () => {
            try {
                const data = await api(`/kite/accounts/${accountId}/session`, {
                    method: 'POST',
                    body: { requestToken },
                });
                if (cancelled) return;
                sessionStorage.removeItem('kite_pending_account');
                setExchanging(false);
                const next = new URLSearchParams({
                    connected: '1',
                    account: data.account || '',
                    user: data.user || '',
                });
                navigate(`/kite/callback?${next}`, { replace: true });
            } catch (err) {
                if (cancelled) return;
                exchangesStarted.delete(requestToken);
                setExchanging(false);
                setExchangeError(err.message || 'Could not connect to Zerodha.');
                navigate(
                    `/kite/callback?error=${encodeURIComponent(err.message || 'Could not connect to Zerodha.')}`,
                    { replace: true }
                );
            }
        })();

        return () => { cancelled = true; };
    }, [requestToken, account, navigate]);

    useEffect(() => {
        if (!connected || exchanging) return undefined;
        const tick = setInterval(() => setSeconds((s) => Math.max(0, s - 1)), 1000);
        const redirect = setTimeout(() => navigate('/dashboard', { replace: true }), 3000);
        return () => {
            clearInterval(tick);
            clearTimeout(redirect);
        };
    }, [connected, exchanging, navigate]);

    return (
        <div className="kite-callback-wrap">
            <div className="card kite-callback-card">
                {exchanging ? (
                    <>
                        <div className="kite-callback-icon">
                            <InlineSpinner />
                        </div>
                        <h3 className="kite-callback-title">Connecting…</h3>
                        <p className="kite-callback-copy">
                            Finishing your Zerodha login and fetching a fresh session.
                        </p>
                    </>
                ) : connected ? (
                    <>
                        <div className="kite-callback-icon success">
                            <i className="fas fa-circle-check" />
                        </div>
                        <h3 className="kite-callback-title success">Connected!</h3>
                        <p className="kite-callback-copy">
                            {account ? `${account} is now connected` : 'Your Zerodha account is now connected'}
                            {userName ? ` as ${userName}` : ''}.
                        </p>
                        <p className="kite-callback-muted">Redirecting to your dashboard in {seconds}s…</p>
                        <div className="kite-progress">
                            <div className="kite-progress-fill" />
                        </div>
                        <Link to="/dashboard" className="btn btn-primary" style={{ marginTop: 24 }}>
                            <i className="fas fa-gauge-high" /> Go to Dashboard
                        </Link>
                    </>
                ) : (
                    <>
                        <div className="kite-callback-icon error">
                            <i className="fas fa-circle-xmark" />
                        </div>
                        <h3 className="kite-callback-title error">Connection Failed</h3>
                        <p className="kite-callback-copy">
                            {exchangeError || errorMessage || 'Zerodha did not complete the connection. Please try again.'}
                        </p>
                        <div className="kite-callback-actions">
                            <Link to="/kite/connect" className="btn btn-primary">
                                <i className="fas fa-rotate-right" /> Try Again
                            </Link>
                            <Link to="/dashboard" className="btn btn-ghost">
                                <i className="fas fa-gauge-high" /> Dashboard
                            </Link>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

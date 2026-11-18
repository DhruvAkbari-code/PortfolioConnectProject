import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { InlineSpinner, Toast } from '../components/ui';

export default function ForgotPassword() {
    const [email, setEmail] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [devResetUrl, setDevResetUrl] = useState('');

    async function onSubmit(e) {
        e.preventDefault();
        setError('');
        setNotice('');
        setDevResetUrl('');
        setBusy(true);
        try {
            const data = await api('/auth/forgot-password', { method: 'POST', body: { email } });
            setNotice(data.message || 'If an account exists for that email, a reset link has been sent.');
            if (data.devResetUrl) setDevResetUrl(data.devResetUrl);
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="auth-page">
            <div className="auth-bg" />
            <div className="auth-grid" />

            <div className="auth-card">
                <div className="auth-logo">
                    <div className="auth-logo-icon"><i className="fas fa-chart-candlestick" /></div>
                    <div className="auth-logo-name">Kite<em>Pro</em></div>
                </div>

                <h2 className="auth-title">Forgot Password</h2>
                <p className="auth-subtitle">
                    Enter your registered email and we&apos;ll let you reset your password.
                </p>

                {error && <Toast type="error">{error}</Toast>}
                {notice && <Toast type="success">{notice}</Toast>}
                {devResetUrl && (
                    <div className="dev-reset-box">
                        <div><i className="fas fa-wrench" /> Development reset link</div>
                        <a href={devResetUrl}>{devResetUrl}</a>
                    </div>
                )}

                <form onSubmit={onSubmit}>
                    <div className="form-group">
                        <label className="form-label" htmlFor="forgotEmail">Email Address</label>
                        <input
                            id="forgotEmail"
                            type="email"
                            className="form-input"
                            placeholder="Enter your registered email"
                            autoComplete="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />
                    </div>
                    <button type="submit" className="btn btn-primary auth-submit" disabled={busy}>
                        {busy ? <InlineSpinner /> : <i className="fas fa-arrow-right" />}
                        {busy ? 'Sending…' : 'Continue'}
                    </button>
                </form>

                <p className="auth-divider auth-divider-spaced">
                    Remember your password? <Link to="/login" className="auth-link">Sign in</Link>
                </p>
            </div>
        </div>
    );
}

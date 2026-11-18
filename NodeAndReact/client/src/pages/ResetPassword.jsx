import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { InlineSpinner, Toast } from '../components/ui';

export default function ResetPassword() {
    const { token: pathToken } = useParams();
    const [params] = useSearchParams();
    const token = pathToken || params.get('token') || '';
    const navigate = useNavigate();
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    const strength = useMemo(() => {
        const v = password;
        let score = 0;
        if (v.length >= 6) score += 1;
        if (v.length >= 10) score += 1;
        if (/[A-Z]/.test(v) && /[0-9]/.test(v)) score += 1;
        if (/[^A-Za-z0-9]/.test(v)) score += 1;
        return score;
    }, [password]);

    async function onSubmit(e) {
        e.preventDefault();
        setError('');
        if (!token) {
            setError('This reset link is missing its token. Please request a new link.');
            return;
        }
        if (password !== confirm) {
            setError('The passwords do not match.');
            return;
        }
        setBusy(true);
        try {
            await api('/auth/reset-password', { method: 'POST', body: { token, password } });
            navigate('/login?reset=1', { replace: true });
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

                <h2 className="auth-title">Reset Password</h2>
                <p className="auth-subtitle">Choose a new password for your account.</p>

                {error && <Toast type="error">{error}</Toast>}
                {!token && !error && (
                    <Toast type="info">
                        Open this page from the reset link in your email. You can{' '}
                        <Link to="/forgot-password" className="auth-link">request a new one</Link>.
                    </Toast>
                )}

                <form onSubmit={onSubmit}>
                    <div className="form-group">
                        <label className="form-label" htmlFor="newPwd">New Password</label>
                        <div className="password-wrap">
                            <input
                                id="newPwd"
                                type={showPassword ? 'text' : 'password'}
                                className="form-input password-input"
                                placeholder="Min 6 characters"
                                autoComplete="new-password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                minLength={6}
                            />
                            <button
                                type="button"
                                className="password-toggle"
                                onClick={() => setShowPassword((v) => !v)}
                                aria-label={showPassword ? 'Hide password' : 'Show password'}
                            >
                                <i className={`fas ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`} />
                            </button>
                        </div>
                    </div>

                    <div className="form-group">
                        <label className="form-label" htmlFor="confirmPwd">Confirm New Password</label>
                        <input
                            id="confirmPwd"
                            type={showPassword ? 'text' : 'password'}
                            className="form-input"
                            placeholder="Repeat new password"
                            autoComplete="new-password"
                            value={confirm}
                            onChange={(e) => setConfirm(e.target.value)}
                            required
                        />
                    </div>

                    <div className="strength-bars">
                        {[1, 2, 3, 4].map((n) => (
                            <span key={n} className={n <= strength ? `filled s${strength}` : ''} />
                        ))}
                    </div>
                    <div className="strength-label">
                        {password ? ['', 'Weak', 'Fair', 'Good', 'Strong'][strength] : ''}
                    </div>

                    <button type="submit" className="btn btn-primary auth-submit" disabled={busy || !token}>
                        {busy ? <InlineSpinner /> : <i className="fas fa-lock" />}
                        {busy ? 'Resetting…' : 'Reset Password'}
                    </button>
                </form>

                <p className="auth-divider auth-divider-spaced">
                    <Link to="/forgot-password" className="auth-link">
                        <i className="fas fa-arrow-left" style={{ fontSize: 11 }} /> Back
                    </Link>
                </p>
            </div>
        </div>
    );
}

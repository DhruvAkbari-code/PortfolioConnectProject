import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { InlineSpinner, Toast } from '../components/ui';

const GoogleIcon = () => (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
);

export default function Register() {
    const { login } = useAuth();
    const navigate = useNavigate();
    const [form, setForm] = useState({ fullName: '', email: '', password: '' });
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [googleEnabled, setGoogleEnabled] = useState(true);

    useEffect(() => {
        api('/auth/google/status')
            .then((d) => setGoogleEnabled(Boolean(d.enabled)))
            .catch(() => setGoogleEnabled(false));
    }, []);

    const strength = (() => {
        const v = form.password;
        if (!v) return 0;
        let score = v.length >= 6 ? 1 : 0;
        if (v.length >= 10) score += 1;
        if (/[A-Z]/.test(v) && /[0-9]/.test(v)) score += 1;
        if (/[^A-Za-z0-9]/.test(v)) score += 1;
        return score;
    })();

    async function onSubmit(e) {
        e.preventDefault();
        setError('');
        setBusy(true);
        try {
            const data = await api('/auth/register', { method: 'POST', body: form });
            login(data);
            navigate('/dashboard', { replace: true });
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="auth-page auth-page-register">
            <div className="auth-bg" />
            <div className="auth-grid" />

            <div className="auth-card">
                <div className="auth-logo">
                    <div className="auth-logo-icon"><i className="fas fa-chart-candlestick" /></div>
                    <div className="auth-logo-name">Kite<em>Pro</em></div>
                </div>

                <h2 className="auth-title">Create account</h2>
                <p className="auth-subtitle">Start tracking your portfolio today</p>

                {error && <Toast type="error">{error}</Toast>}

                {googleEnabled ? (
                    <a href="/api/auth/google" className="google-btn">
                        <GoogleIcon />
                        Sign up with Google
                    </a>
                ) : (
                    <button type="button" className="google-btn google-btn-disabled" disabled>
                        <GoogleIcon />
                        Google sign-up not configured
                    </button>
                )}

                <div className="auth-or">or register with email</div>

                <form onSubmit={onSubmit}>
                    <div className="form-group">
                        <label className="form-label" htmlFor="fullName">Full Name</label>
                        <input
                            id="fullName"
                            type="text"
                            className="form-input"
                            placeholder="Your full name"
                            autoComplete="name"
                            value={form.fullName}
                            onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                            required
                            minLength={2}
                        />
                    </div>
                    <div className="form-group">
                        <label className="form-label" htmlFor="regEmail">Email</label>
                        <input
                            id="regEmail"
                            type="email"
                            className="form-input"
                            placeholder="you@example.com"
                            autoComplete="email"
                            value={form.email}
                            onChange={(e) => setForm({ ...form, email: e.target.value })}
                            required
                        />
                        <small className="form-hint">This will be your login email</small>
                    </div>
                    <div className="form-group">
                        <label className="form-label" htmlFor="regPassword">Password</label>
                        <div className="password-wrap">
                            <input
                                id="regPassword"
                                type={showPassword ? 'text' : 'password'}
                                className="form-input password-input"
                                placeholder="Create a password (min. 6 characters)"
                                autoComplete="new-password"
                                value={form.password}
                                onChange={(e) => setForm({ ...form, password: e.target.value })}
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
                        <div className="password-strength">
                            <div className={`password-strength-bar strength-${strength}`} />
                        </div>
                        <small className="form-hint">
                            Use at least 6 characters with a mix of letters, numbers &amp; symbols
                        </small>
                    </div>
                    <button type="submit" className="btn btn-primary auth-submit" disabled={busy}>
                        {busy ? <InlineSpinner /> : <i className="fas fa-user-plus" />}
                        {busy ? 'Creating account…' : 'Create Account'}
                    </button>
                </form>

                <p className="auth-divider">
                    Already have an account? <Link to="/login" className="auth-link">Sign in</Link>
                </p>

                <div className="auth-terms">
                    By registering, you agree to our <a href="#" className="auth-link">Terms</a> and{' '}
                    <a href="#" className="auth-link">Privacy Policy</a>
                </div>
            </div>
        </div>
    );
}

import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
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

export default function Login() {
    const { login } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [params] = useSearchParams();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [googleEnabled, setGoogleEnabled] = useState(true);

    useEffect(() => {
        api('/auth/google/status')
            .then((d) => setGoogleEnabled(Boolean(d.enabled)))
            .catch(() => setGoogleEnabled(false));
    }, []);

    useEffect(() => {
        if (params.get('expired')) setError('Your session expired. Please sign in again.');
        else if (params.get('google_error')) setError('Google sign-in was cancelled or failed. Please try again.');
    }, [params]);

    async function onSubmit(e) {
        e.preventDefault();
        setError('');
        setBusy(true);
        try {
            const data = await api('/auth/login', { method: 'POST', body: { email, password } });
            login(data);
            const from = location.state?.from || params.get('from');
            navigate(from && from.startsWith('/') ? from : '/dashboard', { replace: true });
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

                <h2 className="auth-title">Welcome back</h2>
                <p className="auth-subtitle">Sign in to your portfolio dashboard</p>

                {params.get('reset') && <Toast type="success">Password updated. You can now sign in.</Toast>}
                {params.get('registered') && <Toast type="success">Account created. Please sign in.</Toast>}
                {error && <Toast type="error">{error}</Toast>}

                <form onSubmit={onSubmit}>
                    <div className="form-group">
                        <label className="form-label" htmlFor="email">Email</label>
                        <input
                            id="email"
                            type="email"
                            name="email"
                            className="form-input"
                            placeholder="Enter your email"
                            autoComplete="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />
                    </div>
                    <div className="form-group">
                        <label className="form-label" htmlFor="password">Password</label>
                        <div className="password-wrap">
                            <input
                                id="password"
                                type={showPassword ? 'text' : 'password'}
                                name="password"
                                className="form-input password-input"
                                placeholder="Enter password"
                                autoComplete="current-password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
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
                    <div className="auth-forgot-row">
                        <Link to="/forgot-password" className="auth-link">Forgot password?</Link>
                    </div>
                    <button type="submit" className="btn btn-primary auth-submit" disabled={busy}>
                        {busy ? <InlineSpinner /> : <i className="fas fa-right-to-bracket" />}
                        {busy ? 'Signing in…' : 'Sign In'}
                    </button>
                </form>

                <div className="auth-divider">or</div>

                {googleEnabled ? (
                    <a href="/api/auth/google" className="google-btn">
                        <GoogleIcon />
                        Continue with Google
                    </a>
                ) : (
                    <button type="button" className="google-btn google-btn-disabled" disabled>
                        <GoogleIcon />
                        Google sign-in not configured
                    </button>
                )}

                <p className="auth-divider">
                    Don&apos;t have an account? <Link to="/register" className="auth-link">Register</Link>
                </p>
            </div>
        </div>
    );
}

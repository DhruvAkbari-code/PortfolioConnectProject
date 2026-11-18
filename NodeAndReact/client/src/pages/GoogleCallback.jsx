import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, saveSession } from '../api';
import { useAuth } from '../AuthContext';
import { PageLoader, Toast } from '../components/ui';

const ERROR_MESSAGES = {
    cancelled: 'Google sign-in was cancelled.',
    not_configured: 'Google sign-in is not configured on the server.',
    token_exchange: 'Google could not verify the sign-in. Please try again.',
    profile: 'Google did not return a profile. Please try again.',
    state: 'Google sign-in session expired or was tampered with. Please try again.',
};

export default function GoogleCallback() {
    const [params] = useSearchParams();
    const navigate = useNavigate();
    const { login } = useAuth();
    const [error, setError] = useState('');
    const started = useRef(false);

    useEffect(() => {
        if (started.current) return;
        started.current = true;

        const token = params.get('token');
        const oauthError = params.get('error');

        if (oauthError) {
            setError(ERROR_MESSAGES[oauthError] || `Google sign-in failed (${oauthError}).`);
            return;
        }
        if (!token) {
            setError('Google sign-in did not return a session token.');
            return;
        }

        (async () => {
            try {
                // Persist the token first so the authenticated /auth/me request can use it.
                saveSession({ token });
                const { user } = await api('/auth/me');
                login({ token, user });
                navigate('/dashboard', { replace: true });
            } catch (err) {
                setError(err.message || 'Could not complete Google sign-in.');
            }
        })();
    }, [params, navigate, login]);

    if (!error) {
        return (
            <div className="auth-page">
                <div className="auth-bg" />
                <div className="auth-grid" />
                <div className="auth-card" style={{ textAlign: 'center' }}>
                    <div className="auth-logo" style={{ justifyContent: 'center' }}>
                        <div className="auth-logo-icon"><i className="fas fa-chart-candlestick" /></div>
                    </div>
                    <PageLoader text="Completing Google sign-in…" />
                </div>
            </div>
        );
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
                <h2 className="auth-title">Sign-in failed</h2>
                <Toast type="error">{error}</Toast>
                <Link to="/login" className="btn btn-primary auth-submit">
                    <i className="fas fa-right-to-bracket" /> Back to Sign In
                </Link>
            </div>
        </div>
    );
}

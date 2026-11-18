import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { initials } from './ui';

const TITLES = [
    ['/kite/connect', 'Connect Zerodha'],
    ['/kite/callback', 'Connecting…'],
    ['/kite/add', 'Add Zerodha Account'],
    ['/kite/edit', 'Edit Account'],
    ['/kite', 'Zerodha Accounts'],
    ['/stocks/', 'Stock Detail'],
    ['/watchlist', 'Watchlist'],
    ['/trending', 'Trending'],
    ['/targets', 'Targets'],
    ['/profile', 'Profile & Settings'],
    ['/chat', 'AI Stock Assistant'],
    ['/dashboard', 'Dashboard'],
];

function pageTitleFor(pathname) {
    const match = TITLES.find(([prefix]) => pathname.startsWith(prefix));
    return match?.[1] ?? 'Dashboard';
}

function isMarketOpen(now = new Date()) {
    // NSE regular session: Mon–Fri, 09:15–15:30 IST
    const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const day = ist.getDay();
    if (day === 0 || day === 6) return false;
    const mins = ist.getHours() * 60 + ist.getMinutes();
    return mins >= 9 * 60 + 15 && mins <= 15 * 60 + 30;
}

export default function Layout({ children }) {
    const { user, logout } = useAuth();
    const { pathname } = useLocation();
    const title = pageTitleFor(pathname);
    const [time, setTime] = useState('');
    const [marketOpen, setMarketOpen] = useState(isMarketOpen);

    useEffect(() => {
        const tick = () => {
            setTime(new Date().toLocaleTimeString('en-IN', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                timeZone: 'Asia/Kolkata',
            }));
            setMarketOpen(isMarketOpen());
        };
        tick();
        const timer = setInterval(tick, 1000);
        return () => clearInterval(timer);
    }, []);

    const navClass = ({ isActive }) => `nav-item${isActive ? ' active' : ''}`;

    return (
        <div className="app-shell">
            <aside className="sidebar" id="sidebar">
                <div className="sidebar-logo">
                    <div className="logo-mark">
                        <div className="logo-icon">
                            <i className="fas fa-chart-candlestick" />
                        </div>
                        <span className="logo-text">Kite<em>Pro</em></span>
                    </div>
                </div>

                <nav className="sidebar-nav">
                    <NavLink to="/dashboard" className={navClass}>
                        <span className="nav-icon"><i className="fas fa-gauge-high" /></span>
                        <span className="nav-label">Dashboard</span>
                    </NavLink>
                    <NavLink to="/watchlist" className={navClass}>
                        <span className="nav-icon"><i className="fas fa-heart" /></span>
                        <span className="nav-label">Watchlist</span>
                    </NavLink>
                    <NavLink to="/trending" className={navClass}>
                        <span className="nav-icon"><i className="fas fa-fire" /></span>
                        <span className="nav-label">Trending</span>
                    </NavLink>
                    <NavLink to="/targets" className={navClass}>
                        <span className="nav-icon"><i className="fas fa-bullseye" /></span>
                        <span className="nav-label">Targets</span>
                    </NavLink>
                    <NavLink to="/profile" className={navClass}>
                        <span className="nav-icon"><i className="fas fa-user" /></span>
                        <span className="nav-label">Profile</span>
                    </NavLink>
                    <NavLink to="/kite/connect" className={navClass}>
                        <span className="nav-icon"><i className="fas fa-plug" /></span>
                        <span className="nav-label">Kite Connect</span>
                    </NavLink>
                    <NavLink to="/chat" className={navClass}>
                        <span className="nav-icon"><i className="fas fa-robot" /></span>
                        <span className="nav-label">AI Assistant</span>
                    </NavLink>
                </nav>

                <div className="sidebar-footer">
                    <button
                        type="button"
                        className="nav-item logout-item sidebar-logout"
                        onClick={logout}
                    >
                        <span className="nav-icon"><i className="fas fa-right-from-bracket" /></span>
                        <span className="nav-label">Logout</span>
                    </button>
                </div>
            </aside>

            <main className="main-content">
                <header className="topbar">
                    <div className="topbar-left">
                        <h1 className="page-title">{title}</h1>
                    </div>
                    <div className="topbar-right">
                        <div className="market-status" title="NSE regular market hours (09:15–15:30 IST)">
                            <span className={`status-dot${marketOpen ? '' : ' closed'}`} />
                            <span className="status-text">{marketOpen ? 'Market Open' : 'Market Closed'}</span>
                        </div>
                        <div className="topbar-time" id="topbarTime">{time} IST</div>
                        <NavLink to="/profile" className="topbar-user" title={user?.fullName || 'Profile'}>
                            {user?.avatarUrl ? (
                                <img src={user.avatarUrl} alt="" className="user-avatar" />
                            ) : (
                                <span className="user-avatar">{initials(user?.fullName)}</span>
                            )}
                        </NavLink>
                    </div>
                </header>

                <div className="content-area">{children}</div>
            </main>
        </div>
    );
}

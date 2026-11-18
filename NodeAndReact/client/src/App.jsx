import { useEffect } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import Layout from './components/Layout';
import { PageLoader } from './components/ui';
import Dashboard from './pages/Dashboard';
import Trending from './pages/Trending';
import Watchlist from './pages/Watchlist';
import Targets from './pages/Targets';
import StockDetails from './pages/StockDetails';
import Chat from './pages/Chat';
import Profile from './pages/Profile';
import {
    KiteConnect,
    KiteAccounts,
    KiteAddAccount,
    KiteEditAccount,
    KiteCallback,
} from './pages/Kite';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import GoogleCallback from './pages/GoogleCallback';

function RequireAuth() {
    const { user, ready } = useAuth();
    const location = useLocation();

    if (!ready) return <PageLoader full />;
    if (!user) {
        return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
    }
    return <Outlet />;
}

function ProtectedLayout() {
    return (
        <Layout>
            <Outlet />
        </Layout>
    );
}

function ScrollToTop() {
    const { pathname } = useLocation();
    useEffect(() => {
        document.querySelector('.content-area')?.scrollTo({ top: 0 });
    }, [pathname]);
    return null;
}

export default function App() {
    const { user } = useAuth();

    return (
        <>
            <ScrollToTop />
            <Routes>
                {/* Public authentication pages */}
                <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <Login />} />
                <Route path="/register" element={user ? <Navigate to="/dashboard" replace /> : <Register />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/reset-password/:token" element={<ResetPassword />} />
                <Route path="/google-callback" element={<GoogleCallback />} />

                {/* Everything inside the KitePro shell */}
                <Route element={<RequireAuth />}>
                    <Route element={<ProtectedLayout />}>
                        <Route index element={<Navigate to="/dashboard" replace />} />
                        <Route path="/dashboard" element={<Dashboard />} />
                        <Route path="/trending" element={<Trending />} />
                        <Route path="/watchlist" element={<Watchlist />} />
                        <Route path="/targets" element={<Targets />} />
                        <Route path="/stocks/:symbol" element={<StockDetails />} />
                        <Route path="/kite" element={<KiteAccounts />} />
                        <Route path="/kite/connect" element={<KiteConnect />} />
                        <Route path="/kite/add" element={<KiteAddAccount />} />
                        <Route path="/kite/edit/:id" element={<KiteEditAccount />} />
                        <Route path="/kite/callback" element={<KiteCallback />} />
                        <Route path="/chat" element={<Chat />} />
                        <Route path="/profile" element={<Profile />} />
                    </Route>
                </Route>

                <Route path="*" element={<Navigate to={user ? '/dashboard' : '/login'} replace />} />
            </Routes>
        </>
    );
}

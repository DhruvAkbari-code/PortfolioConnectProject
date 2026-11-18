import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getUser, getToken, clearSession, saveSession, api } from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(getUser);
    const [ready, setReady] = useState(false);

    // Hydrate the session from the API so profile changes are reflected on reload.
    useEffect(() => {
        let live = true;
        (async () => {
            if (!getToken()) {
                if (live) {
                    setUser(null);
                    setReady(true);
                }
                return;
            }
            try {
                const data = await api('/auth/me');
                if (!live) return;
                setUser(data.user);
                saveSession({ user: data.user });
            } catch {
                // A 401 is handled by the API wrapper. Keep the cached user for
                // transient network failures so the shell does not flash.
            } finally {
                if (live) setReady(true);
            }
        })();
        return () => { live = false; };
    }, []);

    const login = useCallback(({ token, user: nextUser }) => {
        saveSession({ token, user: nextUser });
        setUser(nextUser);
    }, []);

    const logout = useCallback(() => {
        clearSession();
        setUser(null);
        window.location.href = '/login';
    }, []);

    return (
        <AuthContext.Provider value={{ user, ready, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);

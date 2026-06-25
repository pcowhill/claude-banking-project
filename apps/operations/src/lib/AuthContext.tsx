import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { SessionUser } from '@simbank/shared';
import { fetchMe, login as apiLogin, logout as apiLogout } from './api';
import { AuthContext, type AuthContextValue } from './auth-context';

/**
 * Provides authentication state to the operations console. On mount it restores
 * any existing session via `GET /api/auth/me`; `login`/`logout` proxy the api
 * client (cookie-based sessions) and keep local state in sync.
 *
 * The `useAuth` hook and `isOperatorRole` helper live in `./auth-context` so this
 * module exports a component only (keeps React Fast Refresh happy).
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore the session on mount: ask the backend who, if anyone, is signed in.
  useEffect(() => {
    let active = true;
    void fetchMe().then((me) => {
      if (active) {
        setUser(me);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const me = await apiLogin(email, password);
    setUser(me);
    return me;
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
    setUser(null);
  }, []);

  const refresh = useCallback(async () => {
    const me = await fetchMe();
    setUser(me);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, login, logout, refresh }),
    [user, loading, login, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

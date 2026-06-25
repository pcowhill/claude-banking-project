import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { SessionUser } from '@simbank/shared';
import * as authApi from './auth';
import type { LoginResult } from './auth';
import { AuthContext, type AuthContextValue } from './auth-context';

/**
 * Provides authentication state to the customer app. On mount it hydrates the
 * session from `GET /api/auth/me` so a logged-in user stays logged in across
 * reloads; `login`/`logout` keep the cached user in sync with the backend.
 *
 * Degrades gracefully: if the backend is offline, hydration resolves to "logged
 * out" rather than throwing, so the public site still renders.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const me = await authApi.fetchMe();
    setUser(me);
  }, []);

  useEffect(() => {
    let active = true;
    void authApi.fetchMe().then((me) => {
      if (!active) return;
      setUser(me);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<LoginResult> => {
    const result = await authApi.login(email, password);
    if (result.ok) setUser(result.user);
    return result;
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout();
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, login, logout, refresh }),
    [user, loading, login, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

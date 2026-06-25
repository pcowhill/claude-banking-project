import { createContext, useContext } from 'react';
import type { SessionUser } from '@simbank/shared';
import type { LoginResult } from './auth';

/**
 * Shape of the authentication context shared across the customer app.
 *
 * Kept in its own (component-free) module so the provider file can export only
 * a component — this keeps react-refresh's `only-export-components` rule happy
 * while still letting screens consume `useAuth()`.
 */
export interface AuthContextValue {
  /** The signed-in user, or null when logged out. */
  user: SessionUser | null;
  /** True until the initial `GET /api/auth/me` hydration completes. */
  loading: boolean;
  /** Attempt a sign-in; on success the context user is populated. */
  login: (email: string, password: string) => Promise<LoginResult>;
  /** Clear the session (server + client). */
  logout: () => Promise<void>;
  /** Re-fetch the current user (e.g. after an action that may change it). */
  refresh: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

/** Access the auth context. Throws if used outside <AuthProvider>. */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an <AuthProvider>.');
  }
  return ctx;
}

import { createContext, useContext } from 'react';
import type { SessionUser, UserRole } from '@simbank/shared';

/**
 * Roles permitted to use the OPERATIONS console. A successful login does not by
 * itself grant access — the backend authenticates any valid user, but this
 * internal bank-staff tool only admits agents and admins. Customers use the
 * separate customer app.
 */
const OPERATOR_ROLES: readonly UserRole[] = ['ops_agent', 'admin'];

/** True when the given user (if any) may operate this console. */
export function isOperatorRole(role: UserRole | undefined): boolean {
  return role !== undefined && OPERATOR_ROLES.includes(role);
}

export interface AuthContextValue {
  /** The signed-in user, or null when logged out. */
  user: SessionUser | null;
  /** True until the initial `GET /api/auth/me` resolves. */
  loading: boolean;
  /**
   * True when the operator was signed out because the backend rejected the
   * session (expired / missing cookie) mid-use, rather than by an explicit
   * logout. The sign-in screen uses it to explain why they're back here (B-04).
   * Cleared on the next successful login.
   */
  sessionEnded: boolean;
  /**
   * Authenticate against the backend. Resolves with the user so the caller can
   * inspect the role (and reject non-operator logins). Throws `ApiError` on
   * failure so the login form can show a specific message.
   */
  login: (email: string, password: string) => Promise<SessionUser>;
  /** End the session on the backend and clear local state. */
  logout: () => Promise<void>;
  /** Re-fetch the current user (e.g. after an external change). */
  refresh: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

/** Access the auth context. Must be used inside an `AuthProvider`. */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}

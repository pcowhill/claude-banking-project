import type {
  AccountSummary,
  AccountTransactionsResponse,
  ApiErrorResponse,
  AuthResponse,
  LoginEventDTO,
  SessionUser,
  TransactionQuery,
} from '@simbank/shared';
import { API_URL } from './api';

/**
 * Auth + account API client for the customer app (v0.2.0, task A-07).
 *
 * The backend uses an httpOnly, same-site session cookie, so every request that
 * participates in a session MUST send `credentials: 'include'`. Helpers return
 * typed results and, for login, surface the backend error `code` so the UI can
 * show a specific message (invalid credentials, locked, disabled, …).
 *
 * SIMULATION NOTE: this protects fake, seeded demo data only — never real
 * accounts, money, or personal data.
 */

/**
 * Always attach the session cookie. Declare a JSON content-type ONLY when we
 * actually send a JSON body: a bodyless POST (e.g. logout) that claims
 * `application/json` makes the backend reject the empty body with 400 — which
 * would silently skip the server-side logout (revoke + clear cookie). Bodyless
 * GETs likewise don't need it (and avoid an unnecessary CORS preflight).
 */
const jsonInit = (init: RequestInit = {}): RequestInit => {
  const headers: Record<string, string> = { ...((init.headers as Record<string, string>) ?? {}) };
  if (init.body != null) headers['Content-Type'] = 'application/json';
  return { credentials: 'include', ...init, headers };
};

/** Discriminated result of a login attempt. */
export type LoginResult =
  | { ok: true; user: SessionUser }
  | { ok: false; code: string; message: string };

/** Safely parse a JSON body, tolerating empty/non-JSON responses. */
async function readJson<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/**
 * POST /api/auth/login. On success returns the session user; on a handled
 * failure returns the backend `code` (invalid_credentials, account_locked,
 * account_disabled, invalid_request) so the form can pick a specific message.
 * Network failures surface as a generic `network_error` code.
 */
export async function login(email: string, password: string): Promise<LoginResult> {
  try {
    const res = await fetch(
      `${API_URL}/api/auth/login`,
      jsonInit({ method: 'POST', body: JSON.stringify({ email, password }) }),
    );

    if (res.ok) {
      const body = await readJson<AuthResponse>(res);
      if (body?.user) return { ok: true, user: body.user };
      return { ok: false, code: 'unknown_error', message: 'Unexpected response from the server.' };
    }

    const err = await readJson<ApiErrorResponse>(res);
    return {
      ok: false,
      code: err?.code ?? 'unknown_error',
      message: err?.error ?? 'Sign-in failed. Please try again.',
    };
  } catch {
    return {
      ok: false,
      code: 'network_error',
      message: 'Cannot reach the banking service. Is the backend running?',
    };
  }
}

/** POST /api/auth/logout. Best-effort: never throws so the UI can always clear local state. */
export async function logout(): Promise<void> {
  try {
    await fetch(`${API_URL}/api/auth/logout`, jsonInit({ method: 'POST' }));
  } catch {
    // Ignore — the caller clears client state regardless.
  }
}

/**
 * GET /api/auth/me. Returns the current user, or null when unauthenticated
 * (401) or the backend is unreachable — callers treat both as "logged out".
 */
export async function fetchMe(): Promise<SessionUser | null> {
  try {
    const res = await fetch(`${API_URL}/api/auth/me`, jsonInit());
    if (!res.ok) return null;
    const body = await readJson<AuthResponse>(res);
    return body?.user ?? null;
  } catch {
    return null;
  }
}

/** GET /api/auth/login-history. Returns null on auth/network failure. */
export async function fetchLoginHistory(): Promise<LoginEventDTO[] | null> {
  try {
    const res = await fetch(`${API_URL}/api/auth/login-history`, jsonInit());
    if (!res.ok) return null;
    const body = await readJson<{ events: LoginEventDTO[] }>(res);
    return body?.events ?? [];
  } catch {
    return null;
  }
}

/** GET /api/accounts. Returns null on auth/network failure so the UI can degrade. */
export async function fetchAccounts(): Promise<AccountSummary[] | null> {
  try {
    const res = await fetch(`${API_URL}/api/accounts`, jsonInit());
    if (!res.ok) return null;
    const body = await readJson<{ accounts: AccountSummary[] }>(res);
    return body?.accounts ?? [];
  } catch {
    return null;
  }
}

/**
 * Result of a transaction fetch. `status` lets the detail page tell apart "not
 * found / no access" (404/403) from "offline" (status 0) so it can show the
 * right message; `data` is present only on success.
 */
export interface TransactionsFetch {
  /** HTTP status, or 0 when the backend was unreachable. */
  status: number;
  data: AccountTransactionsResponse | null;
}

/**
 * GET /api/accounts/:id/transactions (with optional `?q=&group=&origin=`). The
 * response includes the account header and its derived transactions. Never
 * throws — network failures surface as `status: 0` so the UI can degrade.
 */
export async function fetchAccountTransactions(
  accountId: string,
  query: TransactionQuery = {},
): Promise<TransactionsFetch> {
  const params = new URLSearchParams();
  if (query.q) params.set('q', query.q);
  if (query.group) params.set('group', query.group);
  if (query.origin) params.set('origin', query.origin);
  const qs = params.toString();
  const url = `${API_URL}/api/accounts/${encodeURIComponent(accountId)}/transactions${qs ? `?${qs}` : ''}`;
  try {
    const res = await fetch(url, jsonInit());
    if (!res.ok) return { status: res.status, data: null };
    const data = await readJson<AccountTransactionsResponse>(res);
    return { status: res.status, data: data ?? null };
  } catch {
    return { status: 0, data: null };
  }
}

import type { AuthResponse, SessionUser, StatusResponse } from '@simbank/shared';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

/** Fetch backend status; returns null when the API is unreachable. */
export async function fetchStatus(): Promise<StatusResponse | null> {
  try {
    const res = await fetch(`${API_URL}/status`);
    if (!res.ok) return null;
    return (await res.json()) as StatusResponse;
  } catch {
    return null;
  }
}

// ---- Auth (v0.2.0) ----------------------------------------------------------
//
// Every call below talks to the SIMULATED backend over cookie-based sessions, so
// they all pass `credentials: 'include'`. The cookie is httpOnly; the browser
// never reads it directly. These helpers protect fake, seeded demo data only.

/**
 * Counts shown on the operations dashboard. Mirrors the backend
 * `GET /api/ops/summary` payload (ops_agent / admin only).
 */
export interface OpsSummary {
  users: number;
  accounts: number;
  pendingRequests: number;
  lockedAccounts: number;
}

/**
 * Error thrown by auth calls when the backend responds with a 4xx/5xx. Carries
 * the machine-readable `code` (e.g. `invalid_credentials`, `account_locked`)
 * so the UI can show a specific message instead of a generic failure.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

/** Parse a JSON body, tolerating empty/non-JSON responses. */
async function readJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * Optional listener invoked when an authenticated call is rejected because the
 * session is missing or expired (HTTP 401 with `unauthenticated` / `session_expired`).
 * The auth provider registers one so the console can drop back to the sign-in
 * screen instead of leaving a logged-out operator staring at a dead
 * "Not authenticated" error (B-04). A failed LOGIN (`invalid_credentials`) is a
 * 401 too, but it carries a different code and must NOT trigger this.
 */
let onSessionInvalid: (() => void) | null = null;

export function setSessionInvalidHandler(handler: (() => void) | null): void {
  onSessionInvalid = handler;
}

/** Codes that mean "your session is gone" (as opposed to e.g. bad credentials). */
const SESSION_INVALID_CODES = new Set(['unauthenticated', 'session_expired']);

/** Turn a non-OK response into an {@link ApiError} with the backend's code. */
async function toApiError(res: Response): Promise<ApiError> {
  const body = await readJson(res);
  const code = typeof body.code === 'string' ? body.code : 'unknown_error';
  const message = typeof body.error === 'string' ? body.error : `Request failed (${res.status}).`;
  if (res.status === 401 && SESSION_INVALID_CODES.has(code)) {
    onSessionInvalid?.();
  }
  return new ApiError(res.status, code, message);
}

/**
 * Shared JSON request helper for cookie-authenticated API calls. Sends + parses
 * JSON, always includes the session cookie, and throws {@link ApiError} (with the
 * backend's machine code) on any non-2xx. Used by the operations data client.
 */
export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: 'include',
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw await toApiError(res);
  return (await res.json()) as T;
}

/**
 * POST /api/auth/login. On success the backend sets the session cookie and
 * returns the signed-in user. Throws {@link ApiError} for invalid input, bad
 * credentials, and locked/disabled accounts.
 *
 * NOTE: a 200 here only means the credentials are valid — it does NOT mean the
 * user is allowed in this console. Role enforcement (ops_agent / admin) is done
 * by the operations app after login.
 */
export async function login(email: string, password: string): Promise<SessionUser> {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw await toApiError(res);
  const data = (await res.json()) as AuthResponse;
  return data.user;
}

/** POST /api/auth/logout. Clears the server session + cookie. Best-effort. */
export async function logout(): Promise<void> {
  await fetch(`${API_URL}/api/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  });
}

/**
 * GET /api/auth/me. Returns the current user, or null when there is no valid
 * session (401) or the API is unreachable.
 */
export async function fetchMe(): Promise<SessionUser | null> {
  try {
    const res = await fetch(`${API_URL}/api/auth/me`, { credentials: 'include' });
    if (!res.ok) return null;
    const data = (await res.json()) as AuthResponse;
    return data.user;
  } catch {
    return null;
  }
}

/**
 * GET /api/ops/summary. Operations-only counts for the dashboard overview.
 * Throws {@link ApiError} on 403 (forbidden) so the caller can react.
 */
export async function fetchOpsSummary(): Promise<OpsSummary> {
  const res = await fetch(`${API_URL}/api/ops/summary`, { credentials: 'include' });
  if (!res.ok) throw await toApiError(res);
  return (await res.json()) as OpsSummary;
}

export { API_URL };

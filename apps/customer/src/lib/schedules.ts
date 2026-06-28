import type {
  AccountStatementsResponse,
  CancelScheduleResponse,
  ClockResponse,
  CreateScheduleRequest,
  CreateScheduleResponse,
  ScheduleListResponse,
} from '@simbank/shared';
import { API_URL } from './api';

/**
 * Scheduled-payments + simulation-clock + statements API client for the customer
 * app (v0.9.0).
 *
 * Mirrors `lib/money.ts` exactly: every call participates in a session, so each
 * request sends `credentials: 'include'` to attach the httpOnly customer cookie,
 * and the customer app does NOT send the `x-meridian-surface` header (the backend
 * defaults to the customer cookie — keep it that way). Helpers return
 * discriminated, typed results and NEVER throw — a network failure surfaces as
 * `{ ok: false, code: 'network_error' }` so the Scheduled payments / Statements
 * screens degrade gracefully and stay usable offline.
 *
 * The create endpoint shares the money-movement error envelope:
 *   400 { error, code: 'invalid_request', fields: { <field>: <message> } }
 *   403 { code: 'forbidden' }     (an account that isn't yours)
 *   409 { code: 'conflict' }      (cancel of an already-inactive schedule)
 *   401 (unauthenticated)
 * `fields` is passed straight through so the form can light up the offending
 * inputs server-side, complementing the shared `validateCreateSchedule` validator.
 *
 * SIMULATION NOTE: nothing here touches real money, billers, or payment networks.
 * A scheduled payment only fires when an operator advances the simulation clock.
 */

/** Attach the session cookie; declare JSON only when there is a body. */
const jsonInit = (init: RequestInit = {}): RequestInit => {
  const headers: Record<string, string> = { ...((init.headers as Record<string, string>) ?? {}) };
  if (init.body != null) headers['Content-Type'] = 'application/json';
  return { credentials: 'include', ...init, headers };
};

/** Safely parse a JSON body, tolerating empty/non-JSON responses. */
async function readJson<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Discriminated result of a schedules request (same shape as `MoneyResult`). */
export type ScheduleResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string; fields?: Record<string, string> };

/** The error shape the schedules endpoints return on a handled failure. */
interface ScheduleErrorBody {
  error?: string;
  code?: string;
  fields?: Record<string, string>;
}

/** A friendly default message per known error code (overridden by a server `error`). */
function messageForCode(code: string | undefined, fallback: string): string {
  switch (code) {
    case 'insufficient_funds':
      return 'Not enough available funds in that account for this amount.';
    case 'invalid_request':
      return 'Please fix the highlighted fields and try again.';
    case 'forbidden':
      return 'You do not have access to one of these accounts.';
    case 'not_found':
      return 'That schedule could not be found.';
    case 'conflict':
      return 'That schedule is no longer active, so it cannot be cancelled.';
    case 'unauthenticated':
    case 'session_expired':
      return 'Your session has ended. Please sign in again.';
    default:
      return fallback;
  }
}

/**
 * Shared request helper. Returns the success body typed as `T`, or a
 * discriminated error carrying the backend `code` (so the UI can special-case
 * `conflict`/`forbidden`) and any per-field `fields` map. Never throws — a
 * network failure surfaces as `code: 'network_error'`.
 */
async function requestSchedule<T>(
  url: string,
  init: RequestInit,
  fallback: string,
): Promise<ScheduleResult<T>> {
  try {
    const res = await fetch(url, init);
    if (res.ok) {
      const data = await readJson<T>(res);
      if (data) return { ok: true, data };
      return { ok: false, code: 'unknown_error', message: 'Unexpected response from the server.' };
    }
    const err = await readJson<ScheduleErrorBody>(res);
    const code = err?.code ?? 'unknown_error';
    return {
      ok: false,
      code,
      message: err?.error ?? messageForCode(code, fallback),
      fields: err?.fields,
    };
  } catch {
    return {
      ok: false,
      code: 'network_error',
      message: 'Cannot reach the banking service. Is the backend running?',
    };
  }
}

/**
 * POST /api/schedules — create a recurring / scheduled payment. On success the
 * response carries the created `ScheduleDTO` and a confirmation `message`. The
 * payment moves NO money now; it only fires when an operator advances the clock.
 */
export function createSchedule(
  input: CreateScheduleRequest,
): Promise<ScheduleResult<CreateScheduleResponse>> {
  return requestSchedule<CreateScheduleResponse>(
    `${API_URL}/api/schedules`,
    jsonInit({ method: 'POST', body: JSON.stringify(input) }),
    'That schedule could not be created. Please try again.',
  );
}

/** GET /api/schedules — the caller's own scheduled payments. */
export function fetchSchedules(): Promise<ScheduleResult<ScheduleListResponse>> {
  return requestSchedule<ScheduleListResponse>(
    `${API_URL}/api/schedules`,
    jsonInit(),
    'We could not load your scheduled payments.',
  );
}

/**
 * POST /api/schedules/:id/cancel — cancel an active schedule. Returns the updated
 * `ScheduleDTO` (now `cancelled`); 403 (not yours) / 404 / 409 (already inactive)
 * surface as discriminated errors.
 */
export function cancelSchedule(id: string): Promise<ScheduleResult<CancelScheduleResponse>> {
  return requestSchedule<CancelScheduleResponse>(
    `${API_URL}/api/schedules/${encodeURIComponent(id)}/cancel`,
    jsonInit({ method: 'POST' }),
    'That schedule could not be cancelled. Please try again.',
  );
}

/**
 * GET /api/clock — the current simulation clock (any authenticated user;
 * display only). Lets the page show the simulated "now" that decides when
 * schedules fire.
 */
export function fetchClock(): Promise<ScheduleResult<ClockResponse>> {
  return requestSchedule<ClockResponse>(
    `${API_URL}/api/clock`,
    jsonInit(),
    'We could not read the simulation clock.',
  );
}

/**
 * GET /api/accounts/:id/statements — the monthly statement periods for one of
 * the caller's accounts (same access rules as `/api/accounts/:id`). 403 / 404
 * surface as discriminated errors so the page can tell "no access" from offline.
 */
export function fetchAccountStatements(
  accountId: string,
): Promise<ScheduleResult<AccountStatementsResponse>> {
  return requestSchedule<AccountStatementsResponse>(
    `${API_URL}/api/accounts/${encodeURIComponent(accountId)}/statements`,
    jsonInit(),
    'We could not load statements for that account.',
  );
}

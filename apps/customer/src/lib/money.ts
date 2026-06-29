import type {
  ExternalMovementRequest,
  ExternalMovementResponse,
  TransferRequest,
  TransferResponse,
} from '@simbank/shared';
import { API_URL } from './api';
import { csrfHeaders } from './csrf';

/**
 * Money-movement API client for the customer app (v0.7.0, task M-05).
 *
 * Mirrors `lib/auth.ts` / `lib/invitations.ts`: every call participates in a
 * session, so each request sends `credentials: 'include'` to attach the
 * httpOnly customer cookie, and the customer app does NOT send the
 * `x-meridian-surface` header (the backend defaults to the customer cookie —
 * keep it that way). Helpers return discriminated, typed results and NEVER throw
 * — a network failure surfaces as `{ ok: false, code: 'network_error' }` so the
 * Move money screen can degrade gracefully and the form stays usable offline.
 *
 * Both endpoints share the same error envelope:
 *   400 { code: 'invalid_request', fields: { <field>: <message> } }  (per-field)
 *   400 { code: 'insufficient_funds' }
 *   403 { code: 'forbidden' }
 *   401 (unauthenticated)
 * `fields` is passed straight through so the form can light up the offending
 * inputs server-side, complementing the shared pre-submit validators.
 *
 * SIMULATION NOTE: nothing here touches real money, accounts, or payment
 * networks. An internal transfer posts immediately; every external movement is
 * only QUEUED — an operator must approve it before it posts.
 */

/**
 * Attach the session cookie + the CSRF double-submit header (SEC-1); declare JSON
 * only when there is a body. `csrfHeaders()` is empty when there is no token, and
 * is ignored by the server on safe GETs, so spreading it here covers every
 * mutating call without missing one.
 */
const jsonInit = (init: RequestInit = {}): RequestInit => {
  const headers: Record<string, string> = {
    ...csrfHeaders(),
    ...((init.headers as Record<string, string>) ?? {}),
  };
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

/** Discriminated result of a money-movement request. */
export type MoneyResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string; fields?: Record<string, string> };

/** The error shape both endpoints return on a handled failure. */
interface MoneyErrorBody {
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
    case 'unauthenticated':
    case 'session_expired':
      return 'Your session has ended. Please sign in again.';
    default:
      return fallback;
  }
}

/**
 * Shared POST helper. Returns the success body typed as `T`, or a discriminated
 * error carrying the backend `code` (so the UI can special-case
 * `insufficient_funds`) and any per-field `fields` map. Never throws.
 */
async function postMoney<T>(url: string, body: unknown, fallback: string): Promise<MoneyResult<T>> {
  try {
    const res = await fetch(url, jsonInit({ method: 'POST', body: JSON.stringify(body) }));
    if (res.ok) {
      const data = await readJson<T>(res);
      if (data) return { ok: true, data };
      return { ok: false, code: 'unknown_error', message: 'Unexpected response from the server.' };
    }
    const err = await readJson<MoneyErrorBody>(res);
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
 * POST /api/transfers — an IMMEDIATE internal transfer between the user's own
 * accounts. On success the response carries the two affected accounts with
 * freshly DERIVED balances so the UI can confirm the move without a re-fetch.
 */
export function createTransfer(input: TransferRequest): Promise<MoneyResult<TransferResponse>> {
  return postMoney<TransferResponse>(
    `${API_URL}/api/transfers`,
    input,
    'That transfer could not be completed. Please try again.',
  );
}

/**
 * POST /api/movements — a REVIEWABLE external movement (deposit / ACH / wire /
 * bill pay). It only QUEUES the movement for operator review; nothing posts
 * until an operator approves it. On success the response carries a reference and
 * `status: 'pending_review'`.
 */
export function createMovement(
  input: ExternalMovementRequest,
): Promise<MoneyResult<ExternalMovementResponse>> {
  return postMoney<ExternalMovementResponse>(
    `${API_URL}/api/movements`,
    input,
    'That request could not be submitted. Please try again.',
  );
}

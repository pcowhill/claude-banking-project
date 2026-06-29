import type {
  LendingListResponse,
  LendingProductResponse,
  LoanPaymentRequest,
  OpenCdRequest,
  OpenLoanRequest,
  WithdrawCdRequest,
} from '@simbank/shared';
import { API_URL } from './api';
import { csrfHeaders } from './csrf';

/**
 * Lending API client for the customer app (v1.0.0, task L-06) — CDs and loans.
 *
 * Mirrors `lib/money.ts` / `lib/schedules.ts` exactly: every call participates in
 * a session, so each request sends `credentials: 'include'` to attach the
 * httpOnly customer cookie, and the customer app does NOT send the
 * `x-meridian-surface` header (the backend defaults to the customer cookie —
 * keep it that way). Helpers return discriminated, typed results and NEVER throw
 * — a network failure surfaces as `{ ok: false, code: 'network_error' }` so the
 * lending screen degrades gracefully and the forms stay usable offline.
 *
 * The mutating endpoints share the money-movement error envelope:
 *   400 { error, code: 'invalid_request', fields: { <field>: <message> } }
 *   400 { code: 'insufficient_funds' | 'invalid_state' | 'not_matured' | 'inactive_account' }
 *   403 { code: 'forbidden' }     (an account that isn't yours)
 *   404 { code: 'not_found' }     (an unknown product)
 *   401 (unauthenticated)
 * `fields` is passed straight through so the form can light up the offending
 * inputs server-side, complementing the shared `validateOpenCd` / `validateOpenLoan`
 * / `validateLoanPayment` / `validateWithdrawCd` validators.
 *
 * SIMULATION NOTE: nothing here touches a real lender, deposit product, credit
 * decision, or money network. Opening a CD/loan, paying it down, or withdrawing a
 * matured CD only moves SIMULATED money by appending ledger entries on the server.
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

/** Discriminated result of a lending request (same shape as `MoneyResult`). */
export type LendingResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string; fields?: Record<string, string> };

/** The error shape the lending endpoints return on a handled failure. */
interface LendingErrorBody {
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
    case 'invalid_state':
      return 'That product can no longer accept this action.';
    case 'not_matured':
      return 'This CD has not matured yet, so it cannot be withdrawn.';
    case 'inactive_account':
      return 'That account is not active, so it cannot be used here.';
    case 'forbidden':
      return 'You do not have access to one of these accounts.';
    case 'not_found':
      return 'That product could not be found.';
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
 * `insufficient_funds` / `not_matured`) and any per-field `fields` map. Never
 * throws — a network failure surfaces as `code: 'network_error'`.
 */
async function requestLending<T>(
  url: string,
  init: RequestInit,
  fallback: string,
): Promise<LendingResult<T>> {
  try {
    const res = await fetch(url, init);
    if (res.ok) {
      const data = await readJson<T>(res);
      if (data) return { ok: true, data };
      return { ok: false, code: 'unknown_error', message: 'Unexpected response from the server.' };
    }
    const err = await readJson<LendingErrorBody>(res);
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

/** GET /api/lending — the caller's own CDs and loans, with derived figures. */
export function listLending(): Promise<LendingResult<LendingListResponse>> {
  return requestLending<LendingListResponse>(
    `${API_URL}/api/lending`,
    jsonInit(),
    'We could not load your loans and CDs.',
  );
}

/**
 * POST /api/lending/cds — open a certificate of deposit. The principal moves from
 * the funding account into the new CD account (a pair of transfer legs that nets
 * to zero); the CD then accrues simulated interest on each clock advance. On
 * success the response carries the created `LendingProductDTO` and a message.
 */
export function openCd(input: OpenCdRequest): Promise<LendingResult<LendingProductResponse>> {
  return requestLending<LendingProductResponse>(
    `${API_URL}/api/lending/cds`,
    jsonInit({ method: 'POST', body: JSON.stringify(input) }),
    'That CD could not be opened. Please try again.',
  );
}

/**
 * POST /api/lending/loans — open a loan. The cash is disbursed to the chosen
 * account and the loan account carries the negative balance owed (a pair of
 * transfer legs that nets to zero). On success the response carries the created
 * `LendingProductDTO` (including its monthly payment) and a message.
 */
export function openLoan(input: OpenLoanRequest): Promise<LendingResult<LendingProductResponse>> {
  return requestLending<LendingProductResponse>(
    `${API_URL}/api/lending/loans`,
    jsonInit({ method: 'POST', body: JSON.stringify(input) }),
    'That loan could not be opened. Please try again.',
  );
}

/**
 * POST /api/lending/loans/:id/pay — make a payment on an active loan. Omit
 * `amountMinor` to pay the scheduled monthly payment, or send a custom amount.
 * The payment moves money from the chosen account to the loan account (a pair of
 * transfer legs that nets to zero), reducing what is owed. On success the
 * response carries the updated `LendingProductDTO` and a message.
 */
export function payLoan(
  id: string,
  input: LoanPaymentRequest,
): Promise<LendingResult<LendingProductResponse>> {
  return requestLending<LendingProductResponse>(
    `${API_URL}/api/lending/loans/${encodeURIComponent(id)}/pay`,
    jsonInit({ method: 'POST', body: JSON.stringify(input) }),
    'That payment could not be completed. Please try again.',
  );
}

/**
 * POST /api/lending/cds/:id/withdraw — withdraw a MATURED CD to a chosen account.
 * Only allowed once the CD's status is `matured`; the balance moves back as a
 * pair of transfer legs that nets to zero. On success the response carries the
 * updated `LendingProductDTO` (now closed) and a message.
 */
export function withdrawCd(
  id: string,
  input: WithdrawCdRequest,
): Promise<LendingResult<LendingProductResponse>> {
  return requestLending<LendingProductResponse>(
    `${API_URL}/api/lending/cds/${encodeURIComponent(id)}/withdraw`,
    jsonInit({ method: 'POST', body: JSON.stringify(input) }),
    'That CD could not be withdrawn. Please try again.',
  );
}

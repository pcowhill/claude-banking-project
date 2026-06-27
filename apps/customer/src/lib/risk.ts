import type {
  DisputeRequest,
  DisputeResponse,
  FraudAlertListResponse,
  FraudResponse,
} from '@simbank/shared';
import { API_URL } from './api';

/**
 * Fraud + dispute API client for the customer app (v0.8.0).
 *
 * Mirrors `lib/money.ts` / `lib/cards.ts`: every call participates in a session
 * (`credentials: 'include'`), no `x-meridian-surface` header, and helpers return
 * discriminated, typed results that NEVER throw — a network failure surfaces as
 * `{ ok: false, code: 'network_error' }` so the Dashboard and dispute form
 * degrade gracefully when the backend is offline.
 *
 * MONEY DISCIPLINE: nothing here edits a balance. Filing a dispute flags the
 * ledger entry `disputed`; responding to a fraud alert only records the
 * customer's confirm/deny and queues operator follow-up. SIMULATION: no real
 * fraud network or card processor is ever contacted.
 */

const jsonInit = (init: RequestInit = {}): RequestInit => {
  const headers: Record<string, string> = { ...((init.headers as Record<string, string>) ?? {}) };
  if (init.body != null) headers['Content-Type'] = 'application/json';
  return { credentials: 'include', ...init, headers };
};

async function readJson<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Discriminated result of a fraud/dispute request. */
export type RiskResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string; fields?: Record<string, string> };

interface RiskErrorBody {
  error?: string;
  code?: string;
  fields?: Record<string, string>;
}

function messageForCode(code: string | undefined, fallback: string): string {
  switch (code) {
    case 'invalid_request':
    case 'bad_request':
      return 'Please fix the highlighted fields and try again.';
    case 'forbidden':
      return 'You do not have access to this item.';
    case 'not_found':
      return 'That item could not be found.';
    case 'unauthenticated':
    case 'session_expired':
      return 'Your session has ended. Please sign in again.';
    default:
      return fallback;
  }
}

async function request<T>(
  url: string,
  init: RequestInit,
  fallback: string,
): Promise<RiskResult<T>> {
  try {
    const res = await fetch(url, jsonInit(init));
    if (res.ok) {
      const data = await readJson<T>(res);
      if (data) return { ok: true, data };
      return { ok: false, code: 'unknown_error', message: 'Unexpected response from the server.' };
    }
    const err = await readJson<RiskErrorBody>(res);
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

/** What the customer app needs back from a fraud-alert response. */
export interface FraudRespondResult {
  /** The response the customer recorded, echoed for the UI confirmation. */
  response: FraudResponse;
}

/** POST /api/disputes — flag a posted transaction as disputed (queued for operator review). */
export function fileDispute(input: DisputeRequest): Promise<RiskResult<DisputeResponse>> {
  return request<DisputeResponse>(
    `${API_URL}/api/disputes`,
    { method: 'POST', body: JSON.stringify(input) },
    'That dispute could not be filed. Please try again.',
  );
}

/** GET /api/fraud-alerts — the signed-in customer's pending fraud alerts. */
export function listFraudAlerts(): Promise<RiskResult<FraudAlertListResponse>> {
  return request<FraudAlertListResponse>(
    `${API_URL}/api/fraud-alerts`,
    { method: 'GET' },
    'Fraud alerts could not be loaded.',
  );
}

/**
 * POST /api/fraud-alerts/:id/respond — confirm a charge was legit, or report it
 * as fraud. The backend returns the updated operations request; the UI only
 * needs the response the customer recorded, so we echo it back on success.
 */
export async function respondToFraudAlert(
  alertId: string,
  response: FraudResponse,
): Promise<RiskResult<FraudRespondResult>> {
  const result = await request<unknown>(
    `${API_URL}/api/fraud-alerts/${encodeURIComponent(alertId)}/respond`,
    { method: 'POST', body: JSON.stringify({ response }) },
    'That response could not be recorded. Please try again.',
  );
  if (!result.ok) return result;
  return { ok: true, data: { response } };
}

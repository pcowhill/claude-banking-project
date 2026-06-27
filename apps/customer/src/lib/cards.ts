import type {
  CardDTO,
  CardListResponse,
  CardResponse,
  IssueCardRequest,
  ReplaceCardResponse,
  ReportCardRequest,
  TravelNoticeRequest,
  TravelNoticeResponse,
} from '@simbank/shared';
import { API_URL } from './api';

/**
 * Card lifecycle API client for the customer app (v0.8.0).
 *
 * Mirrors `lib/money.ts`: every call participates in a session, so each request
 * sends `credentials: 'include'` to attach the httpOnly customer cookie, and the
 * customer app does NOT send the `x-meridian-surface` header (the backend
 * defaults to the customer cookie). Helpers return discriminated, typed results
 * and NEVER throw — a network failure surfaces as `{ ok: false, code:
 * 'network_error' }` so the Cards screen degrades gracefully when offline.
 *
 * All endpoints share the existing error envelope:
 *   400 { error, code, fields? }   404 { error, code }   403 { error, code }
 * `fields` is passed straight through so forms can light up offending inputs.
 *
 * SIMULATION NOTE: a "card" is fake plastic (a masked last-four, a simulated
 * network and expiry). The lifecycle here MOVES NO MONEY — it is workflow +
 * audit only; no real card network, PAN, or issuer is ever involved.
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

/** Discriminated result of a card request. */
export type CardResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string; fields?: Record<string, string> };

/** The error shape the card endpoints return on a handled failure. */
interface CardErrorBody {
  error?: string;
  code?: string;
  fields?: Record<string, string>;
}

/** A friendly default message per known error code (overridden by a server `error`). */
function messageForCode(code: string | undefined, fallback: string): string {
  switch (code) {
    case 'invalid_request':
    case 'bad_request':
      return 'Please fix the highlighted fields and try again.';
    case 'forbidden':
      return 'You do not have access to this card.';
    case 'not_found':
      return 'That card could not be found.';
    case 'unauthenticated':
    case 'session_expired':
      return 'Your session has ended. Please sign in again.';
    default:
      return fallback;
  }
}

/** Shared request helper. Returns the success body typed as `T`, or a discriminated error. Never throws. */
async function request<T>(
  url: string,
  init: RequestInit,
  fallback: string,
): Promise<CardResult<T>> {
  try {
    const res = await fetch(url, jsonInit(init));
    if (res.ok) {
      const data = await readJson<T>(res);
      if (data) return { ok: true, data };
      return { ok: false, code: 'unknown_error', message: 'Unexpected response from the server.' };
    }
    const err = await readJson<CardErrorBody>(res);
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

function get<T>(url: string, fallback: string): Promise<CardResult<T>> {
  return request<T>(url, { method: 'GET' }, fallback);
}

function post<T>(url: string, body: unknown, fallback: string): Promise<CardResult<T>> {
  return request<T>(
    url,
    { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) },
    fallback,
  );
}

/** GET /api/cards — every card the signed-in user can see (with travel notices). */
export function listCards(): Promise<CardResult<CardListResponse>> {
  return get<CardListResponse>(`${API_URL}/api/cards`, 'Your cards could not be loaded.');
}

/** POST /api/accounts/:id/cards — issue a new simulated card on an account. */
export function issueCard(
  accountId: string,
  input: IssueCardRequest,
): Promise<CardResult<CardResponse>> {
  return post<CardResponse>(
    `${API_URL}/api/accounts/${encodeURIComponent(accountId)}/cards`,
    input,
    'That card could not be issued. Please try again.',
  );
}

/** POST /api/cards/:id/freeze — temporarily lock an active card. */
export function freezeCard(cardId: string): Promise<CardResult<CardResponse>> {
  return post<CardResponse>(
    `${API_URL}/api/cards/${encodeURIComponent(cardId)}/freeze`,
    undefined,
    'That card could not be frozen. Please try again.',
  );
}

/** POST /api/cards/:id/unfreeze — re-activate a frozen card. */
export function unfreezeCard(cardId: string): Promise<CardResult<CardResponse>> {
  return post<CardResponse>(
    `${API_URL}/api/cards/${encodeURIComponent(cardId)}/unfreeze`,
    undefined,
    'That card could not be unfrozen. Please try again.',
  );
}

/**
 * POST /api/cards/:id/report — report a card lost/stolen. The card becomes
 * terminal and a replacement is issued; the response carries both (`card` = the
 * replacement, `replaced` = the old now-terminal card).
 */
export function reportCard(
  cardId: string,
  input: ReportCardRequest,
): Promise<CardResult<ReplaceCardResponse>> {
  return post<ReplaceCardResponse>(
    `${API_URL}/api/cards/${encodeURIComponent(cardId)}/report`,
    input,
    'That card could not be reported. Please try again.',
  );
}

/** POST /api/cards/:id/travel-notices — add a travel notice to an in-service card. */
export function addTravelNotice(
  cardId: string,
  input: TravelNoticeRequest,
): Promise<CardResult<TravelNoticeResponse>> {
  return post<TravelNoticeResponse>(
    `${API_URL}/api/cards/${encodeURIComponent(cardId)}/travel-notices`,
    input,
    'That travel notice could not be added. Please try again.',
  );
}

/** POST /api/cards/:id/travel-notices/:noticeId/cancel — cancel an active travel notice. */
export function cancelTravelNotice(
  cardId: string,
  noticeId: string,
): Promise<CardResult<TravelNoticeResponse>> {
  return post<TravelNoticeResponse>(
    `${API_URL}/api/cards/${encodeURIComponent(cardId)}/travel-notices/${encodeURIComponent(
      noticeId,
    )}/cancel`,
    undefined,
    'That travel notice could not be cancelled. Please try again.',
  );
}

export type { CardDTO };

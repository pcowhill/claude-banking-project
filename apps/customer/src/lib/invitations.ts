import type { AccountInvitationDTO } from '@simbank/shared';
import { API_URL } from './api';
import { csrfHeaders } from './csrf';

/**
 * Joint-invitation API client for the customer app (v0.6.0, task N-10).
 *
 * Every call here participates in a session, so — like `lib/auth.ts` — each
 * request MUST send `credentials: 'include'` to attach the httpOnly cookie.
 * Helpers return typed, discriminated results and NEVER throw on network
 * failure so the inbox and the owner invite form can degrade gracefully.
 *
 * SIMULATION NOTE: invitations are simulated. Accepting one shares a fake,
 * seeded account; nothing here touches real people, money, or messaging.
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

/** Discriminated result of a single-invitation action (create/accept/decline). */
export type InvitationResult =
  | { ok: true; invitation: AccountInvitationDTO }
  | { ok: false; code: string; message: string };

/**
 * GET /api/invitations. The signed-in user's PENDING invitations. Returns null
 * on auth/network failure so the inbox can simply hide itself (degrade) rather
 * than show a broken section.
 */
export async function fetchInvitations(): Promise<AccountInvitationDTO[] | null> {
  try {
    const res = await fetch(`${API_URL}/api/invitations`, jsonInit());
    if (!res.ok) return null;
    const body = await readJson<{ invitations: AccountInvitationDTO[] }>(res);
    return body?.invitations ?? [];
  } catch {
    return null;
  }
}

/** Internal helper: POST that expects an `{ invitation }` body or a typed error. */
async function postInvitation(url: string, body?: unknown): Promise<InvitationResult> {
  try {
    const init =
      body === undefined
        ? jsonInit({ method: 'POST' })
        : jsonInit({ method: 'POST', body: JSON.stringify(body) });
    const res = await fetch(url, init);
    if (res.ok) {
      const data = await readJson<{ invitation: AccountInvitationDTO }>(res);
      if (data?.invitation) return { ok: true, invitation: data.invitation };
      return { ok: false, code: 'unknown_error', message: 'Unexpected response from the server.' };
    }
    const err = await readJson<{ error?: string; code?: string }>(res);
    return {
      ok: false,
      code: err?.code ?? 'unknown_error',
      message: err?.error ?? 'That action could not be completed. Please try again.',
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
 * POST /api/accounts/:id/invitations (OWNER only). Invites someone as a joint
 * owner of the account. A 403 (not the owner) surfaces as a typed error.
 */
export async function createInvitation(
  accountId: string,
  inviteeEmail: string,
): Promise<InvitationResult> {
  return postInvitation(`${API_URL}/api/accounts/${encodeURIComponent(accountId)}/invitations`, {
    inviteeEmail,
  });
}

/** POST /api/invitations/:id/accept. The viewer accepts a pending invitation. */
export async function acceptInvitation(id: string): Promise<InvitationResult> {
  return postInvitation(`${API_URL}/api/invitations/${encodeURIComponent(id)}/accept`);
}

/** POST /api/invitations/:id/decline. The viewer declines a pending invitation. */
export async function declineInvitation(id: string): Promise<InvitationResult> {
  return postInvitation(`${API_URL}/api/invitations/${encodeURIComponent(id)}/decline`);
}

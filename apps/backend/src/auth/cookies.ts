import type { CookieSerializeOptions } from '@fastify/cookie';
import { AUTH } from '@simbank/shared';

/**
 * Session cookie options, shared by the routes that set and clear it.
 *
 * - httpOnly: JS in the page cannot read the token (XSS can't exfiltrate it).
 * - sameSite 'lax': the customer/ops apps and the API are same-site (all
 *   localhost), so the cookie is sent on their requests while cross-site POSTs
 *   are blocked — a basic CSRF mitigation for this local simulation.
 * - secure: off for local http; a real deployment (out of scope for this
 *   simulation) would serve HTTPS and set this true.
 */
export const SESSION_COOKIE = AUTH.sessionCookieName;

export function sessionCookieOptions(): CookieSerializeOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    path: '/',
    maxAge: AUTH.sessionTtlMinutes * 60,
  };
}

export function clearedCookieOptions(): CookieSerializeOptions {
  return { httpOnly: true, sameSite: 'lax', secure: false, path: '/' };
}

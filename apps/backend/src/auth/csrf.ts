import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { CookieSerializeOptions } from '@fastify/cookie';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AUTH, type ApiErrorResponse } from '@simbank/shared';

/**
 * CSRF protection (v1.0.0 / SEC-1) — a double-submit token.
 *
 * Through v0.9.0 CSRF was only MITIGATED by `SameSite=Lax` session cookies + the
 * credentialed CORS allowlist. v1.0.0 adds a real control as a single global hook:
 *
 *  - On a SAFE request (GET/HEAD/OPTIONS) with no token cookie yet, set a fresh
 *    NON-httpOnly `mer_csrf` cookie. Each SPA reads it (`document.cookie`) on load
 *    — its auth bootstrap (`GET /api/auth/me`) always issues one before any POST.
 *  - On an UNSAFE request (POST/PUT/PATCH/DELETE) the `x-meridian-csrf` header MUST
 *    equal the `mer_csrf` cookie, else 403. A cross-site attacker can neither read
 *    our host-only cookie nor set a custom header without a CORS preflight the
 *    allowlist blocks — so forged cross-site state changes are rejected.
 *
 * A tiny allowlist exempts requests where the control does not apply: login (runs
 * pre-session and issues the first token on its response), logout (bodyless,
 * harmless), and the PUBLIC onboarding submit (unauthenticated; nothing to forge
 * on a victim's behalf). Everything else that mutates state is protected.
 *
 * The token only authorizes; it never authenticates — RBAC + the session guards
 * are unchanged, so this can only ADD a gate, never grant access.
 */

/** Mutating requests to these exact paths skip the CSRF check (see above). */
const EXEMPT_PATHS = new Set<string>([
  '/api/auth/login',
  '/api/auth/logout',
  '/api/onboarding/applications',
]);

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** The per-surface session cookie names (a request is "authenticated-shaped" if it carries one). */
const SESSION_COOKIE_NAMES = Object.values(AUTH.sessionCookieNames);

/** A fresh random CSRF token (hex), same strength as a session token. */
export function generateCsrfToken(): string {
  return randomBytes(32).toString('hex');
}

/** Cookie options for the CSRF token — readable by page JS (NOT httpOnly). */
export function csrfCookieOptions(): CookieSerializeOptions {
  return {
    httpOnly: false, // page JS must read it to echo it back in the header
    sameSite: 'lax',
    secure: false, // local http simulation; a real HTTPS deploy would set true
    path: '/',
    maxAge: AUTH.sessionTtlMinutes * 60,
  };
}

/** The request's raw path without its query string. */
function pathOf(req: FastifyRequest): string {
  const url = req.url;
  const q = url.indexOf('?');
  return q === -1 ? url : url.slice(0, q);
}

function headerToken(req: FastifyRequest): string | undefined {
  const raw = req.headers[AUTH.csrfHeader];
  return Array.isArray(raw) ? raw[0] : raw;
}

/** Constant-time string equality (length-checked first; lengths aren't secret). */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/**
 * Global `onRequest` hook implementing the double-submit check above. Registered
 * once in `buildServer`. Returns a 403 (and ends the request) on a missing or
 * mismatched token for a protected mutating request; otherwise lets it proceed,
 * issuing a token cookie on safe requests that lack one.
 */
export async function csrfHook(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const cookieToken = req.cookies?.[AUTH.csrfCookieName];
  const method = req.method.toUpperCase();

  if (SAFE_METHODS.has(method)) {
    if (!cookieToken) reply.setCookie(AUTH.csrfCookieName, generateCsrfToken(), csrfCookieOptions());
    return;
  }

  // Unsafe method. Exempt paths still get a token cookie seeded if missing (e.g.
  // login issues the first token to a brand-new client on its response).
  if (EXEMPT_PATHS.has(pathOf(req))) {
    if (!cookieToken) reply.setCookie(AUTH.csrfCookieName, generateCsrfToken(), csrfCookieOptions());
    return;
  }

  // CSRF only protects AUTHENTICATED actions: a forged cross-site request rides
  // the victim's session cookie, so the attack is only possible when a session
  // cookie is present. A request with NO session cookie cannot change anyone's
  // state — let it through so the auth guard returns the honest 401 instead of a
  // misleading 403. (This is the attack surface, not a loosening.)
  const hasSession = SESSION_COOKIE_NAMES.some((name) => req.cookies?.[name]);
  if (!hasSession) return;

  const header = headerToken(req);
  if (!cookieToken || !header || !safeEqual(header, cookieToken)) {
    await reply
      .code(403)
      .send({ error: 'Missing or invalid CSRF token. Reload the page and try again.', code: 'csrf_failed' } satisfies ApiErrorResponse);
  }
}

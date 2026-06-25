import type { CookieSerializeOptions } from '@fastify/cookie';
import type { FastifyRequest } from 'fastify';
import { AUTH, sessionCookieName, type SessionAudience } from '@simbank/shared';
import { config } from '../config';

/**
 * Session cookie helpers, shared by the routes/guards that set, read, and clear
 * the session cookie.
 *
 * The customer portal (:5173) and the operations console (:5174) run as separate
 * apps but talk to this one backend origin, and browser cookies are not isolated
 * by port. So each surface has its OWN session cookie (see `AUTH.sessionCookieNames`)
 * and the backend picks the right one per request from the request Origin. This
 * keeps the two sessions independent — a login or logout on one app never affects
 * the other.
 *
 * Cookie attributes:
 * - httpOnly: JS in the page cannot read the token (XSS can't exfiltrate it).
 * - sameSite 'lax': the customer/ops apps and the API are same-site (all
 *   localhost), so the cookie is sent on their requests while cross-site POSTs
 *   are blocked — a basic CSRF mitigation for this local simulation.
 * - secure: off for local http; a real deployment (out of scope for this
 *   simulation) would serve HTTPS and set this true.
 */

export { sessionCookieName };
export type { SessionAudience };

/**
 * Which app surface a request comes from, inferred from its `Origin` header
 * (both surfaces are CORS-whitelisted). A request is treated as the operations
 * console when its Origin is configured as an ops origin OR its port matches the
 * ops dev port (so it also works on a LAN host with Vite `host: true`). Anything
 * else — including same-origin requests and tests with no Origin — defaults to
 * the customer surface, the least-privileged default (ops/admin routes stay
 * role-gated regardless).
 */
export function sessionAudienceForOrigin(origin: string | undefined): SessionAudience {
  if (!origin) return 'customer';
  if (config.operationsOrigins.includes(origin)) return 'operations';
  try {
    const { port } = new URL(origin);
    if (port && port === String(config.operationsPort)) return 'operations';
  } catch {
    // Malformed Origin → fall through to the customer default.
  }
  return 'customer';
}

export function sessionAudienceForRequest(req: FastifyRequest): SessionAudience {
  return sessionAudienceForOrigin(req.headers.origin);
}

/** The session cookie name for the surface a request belongs to. */
export function sessionCookieNameForRequest(req: FastifyRequest): string {
  return sessionCookieName(sessionAudienceForRequest(req));
}

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

import { AUTH } from '@simbank/shared';

/**
 * CSRF double-submit token helper for the customer app (v1.0.0 / SEC-1).
 *
 * The backend sets a NON-httpOnly cookie (`AUTH.csrfCookieName`) on safe GETs and
 * on login — including the app's auth bootstrap `GET /api/auth/me`. On every
 * state-changing request (POST/PUT/PATCH/DELETE) from an authenticated session,
 * the backend requires the header `AUTH.csrfHeader` to equal that cookie; a
 * mismatch (or a missing header) is rejected with 403. A cross-site attacker can
 * neither read our cookie nor set this custom header (it triggers a CORS
 * preflight the allowlist blocks), so echoing the cookie back closes the gap.
 *
 * `csrfHeaders()` reads the cookie and returns the matching header, or an empty
 * object when there is no token (or no `document` — e.g. SSR/tests), so it is
 * safe to spread into any request's headers, including the rare GET where it is
 * simply ignored by the server.
 */

/** Read a cookie value by name from `document.cookie`, or null if absent. */
function readCookie(name: string): string | null {
  // Guard for non-browser environments (SSR / unit tests) where there is no DOM.
  if (typeof document === 'undefined') return null;
  const target = `${name}=`;
  for (const part of document.cookie.split(';')) {
    const cookie = part.trim();
    if (cookie.startsWith(target)) {
      return decodeURIComponent(cookie.slice(target.length));
    }
  }
  return null;
}

/**
 * The CSRF request header for the current session, or an empty object when no
 * token cookie is present. Spread into a mutating fetch's headers:
 *   headers: { ...csrfHeaders(), 'Content-Type': 'application/json' }
 */
export function csrfHeaders(): Record<string, string> {
  const token = readCookie(AUTH.csrfCookieName);
  return token ? { [AUTH.csrfHeader]: token } : {};
}

import { AUTH } from '@simbank/shared';

/**
 * CSRF double-submit helper (SEC-1). The backend sets a NON-httpOnly cookie
 * ({@link AUTH.csrfCookieName}) on safe GETs + login that page JS CAN read, and
 * on every state-changing request (POST/PUT/PATCH/DELETE) from an authenticated
 * session it requires a matching header ({@link AUTH.csrfHeader}). This reads the
 * cookie and echoes it back so mutating ops calls are not rejected with 403.
 *
 * SIMULATION: this guards fake, seeded demo data only — no real money or rails.
 */

/**
 * Returns `{ [AUTH.csrfHeader]: <token> }` when the CSRF cookie is present, or
 * `{}` otherwise (e.g. before the first safe GET has seeded it, or in a non-DOM
 * environment). Spread into a mutating request's headers.
 */
export function csrfHeaders(): Record<string, string> {
  if (typeof document === 'undefined') return {};
  const token = readCookie(AUTH.csrfCookieName);
  return token ? { [AUTH.csrfHeader]: token } : {};
}

/** Read a single cookie value from `document.cookie`, or null when absent. */
function readCookie(name: string): string | null {
  const prefix = `${name}=`;
  for (const part of document.cookie.split(';')) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) {
      return decodeURIComponent(trimmed.slice(prefix.length));
    }
  }
  return null;
}

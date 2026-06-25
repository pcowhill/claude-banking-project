import { createHash, randomBytes } from 'node:crypto';
import { AUTH } from '@simbank/shared';

/**
 * Session-token helpers.
 *
 * The raw token is a high-entropy random string that lives ONLY in the user's
 * httpOnly cookie. The database stores nothing but its SHA-256 hash, so a leak
 * of the session table cannot be replayed as a live session. This uses Node's
 * standard `crypto` primitives — random bytes and SHA-256 — and is explicitly
 * NOT custom cryptography.
 */

/** Generate a fresh opaque session token (hex-encoded random bytes). */
export function generateSessionToken(): string {
  return randomBytes(AUTH.sessionTokenBytes).toString('hex');
}

/** Deterministically hash a session token for storage / lookup. */
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

import bcrypt from 'bcryptjs';
import { AUTH } from '@simbank/shared';

/**
 * Password hashing using bcryptjs — a real, widely-used password-hashing
 * library (a faithful pure-JS implementation of bcrypt). It is chosen over a
 * native module (bcrypt/argon2) so the simulation builds with no native
 * toolchain on Windows, WSL, macOS and Linux alike. This is NOT custom
 * cryptography; we never hand-roll a hash.
 *
 * SIMULATION: these hashes protect fake, seeded demo passwords only.
 */

/** Hash a plaintext password for storage. */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, AUTH.bcryptCostFactor);
}

/**
 * Verify a plaintext password against a stored hash. Returns false (never
 * throws) when there is no hash, so callers can treat "no password set" as a
 * normal failed login.
 */
export async function verifyPassword(
  plain: string,
  hash: string | null | undefined,
): Promise<boolean> {
  if (!hash) return false;
  return bcrypt.compare(plain, hash);
}

/**
 * A fixed, throwaway hash compared against when the supplied email matches no
 * user. Doing the comparison anyway keeps the timing of "unknown user" and
 * "wrong password" similar, so the login endpoint does not leak which emails
 * exist. Computed once at module load.
 */
export const DECOY_PASSWORD_HASH: string = bcrypt.hashSync(
  'meridian-simulation-decoy-password',
  AUTH.bcryptCostFactor,
);

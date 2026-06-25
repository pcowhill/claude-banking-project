import { AUTH } from '@simbank/shared';

/**
 * Pure account-lockout math, kept free of any database so it can be unit-tested
 * in isolation. The login route reads a user's current counters, runs these
 * transitions, and persists the result.
 *
 * Policy: after `AUTH.maxFailedAttempts` failures in a row, the account is
 * locked for `AUTH.lockoutDurationMinutes`. Once that window passes the slate is
 * wiped clean (a single later failure does not immediately re-lock).
 */
export interface LockoutState {
  failedLoginAttempts: number;
  lockedUntil: Date | null;
}

/** Is the account locked relative to `now`? */
export function isLocked(state: LockoutState, now: Date): boolean {
  return state.lockedUntil !== null && state.lockedUntil.getTime() > now.getTime();
}

/**
 * Normalize a state before processing a new attempt: if a previous lock has
 * fully expired, start a fresh window (counter reset). A state with a still-
 * active lock is returned unchanged.
 */
export function normalizeForAttempt(state: LockoutState, now: Date): LockoutState {
  if (state.lockedUntil !== null && state.lockedUntil.getTime() <= now.getTime()) {
    return { failedLoginAttempts: 0, lockedUntil: null };
  }
  return state;
}

/** Next state after a FAILED attempt. Locks once the threshold is reached. */
export function registerFailure(state: LockoutState, now: Date): LockoutState {
  const failedLoginAttempts = state.failedLoginAttempts + 1;
  const shouldLock = failedLoginAttempts >= AUTH.maxFailedAttempts;
  return {
    failedLoginAttempts,
    lockedUntil: shouldLock
      ? new Date(now.getTime() + AUTH.lockoutDurationMinutes * 60_000)
      : state.lockedUntil,
  };
}

/** Next state after a SUCCESSFUL attempt — counters reset. */
export function registerSuccess(): LockoutState {
  return { failedLoginAttempts: 0, lockedUntil: null };
}

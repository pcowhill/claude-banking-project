import { describe, expect, it } from 'vitest';
import { AUTH } from '@simbank/shared';
import {
  isLocked,
  normalizeForAttempt,
  registerFailure,
  registerSuccess,
  type LockoutState,
} from './lockout';

const NOW = new Date('2026-06-25T12:00:00.000Z');
const fresh: LockoutState = { failedLoginAttempts: 0, lockedUntil: null };

describe('lockout policy (pure)', () => {
  it('does not lock before the threshold', () => {
    let state = fresh;
    for (let i = 0; i < AUTH.maxFailedAttempts - 1; i++) {
      state = registerFailure(state, NOW);
      expect(isLocked(state, NOW)).toBe(false);
    }
    expect(state.failedLoginAttempts).toBe(AUTH.maxFailedAttempts - 1);
  });

  it('locks exactly at the threshold for the configured duration', () => {
    let state = fresh;
    for (let i = 0; i < AUTH.maxFailedAttempts; i++) state = registerFailure(state, NOW);
    expect(isLocked(state, NOW)).toBe(true);
    const expectedUntil = NOW.getTime() + AUTH.lockoutDurationMinutes * 60_000;
    expect(state.lockedUntil?.getTime()).toBe(expectedUntil);

    // Still locked just before expiry, free just after.
    expect(isLocked(state, new Date(expectedUntil - 1))).toBe(true);
    expect(isLocked(state, new Date(expectedUntil + 1))).toBe(false);
  });

  it('a successful attempt clears all lockout state', () => {
    let state = fresh;
    for (let i = 0; i < AUTH.maxFailedAttempts; i++) state = registerFailure(state, NOW);
    expect(isLocked(state, NOW)).toBe(true);
    state = registerSuccess();
    expect(state).toEqual({ failedLoginAttempts: 0, lockedUntil: null });
  });

  it('normalizing after the lock window starts a fresh attempt budget', () => {
    let state = fresh;
    for (let i = 0; i < AUTH.maxFailedAttempts; i++) state = registerFailure(state, NOW);
    const afterExpiry = new Date(state.lockedUntil!.getTime() + 1);

    const normalized = normalizeForAttempt(state, afterExpiry);
    expect(normalized).toEqual({ failedLoginAttempts: 0, lockedUntil: null });

    // A single failure after expiry must NOT immediately re-lock.
    const next = registerFailure(normalized, afterExpiry);
    expect(isLocked(next, afterExpiry)).toBe(false);
  });

  it('leaves a still-active lock untouched when normalizing', () => {
    let state = fresh;
    for (let i = 0; i < AUTH.maxFailedAttempts; i++) state = registerFailure(state, NOW);
    expect(normalizeForAttempt(state, NOW)).toBe(state);
  });
});

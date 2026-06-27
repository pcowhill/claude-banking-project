import { describe, it, expect } from 'vitest';
import {
  ADVANCE_CLOCK_LIMITS,
  advanceBy,
  advanceRequestMinutes,
  validateAdvance,
} from './clock';

describe('clock — advanceRequestMinutes', () => {
  it('sums days, hours and minutes', () => {
    expect(advanceRequestMinutes({ days: 1, hours: 2, minutes: 30 })).toBe(1 * 1440 + 2 * 60 + 30);
  });

  it('defaults each unit to 0 and truncates fractionals', () => {
    expect(advanceRequestMinutes({})).toBe(0);
    expect(advanceRequestMinutes({ hours: 1.9 })).toBe(60);
    expect(advanceRequestMinutes({ minutes: Number.NaN })).toBe(0);
  });
});

describe('clock — validateAdvance (forward-only, bounded)', () => {
  it('rejects a zero or negative (rewind) advance', () => {
    expect(validateAdvance({ minutes: 0 }).ok).toBe(false);
    const back = validateAdvance({ days: -1 });
    expect(back.ok).toBe(false);
    expect(back.errors.amount).toMatch(/cannot rewind/i);
  });

  it('accepts a minimal forward step', () => {
    const r = validateAdvance({ minutes: 1 });
    expect(r.ok).toBe(true);
    expect(r.value).toEqual({ minutes: 1 });
  });

  it('accepts a combined days/hours advance', () => {
    const r = validateAdvance({ days: 3, hours: 6 });
    expect(r.ok).toBe(true);
    expect(r.value?.minutes).toBe(3 * 1440 + 6 * 60);
  });

  it('rejects more than the per-advance maximum', () => {
    const r = validateAdvance({ minutes: ADVANCE_CLOCK_LIMITS.maxMinutes + 1 });
    expect(r.ok).toBe(false);
    expect(r.errors.amount).toMatch(/at most one year/i);
  });

  it('accepts exactly the maximum', () => {
    expect(validateAdvance({ minutes: ADVANCE_CLOCK_LIMITS.maxMinutes }).ok).toBe(true);
  });
});

describe('clock — advanceBy', () => {
  it('moves a date forward by whole minutes', () => {
    const base = new Date(Date.UTC(2026, 5, 27, 12, 0, 0));
    expect(advanceBy(base, 90).toISOString()).toBe(new Date(Date.UTC(2026, 5, 27, 13, 30, 0)).toISOString());
  });
});

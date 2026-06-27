import { describe, it, expect } from 'vitest';
import {
  addInterval,
  isActiveSchedule,
  isScheduleFrequency,
  isScheduleKind,
  scheduleFrequencyLabel,
  scheduleKindLabel,
  SCHEDULE_LIMITS,
  validateCreateSchedule,
} from './schedules';

describe('schedules — guards & labels', () => {
  it('narrows kinds and frequencies', () => {
    expect(isScheduleKind('internal_transfer')).toBe(true);
    expect(isScheduleKind('wire')).toBe(false);
    expect(isScheduleFrequency('monthly')).toBe(true);
    expect(isScheduleFrequency('yearly')).toBe(false);
  });

  it('only active schedules are still live', () => {
    expect(isActiveSchedule('active')).toBe(true);
    expect(isActiveSchedule('completed')).toBe(false);
    expect(isActiveSchedule('cancelled')).toBe(false);
  });

  it('labels read naturally', () => {
    expect(scheduleKindLabel('bill_pay')).toMatch(/bill/i);
    expect(scheduleFrequencyLabel('once')).toMatch(/one time/i);
  });
});

describe('schedules — addInterval (calendar-safe, UTC)', () => {
  it('has no next occurrence for a one-time schedule', () => {
    expect(addInterval(new Date(Date.UTC(2026, 5, 27)), 'once')).toBeNull();
  });

  it('adds 7 days for weekly', () => {
    const from = new Date(Date.UTC(2026, 5, 27, 9, 0, 0));
    expect(addInterval(from, 'weekly')?.toISOString()).toBe(
      new Date(Date.UTC(2026, 6, 4, 9, 0, 0)).toISOString(),
    );
  });

  it('adds one calendar month for monthly', () => {
    const from = new Date(Date.UTC(2026, 0, 15));
    expect(addInterval(from, 'monthly')?.toISOString()).toBe(new Date(Date.UTC(2026, 1, 15)).toISOString());
  });

  it('clamps month-end (Jan 31 -> Feb 28) without rolling into March', () => {
    const jan31 = new Date(Date.UTC(2026, 0, 31));
    expect(addInterval(jan31, 'monthly')?.toISOString()).toBe(new Date(Date.UTC(2026, 1, 28)).toISOString());
  });

  it('respects leap years (Jan 31 2024 -> Feb 29)', () => {
    const jan31 = new Date(Date.UTC(2024, 0, 31));
    expect(addInterval(jan31, 'monthly')?.toISOString()).toBe(new Date(Date.UTC(2024, 1, 29)).toISOString());
  });
});

describe('schedules — validateCreateSchedule', () => {
  const transfer = {
    kind: 'internal_transfer',
    fromAccountId: 'a1',
    toAccountId: 'a2',
    amountMinor: 5_000,
    frequency: 'monthly',
  };

  it('accepts a valid internal transfer', () => {
    const r = validateCreateSchedule(transfer);
    expect(r.ok).toBe(true);
    expect(r.value).toMatchObject({ kind: 'internal_transfer', toAccountId: 'a2', counterparty: null, firstRunInDays: 0 });
  });

  it('requires a distinct destination for an internal transfer', () => {
    expect(validateCreateSchedule({ ...transfer, toAccountId: '' }).errors.toAccountId).toBeTruthy();
    expect(validateCreateSchedule({ ...transfer, toAccountId: 'a1' }).errors.toAccountId).toMatch(/different/i);
  });

  it('accepts a valid bill pay and drops any stray toAccountId', () => {
    const r = validateCreateSchedule({
      kind: 'bill_pay',
      fromAccountId: 'a1',
      toAccountId: 'a2',
      counterparty: 'City Power',
      amountMinor: 9_900,
      frequency: 'monthly',
      firstRunInDays: 3,
    });
    expect(r.ok).toBe(true);
    expect(r.value).toMatchObject({ kind: 'bill_pay', counterparty: 'City Power', toAccountId: null, firstRunInDays: 3 });
  });

  it('requires a biller for a bill pay', () => {
    const r = validateCreateSchedule({ kind: 'bill_pay', fromAccountId: 'a1', amountMinor: 100, frequency: 'once' });
    expect(r.ok).toBe(false);
    expect(r.errors.counterparty).toMatch(/biller/i);
  });

  it('enforces the amount bounds', () => {
    expect(validateCreateSchedule({ ...transfer, amountMinor: 0 }).errors.amountMinor).toBeTruthy();
    expect(validateCreateSchedule({ ...transfer, amountMinor: SCHEDULE_LIMITS.maxMinor + 1 }).errors.amountMinor).toBeTruthy();
    expect(validateCreateSchedule({ ...transfer, amountMinor: 1.5 }).errors.amountMinor).toBeTruthy();
  });

  it('requires a known frequency and a valid first-run window', () => {
    expect(validateCreateSchedule({ ...transfer, frequency: 'daily' }).errors.frequency).toBeTruthy();
    expect(validateCreateSchedule({ ...transfer, firstRunInDays: -1 }).errors.firstRunInDays).toBeTruthy();
    expect(
      validateCreateSchedule({ ...transfer, firstRunInDays: SCHEDULE_LIMITS.maxFirstRunInDays + 1 }).errors.firstRunInDays,
    ).toBeTruthy();
  });
});

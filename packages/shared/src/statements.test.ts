import { describe, it, expect } from 'vitest';
import { buildStatementPeriods, summarizeStatementPeriod, type StatementEntryLike } from './statements';

const at = (y: number, m: number, d: number) => Date.UTC(y, m, d);

describe('statements — buildStatementPeriods', () => {
  it('returns the requested count, newest-first, ending with the month containing now', () => {
    const now = new Date(Date.UTC(2026, 5, 15)); // June 2026
    const periods = buildStatementPeriods(now, 3);
    expect(periods).toHaveLength(3);
    expect(periods[0].key).toBe('2026-06');
    expect(periods[1].key).toBe('2026-05');
    expect(periods[2].key).toBe('2026-04');
    expect(periods[0].label).toBe('June 2026');
  });

  it('computes month bounds as [start, nextMonthStart)', () => {
    const periods = buildStatementPeriods(new Date(Date.UTC(2026, 0, 10)), 1);
    expect(periods[0].startISO).toBe(new Date(Date.UTC(2026, 0, 1)).toISOString());
    expect(periods[0].endISO).toBe(new Date(Date.UTC(2026, 1, 1)).toISOString());
  });

  it('clamps the count to at least 1', () => {
    expect(buildStatementPeriods(new Date(Date.UTC(2026, 5, 1)), 0)).toHaveLength(1);
  });
});

describe('statements — summarizeStatementPeriod', () => {
  const period = buildStatementPeriods(new Date(Date.UTC(2026, 5, 15)), 1)[0]; // June 2026

  const entries: StatementEntryLike[] = [
    { amountMinor: 100_000, direction: 'credit', status: 'posted', at: at(2026, 4, 10) }, // before — opening
    { amountMinor: 20_000, direction: 'debit', status: 'posted', at: at(2026, 4, 20) }, // before — opening
    { amountMinor: 50_000, direction: 'credit', status: 'posted', at: at(2026, 5, 5) }, // within
    { amountMinor: 12_000, direction: 'debit', status: 'posted', at: at(2026, 5, 9) }, // within
    { amountMinor: 9_999, direction: 'debit', status: 'pending', at: at(2026, 5, 9) }, // within but NOT settled
    { amountMinor: 5_000, direction: 'credit', status: 'posted', at: at(2026, 6, 2) }, // after — ignored
  ];

  it('derives opening, within-period credits/debits, and closing', () => {
    const s = summarizeStatementPeriod(entries, period);
    expect(s.openingMinor).toBe(100_000 - 20_000); // 80,000
    expect(s.creditsMinor).toBe(50_000);
    expect(s.debitsMinor).toBe(12_000);
    expect(s.count).toBe(2); // the pending entry is excluded
    expect(s.closingMinor).toBe(80_000 + 50_000 - 12_000); // 118,000
  });

  it('ignores failed/reversed entries entirely', () => {
    const s = summarizeStatementPeriod(
      [
        { amountMinor: 7_000, direction: 'credit', status: 'reversed', at: at(2026, 5, 6) },
        { amountMinor: 3_000, direction: 'debit', status: 'failed', at: at(2026, 5, 6) },
      ],
      period,
    );
    expect(s).toEqual({ openingMinor: 0, closingMinor: 0, creditsMinor: 0, debitsMinor: 0, count: 0 });
  });

  it('counts a disputed entry as settled (like the ledger)', () => {
    const s = summarizeStatementPeriod(
      [{ amountMinor: 4_000, direction: 'debit', status: 'disputed', at: at(2026, 5, 7) }],
      period,
    );
    expect(s.debitsMinor).toBe(4_000);
    expect(s.count).toBe(1);
  });
});

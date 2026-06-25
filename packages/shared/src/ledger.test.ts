import { describe, it, expect } from 'vitest';
import { deriveBalances, settledTotalMinor, type LedgerEntryLike } from './ledger';

describe('deriveBalances', () => {
  it('returns zeroes for an empty account', () => {
    expect(deriveBalances([])).toEqual({
      currentMinor: 0,
      availableMinor: 0,
      pendingCreditMinor: 0,
      pendingDebitMinor: 0,
      heldMinor: 0,
    });
  });

  it('counts posted credits and debits in both current and available', () => {
    const entries: LedgerEntryLike[] = [
      { amountMinor: 100_000, direction: 'credit', status: 'posted' },
      { amountMinor: 25_000, direction: 'debit', status: 'posted' },
    ];
    const b = deriveBalances(entries);
    expect(b.currentMinor).toBe(75_000);
    expect(b.availableMinor).toBe(75_000);
  });

  it('reserves pending debits and holds from available but not from current', () => {
    const entries: LedgerEntryLike[] = [
      { amountMinor: 100_000, direction: 'credit', status: 'posted' },
      { amountMinor: 10_000, direction: 'debit', status: 'pending' },
      { amountMinor: 5_000, direction: 'debit', status: 'held' },
      { amountMinor: 7_000, direction: 'credit', status: 'pending' },
    ];
    const b = deriveBalances(entries);
    expect(b.currentMinor).toBe(100_000);
    expect(b.availableMinor).toBe(85_000); // 100k - 10k pending debit - 5k hold
    expect(b.pendingCreditMinor).toBe(7_000);
    expect(b.pendingDebitMinor).toBe(10_000);
    expect(b.heldMinor).toBe(5_000);
  });

  it('ignores failed and reversed entries entirely', () => {
    const entries: LedgerEntryLike[] = [
      { amountMinor: 50_000, direction: 'credit', status: 'posted' },
      { amountMinor: 50_000, direction: 'debit', status: 'failed' },
      { amountMinor: 50_000, direction: 'debit', status: 'reversed' },
    ];
    expect(deriveBalances(entries).currentMinor).toBe(50_000);
  });

  it('throws if an amount is negative (sign belongs to direction)', () => {
    expect(() =>
      deriveBalances([{ amountMinor: -100, direction: 'credit', status: 'posted' }]),
    ).toThrow();
  });
});

describe('ledger invariant: money does not appear or vanish', () => {
  it('an internal transfer conserves total settled value across accounts', () => {
    // Seed funding (bank-originated) puts $1,000.00 into account A.
    const seed: LedgerEntryLike[] = [
      { amountMinor: 100_000, direction: 'credit', status: 'posted' },
    ];
    const systemBefore = settledTotalMinor(seed);
    expect(systemBefore).toBe(100_000);

    // A transfer of $300.00 from A to B: debit A, credit B. Both posted.
    const accountA: LedgerEntryLike[] = [
      ...seed,
      { amountMinor: 30_000, direction: 'debit', status: 'posted' },
    ];
    const accountB: LedgerEntryLike[] = [
      { amountMinor: 30_000, direction: 'credit', status: 'posted' },
    ];

    expect(deriveBalances(accountA).currentMinor).toBe(70_000);
    expect(deriveBalances(accountB).currentMinor).toBe(30_000);

    // System-wide settled total is unchanged by the transfer.
    const systemAfter = settledTotalMinor([...accountA, ...accountB]);
    expect(systemAfter).toBe(systemBefore);
  });
});

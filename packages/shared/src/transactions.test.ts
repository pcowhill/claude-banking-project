import { describe, it, expect } from 'vitest';
import {
  filterTransactions,
  groupForStatus,
  isPending,
  isPosted,
  originLabel,
  signedMinor,
  toTransactionDTOs,
  type RawLedgerRow,
} from './transactions';

/** Build a raw ledger row with sensible defaults for a test. */
function row(overrides: Partial<RawLedgerRow> & Pick<RawLedgerRow, 'id'>): RawLedgerRow {
  return {
    accountId: 'acct-1',
    amountMinor: 1000,
    direction: 'debit',
    status: 'posted',
    origin: 'payment',
    description: 'Test entry',
    postedAt: '2026-06-01T00:00:00.000Z',
    createdAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('signedMinor', () => {
  it('is positive for credits and negative for debits', () => {
    expect(signedMinor({ amountMinor: 500, direction: 'credit' })).toBe(500);
    expect(signedMinor({ amountMinor: 500, direction: 'debit' })).toBe(-500);
  });
});

describe('groupForStatus / isPending / isPosted', () => {
  it('groups pending and held as pending', () => {
    expect(groupForStatus('pending')).toBe('pending');
    expect(groupForStatus('held')).toBe('pending');
    expect(isPending({ status: 'held' })).toBe(true);
    expect(isPosted({ status: 'held' })).toBe(false);
  });

  it('groups posted and disputed as posted', () => {
    expect(groupForStatus('posted')).toBe('posted');
    expect(groupForStatus('disputed')).toBe('posted');
    expect(isPosted({ status: 'disputed' })).toBe(true);
  });

  it('groups failed and reversed as other', () => {
    expect(groupForStatus('failed')).toBe('other');
    expect(groupForStatus('reversed')).toBe('other');
  });
});

describe('originLabel', () => {
  it('maps known origins to friendly labels', () => {
    expect(originLabel('seed')).toBe('Opening deposit');
    expect(originLabel('interest')).toBe('Interest');
    expect(originLabel('transfer')).toBe('Transfer');
  });
});

describe('toTransactionDTOs', () => {
  it('orders transactions newest-first by effective time', () => {
    const dtos = toTransactionDTOs([
      row({ id: 'a', postedAt: '2026-06-01T00:00:00.000Z' }),
      row({ id: 'c', postedAt: '2026-06-03T00:00:00.000Z' }),
      row({ id: 'b', postedAt: '2026-06-02T00:00:00.000Z' }),
    ]);
    expect(dtos.map((d) => d.id)).toEqual(['c', 'b', 'a']);
  });

  it('accumulates a running settled balance in chronological order', () => {
    const dtos = toTransactionDTOs([
      row({ id: 'open', direction: 'credit', amountMinor: 100_000, origin: 'seed', postedAt: '2026-06-01T00:00:00.000Z' }),
      row({ id: 'spend', direction: 'debit', amountMinor: 30_000, origin: 'payment', postedAt: '2026-06-02T00:00:00.000Z' }),
      row({ id: 'interest', direction: 'credit', amountMinor: 500, origin: 'interest', postedAt: '2026-06-03T00:00:00.000Z' }),
    ]);
    // Returned newest-first, but the running balance reads like a statement.
    const byId = Object.fromEntries(dtos.map((d) => [d.id, d.runningBalanceMinor]));
    expect(byId.open).toBe(100_000);
    expect(byId.spend).toBe(70_000);
    expect(byId.interest).toBe(70_500);
  });

  it('leaves the running balance null for non-settled entries and excludes them from the running total', () => {
    const dtos = toTransactionDTOs([
      row({ id: 'open', direction: 'credit', amountMinor: 100_000, origin: 'seed', postedAt: '2026-06-01T00:00:00.000Z' }),
      row({
        id: 'pending',
        direction: 'debit',
        amountMinor: 2_500,
        status: 'pending',
        origin: 'card',
        postedAt: null,
        createdAt: '2026-06-04T00:00:00.000Z',
      }),
    ]);
    const pending = dtos.find((d) => d.id === 'pending');
    const open = dtos.find((d) => d.id === 'open');
    expect(pending?.runningBalanceMinor).toBeNull();
    expect(pending?.signedAmountMinor).toBe(-2_500);
    // The pending debit did not move the settled running balance.
    expect(open?.runningBalanceMinor).toBe(100_000);
  });
});

describe('filterTransactions', () => {
  const dtos = toTransactionDTOs([
    row({ id: 'grocery', description: 'Groceries — Simmons Market', origin: 'payment', status: 'posted' }),
    row({ id: 'coffee', description: 'Coffee Roasters', origin: 'card', status: 'pending', postedAt: null }),
    row({ id: 'interest', description: 'Monthly interest', origin: 'interest', status: 'posted' }),
  ]);

  it('matches description case-insensitively', () => {
    expect(filterTransactions(dtos, { q: 'coffee' }).map((d) => d.id)).toEqual(['coffee']);
    expect(filterTransactions(dtos, { q: 'MARKET' }).map((d) => d.id)).toEqual(['grocery']);
  });

  it('filters by display group', () => {
    expect(filterTransactions(dtos, { group: 'pending' }).map((d) => d.id)).toEqual(['coffee']);
    expect(filterTransactions(dtos, { group: 'posted' }).map((d) => d.id).sort()).toEqual([
      'grocery',
      'interest',
    ]);
  });

  it('filters by origin', () => {
    expect(filterTransactions(dtos, { origin: 'interest' }).map((d) => d.id)).toEqual(['interest']);
  });

  it('combines filters (AND)', () => {
    expect(filterTransactions(dtos, { group: 'posted', q: 'interest' }).map((d) => d.id)).toEqual([
      'interest',
    ]);
    expect(filterTransactions(dtos, { group: 'pending', origin: 'interest' })).toHaveLength(0);
  });

  it('returns everything for an empty query', () => {
    expect(filterTransactions(dtos)).toHaveLength(3);
  });
});

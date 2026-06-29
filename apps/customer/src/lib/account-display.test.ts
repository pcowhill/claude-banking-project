import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SAVINGS_APY_BPS,
  type AccountRelationship,
  type AccountSummary,
  type AccountType,
} from '@simbank/shared';
import {
  accountTypeLabel,
  formatSignedMinor,
  formatTxnDate,
  groupAccounts,
  isCashAccount,
  isLendingAccount,
  savingsApyNote,
} from './account-display';

/**
 * Pure-helper unit tests for the customer account-display module (Q-01, the
 * project's first frontend tests). These are logic-bearing presentational
 * helpers — no DOM, no React, no new deps — covering the v1.0.0 cash-vs-lending
 * split that drives the dashboard headline total, plus the existing formatters.
 */

/** Build a minimal AccountSummary for grouping tests (balances are unused here). */
function account(
  id: string,
  type: AccountType,
  overrides: Partial<AccountSummary> = {},
): AccountSummary {
  return {
    id,
    name: `${type} account`,
    type,
    status: 'active',
    currency: 'USD',
    relationship: 'owner' as AccountRelationship,
    balances: {
      currentMinor: 0,
      availableMinor: 0,
      pendingCreditMinor: 0,
      pendingDebitMinor: 0,
      heldMinor: 0,
    },
    ...overrides,
  };
}

describe('isCashAccount / isLendingAccount', () => {
  it('treats checking and savings as cash', () => {
    expect(isCashAccount(account('a', 'checking'))).toBe(true);
    expect(isCashAccount(account('b', 'savings'))).toBe(true);
  });

  it('does not treat cd / loan / external as cash', () => {
    expect(isCashAccount(account('c', 'cd'))).toBe(false);
    expect(isCashAccount(account('d', 'loan'))).toBe(false);
    expect(isCashAccount(account('e', 'external'))).toBe(false);
  });

  it('treats only cd and loan as lending', () => {
    expect(isLendingAccount(account('c', 'cd'))).toBe(true);
    expect(isLendingAccount(account('d', 'loan'))).toBe(true);
    expect(isLendingAccount(account('a', 'checking'))).toBe(false);
    expect(isLendingAccount(account('b', 'savings'))).toBe(false);
    // An external account is neither cash nor lending — it falls to "cash" in
    // the grouping (see groupAccounts), but is not a lending product.
    expect(isLendingAccount(account('e', 'external'))).toBe(false);
  });
});

describe('groupAccounts', () => {
  it('splits cash (checking/savings) from lending (cd/loan), preserving order', () => {
    const accounts = [
      account('chk', 'checking'),
      account('cd1', 'cd'),
      account('sav', 'savings'),
      account('loan1', 'loan'),
    ];
    const { cash, lending } = groupAccounts(accounts);
    expect(cash.map((a) => a.id)).toEqual(['chk', 'sav']);
    expect(lending.map((a) => a.id)).toEqual(['cd1', 'loan1']);
  });

  it('puts a non-cash, non-lending account (external) in the cash bucket', () => {
    // groupAccounts is "lending vs. everything else"; an external account is not
    // a lending product, so it must not land in the lending list.
    const { cash, lending } = groupAccounts([account('ext', 'external')]);
    expect(lending).toHaveLength(0);
    expect(cash.map((a) => a.id)).toEqual(['ext']);
  });

  it('returns two empty arrays for no accounts', () => {
    const { cash, lending } = groupAccounts([]);
    expect(cash).toEqual([]);
    expect(lending).toEqual([]);
  });

  it('does not mutate the input array', () => {
    const accounts = [account('chk', 'checking'), account('loan1', 'loan')];
    const snapshot = accounts.map((a) => a.id);
    groupAccounts(accounts);
    expect(accounts.map((a) => a.id)).toEqual(snapshot);
  });
});

describe('savingsApyNote', () => {
  it('returns a simulated APY note only for savings', () => {
    expect(savingsApyNote('savings')).toBe('Earns 1.50% APY (simulated)');
    // Sanity-tie the literal to the shared constant so the note tracks the rate.
    expect(savingsApyNote('savings')).toContain(
      `${(DEFAULT_SAVINGS_APY_BPS / 100).toFixed(2)}%`,
    );
  });

  it('returns null for non-savings account types', () => {
    expect(savingsApyNote('checking')).toBeNull();
    expect(savingsApyNote('cd')).toBeNull();
    expect(savingsApyNote('loan')).toBeNull();
    expect(savingsApyNote('external')).toBeNull();
  });
});

describe('accountTypeLabel', () => {
  it('maps known account types to friendly labels', () => {
    expect(accountTypeLabel('checking')).toBe('Checking');
    expect(accountTypeLabel('savings')).toBe('Savings');
    expect(accountTypeLabel('cd')).toBe('Certificate of deposit');
    expect(accountTypeLabel('loan')).toBe('Loan');
  });
});

describe('formatSignedMinor', () => {
  it('prefixes a credit with + and a debit with -', () => {
    expect(formatSignedMinor(1_234_56)).toBe('+$1,234.56');
    expect(formatSignedMinor(-1_234_56)).toBe('-$1,234.56');
  });

  it('treats zero as a positive sign', () => {
    expect(formatSignedMinor(0)).toBe('+$0.00');
  });
});

describe('formatTxnDate', () => {
  it('formats a valid ISO date', () => {
    // Asserting the year is locale-stable; full-string formatting is locale-dependent.
    expect(formatTxnDate('2026-06-29T12:00:00.000Z')).toMatch(/2026/);
  });

  it('returns the raw value for an unparseable date', () => {
    expect(formatTxnDate('not-a-date')).toBe('not-a-date');
  });
});

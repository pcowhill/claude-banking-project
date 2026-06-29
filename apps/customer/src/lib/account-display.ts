import {
  formatApy,
  formatMinor,
  DEFAULT_SAVINGS_APY_BPS,
  type AccountRelationship,
  type AccountSummary,
  type AccountType,
  type LedgerStatus,
} from '@simbank/shared';

/**
 * Presentational lookups + formatters shared by the dashboard overview, the
 * account detail page, and the transaction list (v0.4.0). Centralized so the
 * three surfaces label accounts, relationships, statuses, and money the same
 * way. Pure data + formatting — no React.
 */

/** Badge label + classes for the caller's relationship to an account. */
export const RELATIONSHIP_META: Record<AccountRelationship, { label: string; className: string }> = {
  owner: { label: 'Owner', className: 'bg-brand-navy/10 text-brand-navy' },
  joint: { label: 'Joint', className: 'bg-brand-teal/10 text-brand-teal-dark' },
  authorized: { label: 'Authorized', className: 'bg-brand-gold/20 text-brand-ink' },
  viewer: { label: 'View only', className: 'bg-slate-100 text-slate-500' },
};

/** Friendly label for an account type. */
export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  checking: 'Checking',
  savings: 'Savings',
  credit_card: 'Credit card',
  loan: 'Loan',
  cd: 'Certificate of deposit',
  external: 'External',
};

export function accountTypeLabel(type: AccountType): string {
  return ACCOUNT_TYPE_LABELS[type] ?? type;
}

/** Badge label + classes for a transaction's ledger status. */
export const TXN_STATUS_META: Record<LedgerStatus, { label: string; className: string }> = {
  posted: { label: 'Posted', className: 'bg-emerald-50 text-emerald-700' },
  pending: { label: 'Pending', className: 'bg-amber-50 text-amber-700' },
  held: { label: 'Hold', className: 'bg-amber-50 text-amber-700' },
  disputed: { label: 'Disputed', className: 'bg-rose-50 text-rose-700' },
  failed: { label: 'Failed', className: 'bg-slate-100 text-slate-500' },
  reversed: { label: 'Reversed', className: 'bg-slate-100 text-slate-500' },
};

/** Format a SIGNED minor amount with an explicit +/- sign (credit positive). */
export function formatSignedMinor(minor: number, currency = 'USD'): string {
  const magnitude = formatMinor(Math.abs(minor), currency);
  return `${minor < 0 ? '-' : '+'}${magnitude}`;
}

/** Medium date for a transaction row. Tolerates a malformed ISO value. */
export function formatTxnDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

// ---- Account grouping (cash vs. loans & CDs) --------------------------------

/**
 * Account types that count toward spendable "cash" (the headline total). Loans
 * and CDs are excluded so a loan's NEGATIVE balance can't silently distort it.
 */
const CASH_ACCOUNT_TYPES: ReadonlySet<AccountType> = new Set<AccountType>([
  'checking',
  'savings',
]);

/** True for an everyday cash account (checking/savings). */
export function isCashAccount(account: AccountSummary): boolean {
  return CASH_ACCOUNT_TYPES.has(account.type);
}

/** True for a lending/deposit product account (a CD or a loan). */
export function isLendingAccount(account: AccountSummary): boolean {
  return account.type === 'cd' || account.type === 'loan';
}

/**
 * Split the accounts a customer can see into "cash" (checking/savings — summed in
 * the headline total) and "lending" (cd/loan — shown separately so a loan's
 * negative balance never distorts the cash total). Order within each group is
 * preserved. v1.0.0, since seeded CD + loan accounts now appear in /api/accounts.
 */
export function groupAccounts(accounts: AccountSummary[]): {
  cash: AccountSummary[];
  lending: AccountSummary[];
} {
  const cash: AccountSummary[] = [];
  const lending: AccountSummary[] = [];
  for (const account of accounts) {
    if (isLendingAccount(account)) lending.push(account);
    else cash.push(account);
  }
  return { cash, lending };
}

/** A small "earns X% APY (simulated)" note for a savings account, else null. */
export function savingsApyNote(type: AccountType): string | null {
  if (type !== 'savings') return null;
  return `Earns ${formatApy(DEFAULT_SAVINGS_APY_BPS)} APY (simulated)`;
}

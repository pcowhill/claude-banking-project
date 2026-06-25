import {
  formatMinor,
  type AccountRelationship,
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

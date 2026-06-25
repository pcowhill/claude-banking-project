/**
 * Transaction (ledger-entry) contracts shared by the backend and the customer
 * app (v0.4.0). A "transaction" in Meridian is simply a row of the append-only
 * ledger exposed for display — there is no separate, editable transaction
 * record, and balances remain DERIVED from these entries (see `ledger.ts`).
 *
 * This module is pure and dependency-free so the same derivation (signed amount,
 * running balance, ordering, filtering) is used by the API and unit-tested
 * without a database.
 */
import type { AccountSummary } from './auth';
import type { LedgerDirection, LedgerOrigin, LedgerStatus } from './ledger';

/**
 * A single ledger entry as exposed to clients. `amountMinor` keeps the ledger
 * convention (a positive magnitude; the sign lives in `direction`), and
 * `signedAmountMinor` is provided for convenient display (credit positive,
 * debit negative). `runningBalanceMinor` is the settled balance AFTER this entry
 * and is null for entries that do not affect the settled balance (pending, held,
 * failed, reversed).
 */
export interface TransactionDTO {
  id: string;
  accountId: string;
  amountMinor: number;
  direction: LedgerDirection;
  status: LedgerStatus;
  origin: LedgerOrigin;
  description: string;
  /** ISO timestamp the entry settled (posted/disputed), or null if not settled. */
  postedAt: string | null;
  /** ISO timestamp the entry was recorded (orders pending items). */
  createdAt: string;
  /** Signed amount in minor units: credit positive, debit negative. */
  signedAmountMinor: number;
  /** Settled running balance after this entry, or null for non-settled entries. */
  runningBalanceMinor: number | null;
}

/** GET /api/accounts/:id/transactions success payload (account header + its rows). */
export interface AccountTransactionsResponse {
  account: AccountSummary;
  transactions: TransactionDTO[];
}

/** How transactions are grouped for display. */
export type TransactionGroup = 'pending' | 'posted' | 'other';

/** Server/client filter+search for a transaction list. */
export interface TransactionQuery {
  /** Case-insensitive substring match over the description. */
  q?: string;
  /** Restrict to a display group (pending vs posted). */
  group?: TransactionGroup;
  /** Restrict to a single origin/category. */
  origin?: LedgerOrigin;
}

/** Map a ledger status to its display group. */
export function groupForStatus(status: LedgerStatus): TransactionGroup {
  if (status === 'pending' || status === 'held') return 'pending';
  if (status === 'posted' || status === 'disputed') return 'posted';
  return 'other';
}

/** True if the entry is awaiting settlement (pending or held). */
export function isPending(t: Pick<TransactionDTO, 'status'>): boolean {
  return groupForStatus(t.status) === 'pending';
}

/** True if the entry has settled (posted or disputed). */
export function isPosted(t: Pick<TransactionDTO, 'status'>): boolean {
  return groupForStatus(t.status) === 'posted';
}

/** Human-readable category label for an origin, for badges and the filter UI. */
export const TRANSACTION_ORIGIN_LABELS: Record<LedgerOrigin, string> = {
  seed: 'Opening deposit',
  interest: 'Interest',
  fee: 'Fee',
  adjustment: 'Adjustment',
  transfer: 'Transfer',
  payment: 'Payment',
  deposit: 'Deposit',
  card: 'Card',
};

/** Display label for a transaction's origin. */
export function originLabel(origin: LedgerOrigin): string {
  return TRANSACTION_ORIGIN_LABELS[origin] ?? origin;
}

/** Signed minor amount for a ledger-like row: credit positive, debit negative. */
export function signedMinor(row: { amountMinor: number; direction: LedgerDirection }): number {
  return row.direction === 'credit' ? row.amountMinor : -row.amountMinor;
}

/** The minimal raw ledger shape needed to build transaction views. */
export interface RawLedgerRow {
  id: string;
  accountId: string;
  amountMinor: number;
  direction: LedgerDirection;
  status: LedgerStatus;
  origin: LedgerOrigin;
  description: string;
  postedAt: string | null;
  createdAt: string;
}

/** Effective ordering time: settled entries order by postedAt, else createdAt. */
function effectiveTime(row: RawLedgerRow): number {
  const parsed = Date.parse(row.postedAt ?? row.createdAt);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * Turn raw ledger rows into display-ready transactions: newest-first, each with
 * a signed amount and (for settled entries) the running settled balance after
 * it. The running balance is accumulated over settled entries in CHRONOLOGICAL
 * order so it reads like a real statement, then attached back to the
 * newest-first list. Pure — the single source of truth for both the API and its
 * tests.
 */
export function toTransactionDTOs(rows: readonly RawLedgerRow[]): TransactionDTO[] {
  const settledChrono = rows
    .filter((r) => r.status === 'posted' || r.status === 'disputed')
    .slice()
    .sort((a, b) => effectiveTime(a) - effectiveTime(b));

  const runningById = new Map<string, number>();
  let running = 0;
  for (const row of settledChrono) {
    running += signedMinor(row);
    runningById.set(row.id, running);
  }

  return rows
    .slice()
    .sort((a, b) => effectiveTime(b) - effectiveTime(a))
    .map((row) => ({
      id: row.id,
      accountId: row.accountId,
      amountMinor: row.amountMinor,
      direction: row.direction,
      status: row.status,
      origin: row.origin,
      description: row.description,
      postedAt: row.postedAt,
      createdAt: row.createdAt,
      signedAmountMinor: signedMinor(row),
      runningBalanceMinor: runningById.has(row.id)
        ? (runningById.get(row.id) as number)
        : null,
    }));
}

/**
 * Apply a {@link TransactionQuery} to a list of transactions. Used server-side
 * to honor `?q=&group=&origin=` and client-side for instant filtering — one
 * definition so both behave identically.
 */
export function filterTransactions<
  T extends Pick<TransactionDTO, 'description' | 'status' | 'origin'>,
>(transactions: readonly T[], query: TransactionQuery = {}): T[] {
  const q = query.q?.trim().toLowerCase();
  return transactions.filter((t) => {
    if (query.group && groupForStatus(t.status) !== query.group) return false;
    if (query.origin && t.origin !== query.origin) return false;
    if (q && !t.description.toLowerCase().includes(q)) return false;
    return true;
  });
}

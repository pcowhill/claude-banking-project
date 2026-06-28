/**
 * Statement-cycle contracts (v0.9.0).
 *
 * Dependency-free and shared by the backend AND the customer app. Now that the
 * simulation clock can advance (see `clock.ts`), statement PERIODS become
 * meaningful: a statement is just a monthly window over the account's posted
 * ledger, summarized read-only. NOTHING is stored — no statement row, no real
 * PDF; balances stay DERIVED. SIMULATION only.
 */
import type { LedgerDirection, LedgerStatus } from './ledger';

/** Statuses that count as SETTLED for statement math (mirrors the ledger rules). */
const SETTLED_STATUSES: readonly LedgerStatus[] = ['posted', 'disputed'];

/** A posted ledger row shaped for statement math: an amount + when it settled. */
export interface StatementEntryLike {
  amountMinor: number;
  direction: LedgerDirection;
  status: LedgerStatus;
  /** Settlement instant (postedAt, falling back to createdAt), as epoch ms. */
  at: number;
}

/** The bounds + label of one monthly statement period (no money yet). */
export interface StatementPeriodBounds {
  /** `YYYY-MM` key for the month. */
  key: string;
  /** Human label, e.g. "June 2026". */
  label: string;
  /** Inclusive start (ISO) — first instant of the month (UTC). */
  startISO: string;
  /** Exclusive end (ISO) — first instant of the next month (UTC). */
  endISO: string;
  startMs: number;
  endMs: number;
}

/** The derived money summary for a period. */
export interface StatementSummary {
  /** Settled balance BEFORE the period began. */
  openingMinor: number;
  /** Settled balance at the period end. */
  closingMinor: number;
  /** Settled credits within the period. */
  creditsMinor: number;
  /** Settled debits within the period. */
  debitsMinor: number;
  /** Number of settled entries within the period. */
  count: number;
}

/** A full statement period DTO (bounds + summary) as returned by the API. */
export type StatementPeriodDTO = StatementPeriodBounds & StatementSummary;

export interface AccountStatementsResponse {
  accountId: string;
  /** As-of (simulation) time the statements were computed at. */
  asOf: string;
  periods: StatementPeriodDTO[];
}

const MONTH_LABEL = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

function startOfUtcMonth(year: number, monthIndex: number): Date {
  return new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0, 0));
}

/**
 * Build `monthsBack` monthly periods ending with the month that CONTAINS `now`
 * (simulation time), newest first. Pure — no entries needed; the caller pairs
 * each with {@link summarizeStatementPeriod}.
 */
export function buildStatementPeriods(now: Date, monthsBack: number): StatementPeriodBounds[] {
  const count = Math.max(1, Math.min(Math.trunc(monthsBack), 36));
  const baseYear = now.getUTCFullYear();
  const baseMonth = now.getUTCMonth();
  const periods: StatementPeriodBounds[] = [];

  for (let i = 0; i < count; i += 1) {
    const start = startOfUtcMonth(baseYear, baseMonth - i);
    const end = startOfUtcMonth(start.getUTCFullYear(), start.getUTCMonth() + 1);
    const key = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, '0')}`;
    periods.push({
      key,
      label: MONTH_LABEL.format(start),
      startISO: start.toISOString(),
      endISO: end.toISOString(),
      startMs: start.getTime(),
      endMs: end.getTime(),
    });
  }
  return periods;
}

function signedSettled(entry: StatementEntryLike): number {
  if (!SETTLED_STATUSES.includes(entry.status)) return 0;
  return entry.direction === 'credit' ? entry.amountMinor : -entry.amountMinor;
}

/**
 * Summarize a period from the account's entries. Opening balance is the settled
 * total of everything BEFORE the period; closing is opening plus the period's net
 * settled movement; credits/debits/count cover settled entries WITHIN the period.
 * Pure.
 */
export function summarizeStatementPeriod(
  entries: readonly StatementEntryLike[],
  period: StatementPeriodBounds,
): StatementSummary {
  let openingMinor = 0;
  let creditsMinor = 0;
  let debitsMinor = 0;
  let count = 0;

  for (const entry of entries) {
    if (!SETTLED_STATUSES.includes(entry.status)) continue;
    if (entry.at < period.startMs) {
      openingMinor += signedSettled(entry);
    } else if (entry.at < period.endMs) {
      if (entry.direction === 'credit') creditsMinor += entry.amountMinor;
      else debitsMinor += entry.amountMinor;
      count += 1;
    }
  }

  return {
    openingMinor,
    closingMinor: openingMinor + creditsMinor - debitsMinor,
    creditsMinor,
    debitsMinor,
    count,
  };
}

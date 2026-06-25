/**
 * The disciplined ledger model.
 *
 * Account balances are NEVER stored as an editable field. They are DERIVED from
 * an append-only list of ledger entries. This module is the single definition
 * of how a list of entries becomes current/available balances, and it is the
 * piece the test suite guards most carefully: money must only move through
 * explicit entries, never by mutating a balance.
 *
 * Conventions:
 *  - `amountMinor` is always a POSITIVE integer in minor units.
 *  - `direction` says whether the entry adds (credit) or removes (debit) value.
 *  - `status` controls how (and whether) the entry affects each balance.
 */
import { assertMinor, type Minor } from './money';

export const LEDGER_DIRECTIONS = ['credit', 'debit'] as const;
export type LedgerDirection = (typeof LEDGER_DIRECTIONS)[number];

export const LEDGER_STATUSES = [
  'pending', // authorized/known but not yet settled
  'posted', // settled and final
  'held', // funds reserved (e.g. authorization hold) — reduces available only
  'failed', // never happened — no balance effect
  'reversed', // undone — no balance effect
  'disputed', // under dispute — treated as posted for now, flagged for review
] as const;
export type LedgerStatus = (typeof LEDGER_STATUSES)[number];

/**
 * How money entered the system. Used to verify the core invariant: customer
 * activity (transfers, payments) must net to zero across the system, and total
 * value only changes via explicit bank-originated events.
 */
export const LEDGER_ORIGINS = [
  'seed', // demo seed funding (bank-originated)
  'interest', // simulated interest accrual (bank-originated)
  'fee', // simulated fee (bank-originated)
  'adjustment', // admin adjustment, requires reason + audit (bank-originated)
  'transfer', // movement between accounts in-system (must net to zero)
  'payment', // bill pay / external movement
  'deposit', // simulated external deposit
  'card', // simulated card activity
] as const;
export type LedgerOrigin = (typeof LEDGER_ORIGINS)[number];

/** Bank-originated origins are the only ones allowed to change system-wide total value. */
export const BANK_ORIGINATED_ORIGINS: readonly LedgerOrigin[] = [
  'seed',
  'interest',
  'fee',
  'adjustment',
  'deposit',
];

export interface LedgerEntryLike {
  amountMinor: Minor;
  direction: LedgerDirection;
  status: LedgerStatus;
}

export interface DerivedBalances {
  /** Posted/settled balance — the "ledger" or current balance. */
  currentMinor: Minor;
  /** Spendable now: current minus holds and pending outflows. */
  availableMinor: Minor;
  /** Pending incoming funds (not yet counted in available). */
  pendingCreditMinor: Minor;
  /** Pending outgoing funds (already reserved out of available). */
  pendingDebitMinor: Minor;
  /** Authorization holds reducing available. */
  heldMinor: Minor;
}

function signed(entry: LedgerEntryLike): Minor {
  return entry.direction === 'credit' ? entry.amountMinor : -entry.amountMinor;
}

/**
 * Derive current and available balances from a list of ledger entries.
 *
 * Rules:
 *  - posted:   affects current AND available.
 *  - pending:  credits are tracked but NOT added to available (conservative);
 *              debits are reserved out of available immediately.
 *  - held:     reduces available by the amount, does not change current.
 *  - failed / reversed: no effect on any balance.
 *  - disputed: treated like posted for balance purposes (flagged elsewhere).
 */
export function deriveBalances(entries: readonly LedgerEntryLike[]): DerivedBalances {
  let currentMinor = 0;
  let availableMinor = 0;
  let pendingCreditMinor = 0;
  let pendingDebitMinor = 0;
  let heldMinor = 0;

  for (const entry of entries) {
    assertMinor(entry.amountMinor, 'ledger amount');
    if (entry.amountMinor < 0) {
      throw new Error('ledger amountMinor must be positive; use `direction` to indicate sign');
    }

    switch (entry.status) {
      case 'posted':
      case 'disputed': {
        const delta = signed(entry);
        currentMinor += delta;
        availableMinor += delta;
        break;
      }
      case 'pending': {
        if (entry.direction === 'credit') {
          pendingCreditMinor += entry.amountMinor;
        } else {
          pendingDebitMinor += entry.amountMinor;
          availableMinor -= entry.amountMinor;
        }
        break;
      }
      case 'held': {
        heldMinor += entry.amountMinor;
        availableMinor -= entry.amountMinor;
        break;
      }
      case 'failed':
      case 'reversed':
        // No balance effect.
        break;
    }
  }

  return { currentMinor, availableMinor, pendingCreditMinor, pendingDebitMinor, heldMinor };
}

/**
 * Net signed total of POSTED + DISPUTED entries — the value that actually
 * settled. Summed across every account in the system this is the "money supply"
 * and may only change via bank-originated entries (see BANK_ORIGINATED_ORIGINS).
 */
export function settledTotalMinor(entries: readonly LedgerEntryLike[]): Minor {
  let total = 0;
  for (const entry of entries) {
    if (entry.status === 'posted' || entry.status === 'disputed') {
      total += signed(entry);
    }
  }
  return total;
}

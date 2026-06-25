import {
  BANK_ORIGINATED_ORIGINS,
  toMinor,
  type AccountType,
  type LedgerDirection,
  type LedgerOrigin,
  type LedgerStatus,
  type UserRole,
} from '@simbank/shared';

/**
 * The seed PLAN is a pure description of the demo data. It is kept separate from
 * the DB writes (prisma/seed.ts) so its money invariants can be unit-tested
 * without a database (see seed-plan.test.ts). This is the foundation of the
 * project's "money cannot magically appear" discipline.
 */
export interface SeedLedgerEntry {
  accountKey: string;
  amountMinor: number;
  direction: LedgerDirection;
  status: LedgerStatus;
  origin: LedgerOrigin;
  description: string;
}

export interface SeedAccount {
  key: string;
  type: AccountType;
  name: string;
}

export interface SeedUser {
  email: string;
  displayName: string;
  role: UserRole;
  accounts: SeedAccount[];
}

export interface SeedPlan {
  users: SeedUser[];
  entries: SeedLedgerEntry[];
}

export function buildSeedPlan(): SeedPlan {
  const users: SeedUser[] = [
    {
      email: 'avery.customer@example.com',
      displayName: 'Avery Customer',
      role: 'customer',
      accounts: [
        { key: 'avery-checking', type: 'checking', name: 'Everyday Checking' },
        { key: 'avery-savings', type: 'savings', name: 'Goal Savings' },
      ],
    },
    {
      email: 'sam.operator@example.com',
      displayName: 'Sam Operator',
      role: 'ops_agent',
      accounts: [],
    },
  ];

  const entries: SeedLedgerEntry[] = [
    // --- Bank-originated funding (the ONLY way value enters the system) ------
    {
      accountKey: 'avery-checking',
      amountMinor: toMinor(2500),
      direction: 'credit',
      status: 'posted',
      origin: 'seed',
      description: 'Opening deposit (seed funding)',
    },
    {
      accountKey: 'avery-savings',
      amountMinor: toMinor(5000),
      direction: 'credit',
      status: 'posted',
      origin: 'seed',
      description: 'Opening deposit (seed funding)',
    },
    // --- Posted everyday spending ------------------------------------------
    {
      accountKey: 'avery-checking',
      amountMinor: toMinor(84.2),
      direction: 'debit',
      status: 'posted',
      origin: 'payment',
      description: 'Groceries — Simmons Market',
    },
    // --- A pending card hold (reduces available, not current) --------------
    {
      accountKey: 'avery-checking',
      amountMinor: toMinor(25),
      direction: 'debit',
      status: 'pending',
      origin: 'card',
      description: 'Coffee Roasters (pending authorization)',
    },
    // --- Internal transfer checking -> savings (nets to zero system-wide) --
    {
      accountKey: 'avery-checking',
      amountMinor: toMinor(200),
      direction: 'debit',
      status: 'posted',
      origin: 'transfer',
      description: 'Transfer to Goal Savings',
    },
    {
      accountKey: 'avery-savings',
      amountMinor: toMinor(200),
      direction: 'credit',
      status: 'posted',
      origin: 'transfer',
      description: 'Transfer from Everyday Checking',
    },
    // --- Bank-originated interest accrual ----------------------------------
    {
      accountKey: 'avery-savings',
      amountMinor: toMinor(4.17),
      direction: 'credit',
      status: 'posted',
      origin: 'interest',
      description: 'Monthly interest (simulated)',
    },
  ];

  return { users, entries };
}

/**
 * Money-integrity invariants the seed must satisfy. Throws on violation. Shared
 * by the seed script (prisma/seed.ts) and the unit test so both enforce the
 * exact same rules.
 *
 *  1. Internal transfers net to zero across accounts — moving funds creates nothing.
 *  2. Every settled CREDIT is explainable: it is a bank-originated event
 *     (seed/interest/deposit/...) or one leg of a balanced transfer. Money never
 *     appears in an account from nowhere.
 */
export function assertSeedInvariants(plan: SeedPlan): void {
  const settled = plan.entries.filter((e) => e.status === 'posted' || e.status === 'disputed');

  const transferNet = settled
    .filter((e) => e.origin === 'transfer')
    .reduce((sum, e) => sum + (e.direction === 'credit' ? e.amountMinor : -e.amountMinor), 0);
  if (transferNet !== 0) {
    throw new Error(`Seed invariant violated: transfers do not net to zero (net ${transferNet}).`);
  }

  const unexplained = settled.find(
    (e) =>
      e.direction === 'credit' &&
      e.origin !== 'transfer' &&
      !BANK_ORIGINATED_ORIGINS.includes(e.origin),
  );
  if (unexplained) {
    throw new Error(
      `Seed invariant violated: a credit appeared from a non-bank, non-transfer origin '${unexplained.origin}'.`,
    );
  }
}

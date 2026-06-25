import {
  ACCOUNT_RELATIONSHIPS,
  BANK_ORIGINATED_ORIGINS,
  toMinor,
  type AccountRelationship,
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
  /**
   * NON-SECRET demo password (SIMULATION ONLY). Stored in the repo on purpose so
   * a reviewer can sign in to each role. The seed writer hashes it with bcrypt
   * before it ever touches the database — the plaintext is never persisted.
   */
  password: string;
  accounts: SeedAccount[];
}

/** A non-owner access grant (joint customer / authorized user). */
export interface SeedAccess {
  userEmail: string;
  accountKey: string;
  relationship: AccountRelationship;
}

export interface SeedPlan {
  users: SeedUser[];
  entries: SeedLedgerEntry[];
  access: SeedAccess[];
}

export function buildSeedPlan(): SeedPlan {
  const users: SeedUser[] = [
    {
      email: 'avery.customer@example.com',
      displayName: 'Avery Customer',
      role: 'customer',
      password: 'Customer123!',
      accounts: [
        { key: 'avery-checking', type: 'checking', name: 'Everyday Checking' },
        { key: 'avery-savings', type: 'savings', name: 'Goal Savings' },
      ],
    },
    {
      email: 'jordan.joint@example.com',
      displayName: 'Jordan Joint',
      role: 'joint_customer',
      password: 'Joint123!',
      // No owned accounts — joint access to Avery's checking only (see `access`).
      accounts: [],
    },
    {
      email: 'sam.operator@example.com',
      displayName: 'Sam Operator',
      role: 'ops_agent',
      password: 'Operator123!',
      accounts: [],
    },
    {
      email: 'riley.admin@example.com',
      displayName: 'Riley Admin',
      role: 'admin',
      password: 'Admin123!',
      accounts: [],
    },
  ];

  // Non-owner access grants. Jordan (joint customer) can see ONLY Avery's
  // checking, NOT the savings — this is the data behind the RBAC ownership tests.
  const access: SeedAccess[] = [
    { userEmail: 'jordan.joint@example.com', accountKey: 'avery-checking', relationship: 'joint' },
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

  return { users, entries, access };
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

/**
 * Auth/access integrity invariants the seed must satisfy. Throws on violation.
 * Keeps the demo-user + access-grant data internally consistent so the RBAC
 * tests rest on a sound fixture.
 *
 *  1. Every user has a unique email and a non-empty demo password.
 *  2. Every access grant references a declared user and a declared account key,
 *     with a known relationship.
 */
export function assertSeedAccessIntegrity(plan: SeedPlan): void {
  const emails = new Set<string>();
  for (const user of plan.users) {
    const email = user.email.toLowerCase();
    if (emails.has(email)) {
      throw new Error(`Seed invariant violated: duplicate user email '${user.email}'.`);
    }
    emails.add(email);
    if (!user.password || user.password.length < 8) {
      throw new Error(
        `Seed invariant violated: user '${user.email}' is missing a (>=8 char) demo password.`,
      );
    }
  }

  const accountKeys = new Set(plan.users.flatMap((u) => u.accounts.map((a) => a.key)));
  for (const grant of plan.access) {
    if (!emails.has(grant.userEmail.toLowerCase())) {
      throw new Error(
        `Seed invariant violated: access grant references unknown user '${grant.userEmail}'.`,
      );
    }
    if (!accountKeys.has(grant.accountKey)) {
      throw new Error(
        `Seed invariant violated: access grant references unknown account key '${grant.accountKey}'.`,
      );
    }
    if (!ACCOUNT_RELATIONSHIPS.includes(grant.relationship)) {
      throw new Error(
        `Seed invariant violated: access grant has unknown relationship '${grant.relationship}'.`,
      );
    }
  }
}

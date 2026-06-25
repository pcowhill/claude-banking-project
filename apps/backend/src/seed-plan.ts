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
  /**
   * How many days before "seed time" this entry is dated (default 0 = today).
   * The seed writer turns this into the entry's `createdAt`/`postedAt`, so the
   * demo dashboard shows a realistic, statement-like history with a running
   * balance — and the data stays fresh on every `db:reset`.
   */
  daysAgo?: number;
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

  // Entries are built with small paired helpers so amounts stay consistent and
  // transfers always balance. `daysAgo` dates each entry so the dashboard shows
  // ~3 months of statement-like history with a running balance. The money
  // invariants below still hold: value enters ONLY via bank-originated events
  // (seed/deposit/interest/fee), and every transfer posts both legs.
  const CHECKING = 'avery-checking';
  const SAVINGS = 'avery-savings';
  const entries: SeedLedgerEntry[] = [];

  const post = (
    accountKey: string,
    major: number,
    direction: LedgerDirection,
    origin: LedgerOrigin,
    description: string,
    daysAgo: number,
  ): void => {
    entries.push({ accountKey, amountMinor: toMinor(major), direction, status: 'posted', origin, description, daysAgo });
  };
  const credit = (accountKey: string, major: number, origin: LedgerOrigin, description: string, daysAgo: number): void =>
    post(accountKey, major, 'credit', origin, description, daysAgo);
  const debit = (accountKey: string, major: number, origin: LedgerOrigin, description: string, daysAgo: number): void =>
    post(accountKey, major, 'debit', origin, description, daysAgo);
  /** A balanced internal transfer: debit one account, credit the other, same amount + date. */
  const transfer = (
    fromKey: string,
    toKey: string,
    major: number,
    daysAgo: number,
    fromDescription: string,
    toDescription: string,
  ): void => {
    debit(fromKey, major, 'transfer', fromDescription, daysAgo);
    credit(toKey, major, 'transfer', toDescription, daysAgo);
  };
  const unsettled = (
    accountKey: string,
    major: number,
    direction: LedgerDirection,
    status: 'pending' | 'held',
    origin: LedgerOrigin,
    description: string,
    daysAgo: number,
  ): void => {
    entries.push({ accountKey, amountMinor: toMinor(major), direction, status, origin, description, daysAgo });
  };

  // --- Opening (bank-originated seed funding) --------------------------------
  credit(CHECKING, 2500, 'seed', 'Opening deposit (seed funding)', 90);
  credit(SAVINGS, 5000, 'seed', 'Opening deposit (seed funding)', 90);

  // --- Recurring payroll (simulated direct deposit) --------------------------
  for (const d of [84, 70, 56, 42, 28, 14]) {
    credit(CHECKING, 2400, 'deposit', 'Payroll — Northwind Traders (direct deposit)', d);
  }

  // --- Rent (monthly) --------------------------------------------------------
  for (const d of [80, 50, 20]) {
    debit(CHECKING, 1450, 'payment', 'Rent — Maple Court Apartments', d);
  }

  // --- Groceries (same merchant — good for search demos) ---------------------
  debit(CHECKING, 84.2, 'payment', 'Groceries — Simmons Market', 78);
  debit(CHECKING, 52.75, 'payment', 'Groceries — Simmons Market', 64);
  debit(CHECKING, 118.4, 'payment', 'Groceries — Simmons Market', 47);
  debit(CHECKING, 76.1, 'payment', 'Groceries — Simmons Market', 33);
  debit(CHECKING, 94.3, 'payment', 'Groceries — Simmons Market', 19);
  debit(CHECKING, 61.2, 'payment', 'Groceries — Simmons Market', 6);

  // --- Utilities -------------------------------------------------------------
  debit(CHECKING, 132.45, 'payment', 'City Power & Light', 76);
  debit(CHECKING, 121.3, 'payment', 'City Power & Light', 46);
  debit(CHECKING, 140.1, 'payment', 'City Power & Light', 16);
  debit(CHECKING, 38.9, 'payment', 'Metro Water Services', 74);
  debit(CHECKING, 41.2, 'payment', 'Metro Water Services', 44);
  debit(CHECKING, 44.05, 'payment', 'Metro Water Services', 13);
  debit(CHECKING, 60, 'payment', 'Cellular — RidgeMobile', 72);
  debit(CHECKING, 60, 'payment', 'Cellular — RidgeMobile', 42);
  debit(CHECKING, 60, 'payment', 'Cellular — RidgeMobile', 12);

  // --- Subscriptions ---------------------------------------------------------
  for (const d of [70, 40, 10]) debit(CHECKING, 15.99, 'payment', 'Streamflix subscription', d);
  for (const d of [68, 38, 8]) debit(CHECKING, 9.99, 'payment', 'CloudTunes membership', d);

  // --- Card spending (posted) ------------------------------------------------
  debit(CHECKING, 5.25, 'card', 'Coffee Roasters', 60);
  debit(CHECKING, 5.75, 'card', 'Coffee Roasters', 35);
  debit(CHECKING, 6.1, 'card', 'Coffee Roasters', 9);
  debit(CHECKING, 42.1, 'card', 'Trattoria Romana', 55);
  debit(CHECKING, 38.75, 'card', 'Trattoria Romana', 25);
  debit(CHECKING, 44.3, 'card', 'QuickFuel', 50);
  debit(CHECKING, 48.9, 'card', 'QuickFuel', 22);
  debit(CHECKING, 60, 'card', 'ATM withdrawal — Main & 3rd', 36);

  // --- A simulated fee + a refund (both bank-originated) ----------------------
  debit(CHECKING, 2, 'fee', 'Paper statement fee', 30);
  credit(CHECKING, 12.4, 'deposit', 'Refund — Simmons Market', 26);

  // --- Internal transfers (each posts BOTH legs → nets to zero) --------------
  for (const d of [80, 50, 20]) {
    transfer(CHECKING, SAVINGS, 200, d, 'Transfer to Goal Savings', 'Transfer from Everyday Checking');
  }
  transfer(SAVINGS, CHECKING, 150, 15, 'Transfer to Everyday Checking', 'Transfer from Goal Savings');

  // --- Bank-originated interest accrual on savings ---------------------------
  credit(SAVINGS, 4.17, 'interest', 'Monthly interest (simulated)', 60);
  credit(SAVINGS, 4.19, 'interest', 'Monthly interest (simulated)', 30);
  credit(SAVINGS, 4.21, 'interest', 'Monthly interest (simulated)', 2);

  // --- Current pending / held activity (reduces AVAILABLE, not current) ------
  unsettled(CHECKING, 5.75, 'debit', 'pending', 'card', 'Coffee Roasters (pending authorization)', 0);
  unsettled(CHECKING, 320, 'credit', 'pending', 'deposit', 'Mobile check deposit (pending)', 1);
  unsettled(CHECKING, 75, 'debit', 'held', 'card', 'Rental hold — DriveEasy Cars', 2);

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

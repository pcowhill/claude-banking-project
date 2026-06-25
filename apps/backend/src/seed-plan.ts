import {
  ACCOUNT_RELATIONSHIPS,
  BANK_ORIGINATED_ORIGINS,
  OPS_REQUEST_PRIORITIES,
  OPS_REQUEST_STATUSES,
  OPS_REQUEST_TYPES,
  SIM_EVENT_CHANNELS,
  SIM_EVENT_DIRECTIONS,
  SIM_EVENT_STATUSES,
  toMinor,
  type AccountRelationship,
  type AccountType,
  type LedgerDirection,
  type LedgerOrigin,
  type LedgerStatus,
  type OpsRequestPriority,
  type OpsRequestStatus,
  type OpsRequestType,
  type SimEventChannel,
  type SimEventDirection,
  type SimEventStatus,
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

/**
 * A pending work item for the operations queue (v0.5.0). Seeded so the console
 * has a realistic queue to act on. SIMULATION: these are workflow items only —
 * acting on them never moves money.
 */
export interface SeedOperationsRequest {
  /** Stable key so a seeded simulated event can reference its request. */
  key: string;
  type: OpsRequestType;
  status?: OpsRequestStatus; // default 'pending'
  priority?: OpsRequestPriority; // default 'normal'
  summary: string;
  detail?: string;
  subjectName?: string;
  subjectEmail?: string;
  payload?: Record<string, unknown>;
  /** Days before "seed time" the request was raised (default 0 = today). */
  daysAgo?: number;
}

/** A seeded SIMULATED external event (SMS/email/MFA/identity). Never a real provider. */
export interface SeedSimulatedEvent {
  channel: SimEventChannel;
  direction?: SimEventDirection; // default 'outbound'
  kind?: string;
  status?: SimEventStatus; // default 'sent'
  summary: string;
  detail?: string;
  /** Links to a {@link SeedOperationsRequest.key}, if any. */
  requestKey?: string;
  /** Minutes before "seed time" the event occurred (default 0 = now). */
  minutesAgo?: number;
}

export interface SeedPlan {
  users: SeedUser[];
  entries: SeedLedgerEntry[];
  access: SeedAccess[];
  operationsRequests: SeedOperationsRequest[];
  simulatedEvents: SeedSimulatedEvent[];
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

  // --- Operations queue (v0.5.0) --------------------------------------------
  // A realistic, varied queue for the operations console. SIMULATION: these are
  // workflow items — acting on them changes their status + writes an audit row,
  // and never posts to the ledger. Most are `pending`; a couple sit in non-terminal
  // `on_hold` / `info_requested` so the demo shows the full action set in use.
  const AVERY = 'Avery Customer';
  const AVERY_EMAIL = 'avery.customer@example.com';
  const operationsRequests: SeedOperationsRequest[] = [
    {
      key: 'identity-newdevice',
      type: 'identity_verification',
      priority: 'high',
      summary: 'Identity check — sign-in from a new device',
      detail: 'A login from an unrecognized device needs an operator to confirm identity before full access.',
      subjectName: AVERY,
      subjectEmail: AVERY_EMAIL,
      payload: { device: 'iPhone 15 (simulated)', location: 'Springfield, IL (simulated)' },
      daysAgo: 0,
    },
    {
      key: 'mfa-login',
      type: 'mfa',
      summary: 'MFA passcode requested at sign-in',
      detail: 'Customer requested a one-time passcode to complete login.',
      subjectName: AVERY,
      subjectEmail: AVERY_EMAIL,
      daysAgo: 0,
    },
    {
      key: 'fraud-card',
      type: 'fraud_alert',
      priority: 'high',
      summary: 'Unusual card activity flagged — QuickFuel',
      detail: 'A fuel purchase fell outside the usual spending pattern and was flagged for review.',
      subjectName: AVERY,
      subjectEmail: AVERY_EMAIL,
      payload: { merchant: 'QuickFuel', amountMinor: 4890 },
      daysAgo: 0,
    },
    {
      key: 'deposit-mobilecheck',
      type: 'deposit',
      summary: 'Mobile check deposit awaiting review ($320.00)',
      detail: 'A mobile check deposit is pending operator review before the hold is released.',
      subjectName: AVERY,
      subjectEmail: AVERY_EMAIL,
      payload: { amountMinor: 32000, instrument: 'mobile_check' },
      daysAgo: 1,
    },
    {
      key: 'support-deposit',
      type: 'support_message',
      priority: 'low',
      summary: 'Question about a pending deposit',
      detail: 'Customer asks when their pending mobile check deposit will be available.',
      subjectName: AVERY,
      subjectEmail: AVERY_EMAIL,
      daysAgo: 1,
    },
    {
      key: 'extacct-verify',
      type: 'external_account_verification',
      summary: 'Micro-deposit verification — external bank',
      detail: 'Two small simulated micro-deposits were sent to verify an external account.',
      subjectName: AVERY,
      subjectEmail: AVERY_EMAIL,
      daysAgo: 1,
    },
    {
      key: 'pwreset-jordan',
      type: 'password_reset',
      summary: 'Password reset requested',
      detail: 'Joint customer requested a password reset link.',
      subjectName: 'Jordan Joint',
      subjectEmail: 'jordan.joint@example.com',
      daysAgo: 0,
    },
    {
      key: 'onboarding-taylor',
      type: 'onboarding',
      summary: 'New account application — Everyday Checking',
      detail: 'A prospective customer applied to open an Everyday Checking account.',
      subjectName: 'Taylor Prospect',
      subjectEmail: 'taylor.prospect@example.com',
      payload: { product: 'Everyday Checking' },
      daysAgo: 1,
    },
    {
      key: 'ach-outbound',
      type: 'ach',
      status: 'on_hold',
      summary: 'Outbound ACH needs review ($450.00)',
      detail: 'An outbound ACH transfer is on hold pending operator review.',
      subjectName: AVERY,
      subjectEmail: AVERY_EMAIL,
      payload: { amountMinor: 45000, direction: 'outbound' },
      daysAgo: 2,
    },
    {
      key: 'dispute-trattoria',
      type: 'dispute',
      status: 'info_requested',
      summary: 'Disputed card charge — Trattoria Romana ($42.10)',
      detail: 'Customer disputes a dining charge; additional information has been requested.',
      subjectName: AVERY,
      subjectEmail: AVERY_EMAIL,
      payload: { merchant: 'Trattoria Romana', amountMinor: 4210 },
      daysAgo: 3,
    },
  ];

  // A few SIMULATED external events already on the feed (clearly fake). These are
  // recorded, never sent — no real SMS/email/MFA/identity provider is contacted.
  const simulatedEvents: SeedSimulatedEvent[] = [
    {
      channel: 'sms',
      kind: 'otp',
      status: 'delivered',
      summary: 'One-time passcode sent (simulated)',
      detail: 'Simulated SMS passcode delivered to the customer to complete sign-in.',
      requestKey: 'mfa-login',
      minutesAgo: 6,
    },
    {
      channel: 'identity',
      kind: 'verification',
      status: 'pending',
      summary: 'Identity verification link issued (simulated)',
      detail: 'Simulated identity-verification link issued for the new-device sign-in.',
      requestKey: 'identity-newdevice',
      minutesAgo: 20,
    },
    {
      channel: 'email',
      kind: 'notification',
      status: 'sent',
      summary: 'New-device sign-in notice emailed (simulated)',
      detail: 'Simulated email notifying the customer of a sign-in from a new device.',
      requestKey: 'identity-newdevice',
      minutesAgo: 22,
    },
    {
      channel: 'email',
      kind: 'notification',
      status: 'delivered',
      summary: 'Deposit-received confirmation emailed (simulated)',
      detail: 'Simulated confirmation that a mobile check deposit was received and is in review.',
      requestKey: 'deposit-mobilecheck',
      minutesAgo: 120,
    },
  ];

  return { users, entries, access, operationsRequests, simulatedEvents };
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

/**
 * Operations-queue integrity invariants the seed must satisfy. Throws on
 * violation. Keeps the seeded ops requests + simulated events internally
 * consistent (known enum values, unique keys, valid event→request links) so the
 * operations console + RBAC tests rest on a sound fixture.
 */
export function assertSeedOpsIntegrity(plan: SeedPlan): void {
  const keys = new Set<string>();
  for (const request of plan.operationsRequests) {
    if (keys.has(request.key)) {
      throw new Error(`Seed invariant violated: duplicate operations request key '${request.key}'.`);
    }
    keys.add(request.key);
    if (!OPS_REQUEST_TYPES.includes(request.type)) {
      throw new Error(`Seed invariant violated: unknown ops request type '${request.type}'.`);
    }
    if (request.status && !OPS_REQUEST_STATUSES.includes(request.status)) {
      throw new Error(`Seed invariant violated: unknown ops request status '${request.status}'.`);
    }
    if (request.priority && !OPS_REQUEST_PRIORITIES.includes(request.priority)) {
      throw new Error(`Seed invariant violated: unknown ops request priority '${request.priority}'.`);
    }
  }

  for (const event of plan.simulatedEvents) {
    if (!SIM_EVENT_CHANNELS.includes(event.channel)) {
      throw new Error(`Seed invariant violated: unknown simulated-event channel '${event.channel}'.`);
    }
    if (event.direction && !SIM_EVENT_DIRECTIONS.includes(event.direction)) {
      throw new Error(`Seed invariant violated: unknown simulated-event direction '${event.direction}'.`);
    }
    if (event.status && !SIM_EVENT_STATUSES.includes(event.status)) {
      throw new Error(`Seed invariant violated: unknown simulated-event status '${event.status}'.`);
    }
    if (event.requestKey && !keys.has(event.requestKey)) {
      throw new Error(
        `Seed invariant violated: simulated event references unknown request key '${event.requestKey}'.`,
      );
    }
  }
}

import {
  ACCOUNT_RELATIONSHIPS,
  BANK_ORIGINATED_ORIGINS,
  INVITATION_STATUSES,
  ONBOARDING_PRODUCTS,
  OPS_REQUEST_PRIORITIES,
  OPS_REQUEST_STATUSES,
  OPS_REQUEST_TYPES,
  REVIEWABLE_MOVEMENT_OPS_TYPE,
  SCHEDULE_FREQUENCIES,
  SCHEDULE_KINDS,
  SCHEDULE_LIMITS,
  SIM_EVENT_CHANNELS,
  SIM_EVENT_DIRECTIONS,
  SIM_EVENT_STATUSES,
  toMinor,
  CARD_NETWORKS,
  CARD_STATUSES,
  CARD_TYPES,
  amortizedPaymentMinor,
  cdApyForTerm,
  loanApyForTerm,
  LENDING_KINDS,
  LENDING_LIMITS,
  type AccountRelationship,
  type AccountType,
  type LendingKind,
  type CardNetwork,
  type CardStatus,
  type CardType,
  type InvitationStatus,
  type LedgerDirection,
  type LedgerOrigin,
  type LedgerStatus,
  type OnboardingProduct,
  type OpsRequestPriority,
  type OpsRequestStatus,
  type OpsRequestType,
  type ScheduleFrequency,
  type ScheduleKind,
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
  /**
   * Optional stable key (v0.7.0) so a reviewable money-movement queue item can be
   * LINKED to the pending ledger entry it will post on approval (see
   * {@link SeedOperationsRequest.linkLedgerEntryKeys}). Must be unique.
   */
  key?: string;
}

export interface SeedAccount {
  key: string;
  type: AccountType;
  name: string;
}

/**
 * A seeded SIMULATED card (v0.8.0). Gives the demo a card to freeze / report /
 * add travel notices to, and a target for the seeded fraud alert to freeze.
 * SIMULATION: `last4` is fake; there is never a real PAN or network.
 */
export interface SeedCard {
  /** Stable key so a seeded fraud alert can reference the card it concerns. */
  key: string;
  accountKey: string;
  cardholderEmail: string;
  cardType: CardType;
  network: CardNetwork;
  last4: string;
  /** Whole years from "seed time" the card expires (default 4). */
  expiresInYears?: number;
  status?: CardStatus; // default 'active'
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
  /**
   * Optional {@link SeedLedgerEntry.key}s of the pending ledger entries this
   * (reviewable money-movement) request will post on approval (v0.7.0). The seed
   * writer resolves them to real ids and merges them into the request payload's
   * `ledgerEntryIds`, so approving the seeded item posts the seeded pending entry.
   */
  linkLedgerEntryKeys?: string[];
  /**
   * Optional SINGLE links (v0.8.0) used by fraud + dispute items. The seed writer
   * resolves `linkLedgerEntryKey` to a real id and merges `ledgerEntryId` (plus
   * the entry's `accountId`/`amountMinor` when absent) into the payload; it
   * resolves `linkCardKey` to a real card id and merges `cardId`. This is what
   * lets the seeded fraud alert reverse + freeze, and the seeded dispute reverse,
   * end-to-end.
   */
  linkLedgerEntryKey?: string;
  linkCardKey?: string;
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

/**
 * A seeded onboarding APPLICATION (v0.6.0), linked 1:1 to a seeded `onboarding`
 * operations request so a reviewer can approve it end-to-end (which provisions a
 * user + account + initial funding). SIMULATION: the password is a non-secret
 * demo value, hashed by the seed writer before it touches the database.
 */
export interface SeedOnboardingApplication {
  /** The {@link SeedOperationsRequest.key} of the `onboarding` request this backs. */
  requestKey: string;
  reference: string;
  fullName: string;
  email: string;
  product: OnboardingProduct;
  initialFundingMinor: number;
  jointInviteEmail?: string | null;
  /** Non-secret demo password (SIMULATION); hashed by the seed writer. */
  password: string;
}

/**
 * A seeded joint-owner INVITATION (v0.6.0). Lets the demo show accept/decline
 * turning into an `AccountAccess` grant. SIMULATION: never a real email.
 */
export interface SeedInvitation {
  accountKey: string;
  inviterEmail: string;
  inviteeEmail: string;
  relationship: AccountRelationship;
  status?: InvitationStatus; // default 'pending'
}

/**
 * A seeded SIMULATED recurring/scheduled payment (v0.9.0). Owned by a demo user
 * on one of their accounts; due `firstRunInDays` after seed time so a small clock
 * advance FIRES it (an internal transfer posts both legs; a bill pay queues a
 * pending review). Firing only happens through the money service — this row just
 * holds the instruction.
 */
export interface SeedSchedule {
  ownerEmail: string;
  kind: ScheduleKind;
  fromAccountKey: string;
  toAccountKey?: string; // required for internal_transfer
  counterparty?: string; // required for bill_pay
  memo?: string;
  amountMinor: number;
  frequency: ScheduleFrequency;
  /** Days after seed time the first run is due. */
  firstRunInDays: number;
}

/**
 * A SIMULATED lending/deposit product (v1.0.0): a CD or a loan layered onto a new
 * `cd`/`loan` account. At seed time the principal moves as a NET-ZERO `transfer`
 * pair (the same discipline the live service uses) — for a CD the funding account
 * is debited and the CD account credited; for a loan the loan account is debited
 * (it carries the negative owed balance) and the disbursement account credited.
 * Interest accrues later via the clock-driven accrual driver. No money is minted.
 */
export interface SeedLending {
  key: string;
  /** The new `cd`/`loan` account's key (addressable for assertions). */
  accountKey: string;
  kind: LendingKind;
  ownerEmail: string;
  name: string;
  /** CD: the funding account (debited). Loan: the disbursement account (credited). */
  counterpartyAccountKey: string;
  principalMinor: number;
  apyBps: number;
  termMonths: number;
  /** Loan: the level monthly payment. CD: null. */
  paymentMinor: number | null;
}

export interface SeedPlan {
  users: SeedUser[];
  entries: SeedLedgerEntry[];
  access: SeedAccess[];
  cards: SeedCard[];
  operationsRequests: SeedOperationsRequest[];
  simulatedEvents: SeedSimulatedEvent[];
  onboardingApplications: SeedOnboardingApplication[];
  invitations: SeedInvitation[];
  schedules: SeedSchedule[];
  lending: SeedLending[];
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
    key?: string,
  ): void => {
    entries.push({ accountKey, amountMinor: toMinor(major), direction, status, origin, description, daysAgo, key });
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
  // Trattoria 42.10 is seeded as DISPUTED — it backs the open `dispute-trattoria`
  // queue item (info_requested), so the demo shows a transaction mid-dispute that
  // an operator can uphold (reverse) or deny.
  entries.push({ accountKey: CHECKING, amountMinor: toMinor(42.1), direction: 'debit', status: 'disputed', origin: 'card', description: 'Trattoria Romana', daysAgo: 55, key: 'card-trattoria' });
  debit(CHECKING, 38.75, 'card', 'Trattoria Romana', 25);
  debit(CHECKING, 44.3, 'card', 'QuickFuel', 50);
  // QuickFuel 48.90 is keyed so the seeded fraud alert can reverse it on "confirm fraud".
  entries.push({ accountKey: CHECKING, amountMinor: toMinor(48.9), direction: 'debit', status: 'posted', origin: 'card', description: 'QuickFuel', daysAgo: 22, key: 'card-quickfuel' });
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
  unsettled(CHECKING, 75, 'debit', 'held', 'card', 'Rental hold — DriveEasy Cars', 2);

  // --- Reviewable money movements (v0.7.0): each is a PENDING ledger entry that
  //     its linked ops queue item posts on operator APPROVAL (pending → posted).
  //     Keyed so the seed writer can wire the request → entry link.
  unsettled(CHECKING, 320, 'credit', 'pending', 'deposit', 'Mobile check deposit', 1, 'pending-mobilecheck');
  unsettled(CHECKING, 450, 'debit', 'pending', 'payment', 'ACH payment to External Savings ••1234', 2, 'pending-ach-outbound');
  unsettled(CHECKING, 75.5, 'debit', 'pending', 'payment', 'Bill payment — City Power & Light', 0, 'pending-billpay');

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
      detail:
        'A fuel purchase fell outside the usual spending pattern and was flagged for review. The customer can confirm it was them or report fraud; an operator confirming fraud REVERSES the charge and FREEZES the card (simulated).',
      subjectName: AVERY,
      subjectEmail: AVERY_EMAIL,
      // v0.8.0 fraud payload — `ledgerEntryId`/`cardId` are filled by the seed
      // writer from the links below, so confirming fraud reverses + freezes.
      payload: { merchant: 'QuickFuel', amountMinor: 4890 },
      linkLedgerEntryKey: 'card-quickfuel',
      linkCardKey: 'card-debit',
      daysAgo: 0,
    },
    {
      key: 'deposit-mobilecheck',
      type: 'deposit',
      summary: 'Mobile check deposit awaiting review ($320.00)',
      detail:
        'A mobile check deposit is pending operator review. Approving POSTS the deposit (pending → posted) so it stops reading “Pending” and the available balance updates (simulated).',
      subjectName: AVERY,
      subjectEmail: AVERY_EMAIL,
      // v0.7.0 money-movement payload — `ledgerEntryIds` is filled by the seed
      // writer from `linkLedgerEntryKeys` so approving this item posts the
      // linked pending deposit (the carried-forward Q-01).
      payload: {
        kind: 'mobile_check_deposit',
        amountMinor: 32000,
        direction: 'inbound',
        accountId: '',
        counterparty: null,
        memo: null,
        ledgerEntryIds: [],
        reference: 'MOV-SEED01',
      },
      linkLedgerEntryKeys: ['pending-mobilecheck'],
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
      detail:
        'A prospective customer applied to open an Everyday Checking account (simulated). Approving this request provisions the account and posts the opening deposit.',
      subjectName: 'Taylor Prospect',
      subjectEmail: 'taylor.prospect@example.com',
      // Runtime onboarding context (matches what the open-account flow stores), so
      // the operator console can show product + funding and approve it end-to-end.
      payload: {
        reference: 'MER-SEED01',
        product: 'checking',
        initialFundingMinor: 25_000,
        jointInviteEmail: null,
      },
      daysAgo: 1,
    },
    {
      key: 'ach-outbound',
      type: 'ach',
      status: 'on_hold',
      summary: 'Outbound ACH needs review ($450.00)',
      detail:
        'An outbound ACH transfer is on hold pending operator review. Approving POSTS the debit; rejecting marks it failed and releases the reserved funds (simulated).',
      subjectName: AVERY,
      subjectEmail: AVERY_EMAIL,
      payload: {
        kind: 'external_ach',
        amountMinor: 45000,
        direction: 'outbound',
        accountId: '',
        counterparty: 'External Savings ••1234',
        memo: null,
        ledgerEntryIds: [],
        reference: 'MOV-SEED02',
      },
      linkLedgerEntryKeys: ['pending-ach-outbound'],
      daysAgo: 2,
    },
    {
      key: 'billpay-citypower',
      type: 'bill_pay',
      summary: 'Bill payment to City Power & Light ($75.50)',
      detail:
        'A bill payment is awaiting operator review before it posts to the ledger (simulated). Approving posts the debit.',
      subjectName: AVERY,
      subjectEmail: AVERY_EMAIL,
      payload: {
        kind: 'bill_pay',
        amountMinor: 7550,
        direction: 'outbound',
        accountId: '',
        counterparty: 'City Power & Light',
        memo: null,
        ledgerEntryIds: [],
        reference: 'MOV-SEED03',
      },
      linkLedgerEntryKeys: ['pending-billpay'],
      daysAgo: 0,
    },
    {
      key: 'dispute-trattoria',
      type: 'dispute',
      status: 'info_requested',
      summary: 'Disputed card charge — Trattoria Romana ($42.10)',
      detail:
        'Customer disputes a dining charge; additional information has been requested. Approving UPHOLDS the dispute (reverses the charge); rejecting DENIES it (the charge stands) — simulated.',
      subjectName: AVERY,
      subjectEmail: AVERY_EMAIL,
      // v0.8.0 dispute payload — `ledgerEntryId`/`accountId` are filled by the
      // seed writer from the link below (the entry is seeded `disputed`).
      payload: { reason: 'not_recognized', amountMinor: 4210, description: 'Trattoria Romana' },
      linkLedgerEntryKey: 'card-trattoria',
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

  // --- Onboarding application (v0.6.0) ---------------------------------------
  // Backs the seeded `onboarding-taylor` queue item with a real application so a
  // reviewer can APPROVE it and watch a user + checking account + a $250.00
  // bank-originated opening deposit get provisioned. SIMULATION only.
  const onboardingApplications: SeedOnboardingApplication[] = [
    {
      requestKey: 'onboarding-taylor',
      reference: 'MER-SEED01',
      fullName: 'Taylor Prospect',
      email: 'taylor.prospect@example.com',
      product: 'checking',
      initialFundingMinor: 25_000, // $250.00
      jointInviteEmail: null,
      password: 'Prospect123!',
    },
  ];

  // --- Joint-owner invitation (v0.6.0) ---------------------------------------
  // Avery invites Jordan to the Goal Savings account; accepting (in the portal)
  // creates a `joint` AccountAccess grant so Jordan can see savings too.
  const invitations: SeedInvitation[] = [
    {
      accountKey: 'avery-savings',
      inviterEmail: 'avery.customer@example.com',
      inviteeEmail: 'jordan.joint@example.com',
      relationship: 'joint',
      status: 'pending',
    },
  ];

  // --- Cards (v0.8.0) --------------------------------------------------------
  // Two SIMULATED cards on Avery's checking: a debit card (the one the seeded
  // fraud alert freezes on "confirm fraud") and a credit card. Card SPEND already
  // lives as `card`-origin ledger entries above; these are the card LIFECYCLE.
  const cards: SeedCard[] = [
    {
      key: 'card-debit',
      accountKey: CHECKING,
      cardholderEmail: AVERY_EMAIL,
      cardType: 'debit',
      network: 'visa',
      last4: '4821',
    },
    {
      key: 'card-credit',
      accountKey: CHECKING,
      cardholderEmail: AVERY_EMAIL,
      cardType: 'credit',
      network: 'mastercard',
      last4: '7390',
    },
  ];

  // --- Scheduled / recurring payments (v0.9.0) -------------------------------
  // Two SIMULATED schedules for Avery, both due a few days after seed time so a
  // small clock advance fires them: a monthly internal transfer (checking →
  // savings, posts both legs, nets to zero) and a monthly bill pay (queues a
  // pending review an operator approves). Firing always goes through the money
  // service; these rows hold only the instructions.
  const schedules: SeedSchedule[] = [
    {
      ownerEmail: AVERY_EMAIL,
      kind: 'internal_transfer',
      fromAccountKey: CHECKING,
      toAccountKey: SAVINGS,
      memo: 'Monthly savings plan',
      amountMinor: toMinor(200),
      frequency: 'monthly',
      firstRunInDays: 3,
    },
    {
      ownerEmail: AVERY_EMAIL,
      kind: 'bill_pay',
      fromAccountKey: CHECKING,
      counterparty: 'City Power & Light',
      memo: 'Electricity',
      amountMinor: toMinor(95),
      frequency: 'monthly',
      firstRunInDays: 5,
    },
  ];

  // --- Lending & deposit products (v1.0.0) -----------------------------------
  // A SIMULATED CD and a SIMULATED loan for Avery so loans/CDs/interest are
  // visible immediately. The CD is funded from checking (matures after a ~6-month
  // advance); the loan is disbursed to checking (carrying its negative owed
  // balance). Savings accrues interest at the default APY on every clock advance.
  const lending: SeedLending[] = [
    {
      key: 'avery-cd',
      accountKey: 'avery-cd',
      kind: 'cd',
      ownerEmail: AVERY_EMAIL,
      name: '6-month CD',
      counterpartyAccountKey: CHECKING,
      principalMinor: toMinor(2000),
      termMonths: 6,
      apyBps: cdApyForTerm(6) ?? 350,
      paymentMinor: null,
    },
    {
      key: 'avery-loan',
      accountKey: 'avery-loan',
      kind: 'loan',
      ownerEmail: AVERY_EMAIL,
      name: 'Personal loan',
      counterpartyAccountKey: CHECKING,
      principalMinor: toMinor(6000),
      termMonths: 24,
      apyBps: loanApyForTerm(24) ?? 1050,
      paymentMinor: amortizedPaymentMinor(toMinor(6000), loanApyForTerm(24) ?? 1050, 24),
    },
  ];

  return {
    users,
    entries,
    access,
    cards,
    operationsRequests,
    simulatedEvents,
    onboardingApplications,
    invitations,
    schedules,
    lending,
  };
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

/**
 * Onboarding/invitation integrity invariants the seed must satisfy (v0.6.0).
 * Throws on violation. Keeps the seeded applications + invitations internally
 * consistent (each application backs a real `onboarding` request of a known
 * product; each invitation references declared users + an account) so the
 * onboarding + invitation flows rest on a sound fixture.
 */
export function assertSeedOnboardingIntegrity(plan: SeedPlan): void {
  const requestByKey = new Map(plan.operationsRequests.map((r) => [r.key, r]));
  const emails = new Set(plan.users.map((u) => u.email.toLowerCase()));
  const accountKeys = new Set(plan.users.flatMap((u) => u.accounts.map((a) => a.key)));

  const references = new Set<string>();
  for (const app of plan.onboardingApplications) {
    const request = requestByKey.get(app.requestKey);
    if (!request) {
      throw new Error(
        `Seed invariant violated: onboarding application references unknown request key '${app.requestKey}'.`,
      );
    }
    if (request.type !== 'onboarding') {
      throw new Error(
        `Seed invariant violated: onboarding application '${app.reference}' is linked to a non-onboarding request.`,
      );
    }
    if (!ONBOARDING_PRODUCTS.includes(app.product)) {
      throw new Error(`Seed invariant violated: onboarding application has unknown product '${app.product}'.`);
    }
    if (app.initialFundingMinor < 0 || !Number.isInteger(app.initialFundingMinor)) {
      throw new Error(`Seed invariant violated: onboarding application '${app.reference}' has invalid funding.`);
    }
    if (references.has(app.reference)) {
      throw new Error(`Seed invariant violated: duplicate onboarding reference '${app.reference}'.`);
    }
    references.add(app.reference);
    // A pending application whose email already belongs to a seeded user could
    // never be approved (provisioning is blocked on a duplicate email), so guard
    // against that footgun at seed time.
    if (emails.has(app.email.toLowerCase())) {
      throw new Error(
        `Seed invariant violated: onboarding application '${app.reference}' reuses an existing user email '${app.email}'.`,
      );
    }
  }

  for (const invite of plan.invitations) {
    if (!accountKeys.has(invite.accountKey)) {
      throw new Error(`Seed invariant violated: invitation references unknown account key '${invite.accountKey}'.`);
    }
    if (!emails.has(invite.inviterEmail.toLowerCase())) {
      throw new Error(`Seed invariant violated: invitation references unknown inviter '${invite.inviterEmail}'.`);
    }
    if (!ACCOUNT_RELATIONSHIPS.includes(invite.relationship)) {
      throw new Error(`Seed invariant violated: invitation has unknown relationship '${invite.relationship}'.`);
    }
    if (invite.status && !INVITATION_STATUSES.includes(invite.status)) {
      throw new Error(`Seed invariant violated: invitation has unknown status '${invite.status}'.`);
    }
  }
}

/**
 * Money-movement integrity invariants the seed must satisfy (v0.7.0). Throws on
 * violation. Ensures every reviewable money-movement queue item is correctly
 * wired to a PENDING ledger entry it can post on approval:
 *
 *  1. Ledger-entry keys are unique.
 *  2. Every `linkLedgerEntryKeys` key references a declared, **pending** entry.
 *  3. A linking request is one of the money-movement types (deposit/ach/wire/bill_pay).
 *
 * This is what makes the seeded deposit/ACH/bill-pay demos approvable end-to-end
 * (and underwrites the carried-forward Q-01: approving a deposit posts it).
 */
export function assertSeedMovementIntegrity(plan: SeedPlan): void {
  const entryByKey = new Map<string, SeedLedgerEntry>();
  for (const entry of plan.entries) {
    if (entry.key == null) continue;
    if (entryByKey.has(entry.key)) {
      throw new Error(`Seed invariant violated: duplicate ledger-entry key '${entry.key}'.`);
    }
    entryByKey.set(entry.key, entry);
  }

  const movementTypes = new Set<string>(Object.values(REVIEWABLE_MOVEMENT_OPS_TYPE));
  for (const request of plan.operationsRequests) {
    if (!request.linkLedgerEntryKeys || request.linkLedgerEntryKeys.length === 0) continue;
    if (!movementTypes.has(request.type)) {
      throw new Error(
        `Seed invariant violated: request '${request.key}' links ledger entries but is not a money-movement type ('${request.type}').`,
      );
    }
    for (const key of request.linkLedgerEntryKeys) {
      const entry = entryByKey.get(key);
      if (!entry) {
        throw new Error(
          `Seed invariant violated: request '${request.key}' links unknown ledger-entry key '${key}'.`,
        );
      }
      if (entry.status !== 'pending') {
        throw new Error(
          `Seed invariant violated: request '${request.key}' links non-pending ledger entry '${key}' (status '${entry.status}').`,
        );
      }
    }
  }
}

/**
 * Card integrity invariants the seed must satisfy (v0.8.0). Throws on violation.
 * Keeps the seeded cards + the fraud/dispute single-links internally consistent:
 *
 *  1. Card keys are unique; each references a declared account + cardholder user,
 *     with known type/network/status.
 *  2. A request's `linkCardKey` references a declared card; its
 *     `linkLedgerEntryKey` references a declared ledger entry.
 */
export function assertSeedCardIntegrity(plan: SeedPlan): void {
  const accountKeys = new Set(plan.users.flatMap((u) => u.accounts.map((a) => a.key)));
  const emails = new Set(plan.users.map((u) => u.email.toLowerCase()));
  const cardKeys = new Set<string>();
  for (const card of plan.cards) {
    if (cardKeys.has(card.key)) {
      throw new Error(`Seed invariant violated: duplicate card key '${card.key}'.`);
    }
    cardKeys.add(card.key);
    if (!accountKeys.has(card.accountKey)) {
      throw new Error(`Seed invariant violated: card '${card.key}' references unknown account key '${card.accountKey}'.`);
    }
    if (!emails.has(card.cardholderEmail.toLowerCase())) {
      throw new Error(`Seed invariant violated: card '${card.key}' references unknown cardholder '${card.cardholderEmail}'.`);
    }
    if (!CARD_TYPES.includes(card.cardType)) {
      throw new Error(`Seed invariant violated: card '${card.key}' has unknown type '${card.cardType}'.`);
    }
    if (!CARD_NETWORKS.includes(card.network)) {
      throw new Error(`Seed invariant violated: card '${card.key}' has unknown network '${card.network}'.`);
    }
    if (card.status && !CARD_STATUSES.includes(card.status)) {
      throw new Error(`Seed invariant violated: card '${card.key}' has unknown status '${card.status}'.`);
    }
  }

  const entryKeys = new Set(plan.entries.map((e) => e.key).filter((k): k is string => !!k));
  for (const request of plan.operationsRequests) {
    if (request.linkCardKey && !cardKeys.has(request.linkCardKey)) {
      throw new Error(`Seed invariant violated: request '${request.key}' links unknown card key '${request.linkCardKey}'.`);
    }
    if (request.linkLedgerEntryKey && !entryKeys.has(request.linkLedgerEntryKey)) {
      throw new Error(
        `Seed invariant violated: request '${request.key}' links unknown ledger-entry key '${request.linkLedgerEntryKey}'.`,
      );
    }
  }
}

/**
 * Schedule integrity invariants the seed must satisfy (v0.9.0). Throws on
 * violation. Keeps seeded scheduled payments internally consistent and within the
 * shared bounds, so firing them through the money service can never be malformed:
 *
 *  1. The owner email + the source account are declared.
 *  2. Kind/frequency are known; an internal transfer has a declared, DISTINCT
 *     destination account; a bill pay has a biller.
 *  3. The amount is within the shared schedule bounds; `firstRunInDays` is in range.
 */
export function assertSeedScheduleIntegrity(plan: SeedPlan): void {
  const accountKeys = new Set(plan.users.flatMap((u) => u.accounts.map((a) => a.key)));
  const emails = new Set(plan.users.map((u) => u.email.toLowerCase()));

  for (const s of plan.schedules) {
    if (!emails.has(s.ownerEmail.toLowerCase())) {
      throw new Error(`Seed invariant violated: schedule references unknown owner '${s.ownerEmail}'.`);
    }
    if (!accountKeys.has(s.fromAccountKey)) {
      throw new Error(`Seed invariant violated: schedule references unknown account key '${s.fromAccountKey}'.`);
    }
    if (!SCHEDULE_KINDS.includes(s.kind)) {
      throw new Error(`Seed invariant violated: schedule has unknown kind '${s.kind}'.`);
    }
    if (!SCHEDULE_FREQUENCIES.includes(s.frequency)) {
      throw new Error(`Seed invariant violated: schedule has unknown frequency '${s.frequency}'.`);
    }
    if (s.kind === 'internal_transfer') {
      if (!s.toAccountKey || !accountKeys.has(s.toAccountKey)) {
        throw new Error(`Seed invariant violated: internal-transfer schedule needs a declared destination account.`);
      }
      if (s.toAccountKey === s.fromAccountKey) {
        throw new Error(`Seed invariant violated: schedule source and destination accounts must differ.`);
      }
    }
    if (s.kind === 'bill_pay' && !s.counterparty) {
      throw new Error(`Seed invariant violated: bill-pay schedule needs a biller.`);
    }
    if (s.amountMinor < SCHEDULE_LIMITS.minMinor || s.amountMinor > SCHEDULE_LIMITS.maxMinor) {
      throw new Error(`Seed invariant violated: schedule amount ${s.amountMinor} is out of bounds.`);
    }
    if (s.firstRunInDays < 0 || s.firstRunInDays > SCHEDULE_LIMITS.maxFirstRunInDays) {
      throw new Error(`Seed invariant violated: schedule firstRunInDays ${s.firstRunInDays} is out of range.`);
    }
  }
}

/**
 * Lending integrity invariants the seed must satisfy (v1.0.0). Throws on
 * violation. Keeps seeded CDs/loans internally consistent so applying them as
 * net-zero `transfer` pairs can never be malformed:
 *
 *  1. Each product has a unique key + a unique new account key (not colliding with
 *     an existing account), a declared owner, and a declared counterparty account.
 *  2. Kind is known; the principal/APY/term are within the shared bounds.
 *  3. A loan carries a positive monthly payment; a CD carries none.
 */
export function assertSeedLendingIntegrity(plan: SeedPlan): void {
  const emails = new Set(plan.users.map((u) => u.email.toLowerCase()));
  const existingAccountKeys = new Set(plan.users.flatMap((u) => u.accounts.map((a) => a.key)));
  const productKeys = new Set<string>();
  const productAccountKeys = new Set<string>();

  for (const l of plan.lending) {
    if (productKeys.has(l.key)) {
      throw new Error(`Seed invariant violated: duplicate lending key '${l.key}'.`);
    }
    productKeys.add(l.key);
    if (existingAccountKeys.has(l.accountKey) || productAccountKeys.has(l.accountKey)) {
      throw new Error(`Seed invariant violated: lending account key '${l.accountKey}' collides with another account.`);
    }
    productAccountKeys.add(l.accountKey);
    if (!emails.has(l.ownerEmail.toLowerCase())) {
      throw new Error(`Seed invariant violated: lending '${l.key}' references unknown owner '${l.ownerEmail}'.`);
    }
    if (!existingAccountKeys.has(l.counterpartyAccountKey)) {
      throw new Error(`Seed invariant violated: lending '${l.key}' references unknown counterparty account '${l.counterpartyAccountKey}'.`);
    }
    if (!LENDING_KINDS.includes(l.kind)) {
      throw new Error(`Seed invariant violated: lending '${l.key}' has unknown kind '${l.kind}'.`);
    }
    if (
      l.principalMinor < LENDING_LIMITS.minPrincipalMinor ||
      l.principalMinor > LENDING_LIMITS.maxPrincipalMinor
    ) {
      throw new Error(`Seed invariant violated: lending '${l.key}' principal ${l.principalMinor} is out of bounds.`);
    }
    if (l.apyBps < LENDING_LIMITS.minApyBps || l.apyBps > LENDING_LIMITS.maxApyBps) {
      throw new Error(`Seed invariant violated: lending '${l.key}' apyBps ${l.apyBps} is out of bounds.`);
    }
    if (l.termMonths < LENDING_LIMITS.minTermMonths || l.termMonths > LENDING_LIMITS.maxTermMonths) {
      throw new Error(`Seed invariant violated: lending '${l.key}' termMonths ${l.termMonths} is out of bounds.`);
    }
    if (l.kind === 'loan' && (!l.paymentMinor || l.paymentMinor <= 0)) {
      throw new Error(`Seed invariant violated: loan '${l.key}' needs a positive monthly payment.`);
    }
    if (l.kind === 'cd' && l.paymentMinor !== null) {
      throw new Error(`Seed invariant violated: CD '${l.key}' must not carry a monthly payment.`);
    }
  }
}

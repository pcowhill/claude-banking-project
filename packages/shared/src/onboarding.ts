/**
 * Onboarding & account-opening contracts (v0.6.0).
 *
 * Dependency-free and shared by the backend AND both frontends so the
 * open-account application shape, the joint-invitation shape, the admin
 * user-provisioning shape, and the field-level VALIDATION rules are defined in
 * exactly one place (the same `validateOpenAccount` runs in the customer form
 * and again on the server).
 *
 * SIMULATION: an "application" is a fake, queued work item. Submitting one NEVER
 * creates a user, account, or money on its own — an operator must APPROVE the
 * linked operations request, and only then does provisioning run, with initial
 * funding entering via an explicit BANK-ORIGINATED ledger event (see the backend
 * `ops/onboarding.ts`). Balances stay derived; no plaintext password is ever
 * stored or echoed (only a bcrypt hash, server-side, never in any DTO here).
 */
import type { AccountRelationship } from './auth';
import type { UserRole } from './types';

// ---- Products & lifecycle ---------------------------------------------------

/**
 * Products a public applicant may open via self-service onboarding — a SUBSET of
 * `AccountType`. Credit cards, loans, CDs and external accounts are not
 * self-serve in the simulation (they arrive in later milestones).
 */
export const ONBOARDING_PRODUCTS = ['checking', 'savings'] as const;
export type OnboardingProduct = (typeof ONBOARDING_PRODUCTS)[number];

/** Default account name per product (matches the seeded demo accounts). */
export const ONBOARDING_PRODUCT_LABELS: Record<OnboardingProduct, string> = {
  checking: 'Everyday Checking',
  savings: 'Goal Savings',
};

/** Application lifecycle: submitted → (provisioned | rejected) by an operator. */
export const ONBOARDING_STATUSES = ['submitted', 'provisioned', 'rejected'] as const;
export type OnboardingStatus = (typeof ONBOARDING_STATUSES)[number];

/** Joint-invitation lifecycle. */
export const INVITATION_STATUSES = ['pending', 'accepted', 'declined', 'revoked'] as const;
export type InvitationStatus = (typeof INVITATION_STATUSES)[number];

// ---- Policy bounds (SIMULATION) --------------------------------------------

/**
 * Simulated opening-deposit bounds, in integer minor units. A simulated opening
 * deposit may be zero (fund later) up to a modest cap so the demo stays sane.
 */
export const ONBOARDING_FUNDING = {
  minMinor: 0,
  maxMinor: 25_000_00, // $25,000.00
} as const;

/** New-applicant password policy (kept modest; SIMULATION only). */
export const ONBOARDING_PASSWORD = { minLength: 8, maxLength: 200 } as const;

/** Free-text length caps (also bound what an operator sees from a public form). */
export const ONBOARDING_TEXT = { nameMaxLength: 80, reasonMaxLength: 280 } as const;

/**
 * NON-SECRET default demo password assigned to admin-created users when the
 * admin does not specify one. SIMULATION ONLY — echoed back so the admin can
 * share the demo credential. Never a real secret.
 */
export const DEMO_DEFAULT_PASSWORD = 'Demo1234!';

// ---- Lightweight validation primitives -------------------------------------

/** A loose, dependency-free email check — good enough for a simulation (not RFC). */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function isLikelyEmail(value: unknown): value is string {
  return typeof value === 'string' && EMAIL_RE.test(value.trim());
}

export function isOnboardingProduct(value: unknown): value is OnboardingProduct {
  return typeof value === 'string' && (ONBOARDING_PRODUCTS as readonly string[]).includes(value);
}

/** Per-field error map + the normalized value when valid. */
export interface ValidationResult<T, K extends string> {
  ok: boolean;
  errors: Partial<Record<K, string>>;
  value?: T;
}

// ---- Open-account application ----------------------------------------------

export type OpenAccountField =
  | 'fullName'
  | 'email'
  | 'password'
  | 'product'
  | 'initialFundingMinor'
  | 'consent'
  | 'jointInviteEmail';

/** Raw open-account form input (POST /api/onboarding/applications body). */
export interface OpenAccountRequest {
  fullName: string;
  email: string;
  password: string;
  product: OnboardingProduct | string;
  initialFundingMinor: number;
  consent: boolean;
  /** Optional: invite a second person as a joint owner once approved. */
  jointInviteEmail?: string | null;
}

/** The trusted, normalized application (what the server acts on after validation). */
export interface NormalizedOpenAccount {
  fullName: string;
  email: string;
  password: string;
  product: OnboardingProduct;
  initialFundingMinor: number;
  jointInviteEmail: string | null;
}

/**
 * Validate + normalize an open-account application. Pure: the customer form and
 * the backend both call this, so the rules cannot drift between client and
 * server. Returns `{ ok, errors, value }`.
 */
export function validateOpenAccount(
  input: Partial<OpenAccountRequest>,
): ValidationResult<NormalizedOpenAccount, OpenAccountField> {
  const errors: Partial<Record<OpenAccountField, string>> = {};

  const fullName = typeof input.fullName === 'string' ? input.fullName.trim() : '';
  if (!fullName) errors.fullName = 'Enter the applicant’s full name.';
  else if (fullName.length > ONBOARDING_TEXT.nameMaxLength)
    errors.fullName = `Name must be ${ONBOARDING_TEXT.nameMaxLength} characters or fewer.`;

  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  if (!email) errors.email = 'Enter an email address.';
  else if (!isLikelyEmail(email)) errors.email = 'Enter a valid email address.';

  const password = typeof input.password === 'string' ? input.password : '';
  if (password.length < ONBOARDING_PASSWORD.minLength)
    errors.password = `Choose a password of at least ${ONBOARDING_PASSWORD.minLength} characters.`;
  else if (password.length > ONBOARDING_PASSWORD.maxLength)
    errors.password = 'That password is too long.';

  if (!isOnboardingProduct(input.product)) errors.product = 'Choose an account to open.';

  const funding = input.initialFundingMinor;
  if (typeof funding !== 'number' || !Number.isInteger(funding)) {
    errors.initialFundingMinor = 'Enter a valid opening-deposit amount.';
  } else if (funding < ONBOARDING_FUNDING.minMinor || funding > ONBOARDING_FUNDING.maxMinor) {
    errors.initialFundingMinor = 'Opening deposit must be between $0 and $25,000 (simulated).';
  }

  if (input.consent !== true) errors.consent = 'Please accept the simulated terms to continue.';

  let jointInviteEmail: string | null = null;
  const rawJoint = input.jointInviteEmail;
  if (rawJoint != null && String(rawJoint).trim() !== '') {
    const j = String(rawJoint).trim().toLowerCase();
    if (!isLikelyEmail(j)) {
      errors.jointInviteEmail = 'Enter a valid email for the joint owner, or leave it blank.';
    } else if (j === email) {
      errors.jointInviteEmail = 'The joint owner must be a different person.';
    } else {
      jointInviteEmail = j;
    }
  }

  const ok = Object.keys(errors).length === 0;
  return {
    ok,
    errors,
    value: ok
      ? {
          fullName,
          email,
          password,
          product: input.product as OnboardingProduct,
          initialFundingMinor: funding as number,
          jointInviteEmail,
        }
      : undefined,
  };
}

/** POST /api/onboarding/applications success payload (no internal ids leaked). */
export interface OpenAccountResponse {
  reference: string;
  status: OnboardingStatus;
  product: OnboardingProduct;
  /** A friendly, simulation-clear message for the confirmation screen. */
  message: string;
}

/**
 * The onboarding-application context an operator sees on the queue item. NEVER
 * includes the password hash — only what the operator needs to make a decision.
 */
export interface OnboardingApplicationSummary {
  reference: string;
  fullName: string;
  email: string;
  product: OnboardingProduct;
  initialFundingMinor: number;
  jointInviteEmail: string | null;
  status: OnboardingStatus;
}

// ---- Joint-account invitations ---------------------------------------------

/** A joint-owner invitation as exposed to clients. */
export interface AccountInvitationDTO {
  id: string;
  accountId: string;
  accountName: string | null;
  inviteeEmail: string;
  invitedByName: string | null;
  relationship: AccountRelationship;
  status: InvitationStatus;
  createdAt: string;
  respondedAt: string | null;
}

/** POST /api/accounts/:id/invitations body. */
export interface CreateInvitationRequest {
  inviteeEmail: string;
  /** Defaults to `joint`. (`authorized`/`viewer` reserved for later.) */
  relationship?: AccountRelationship;
}

export interface InvitationListResponse {
  invitations: AccountInvitationDTO[];
}

export interface InvitationActionResponse {
  invitation: AccountInvitationDTO;
}

/** Validate a joint invitation; returns the normalized invitee email. */
export function validateInvitation(
  input: Partial<CreateInvitationRequest>,
  inviterEmail: string,
): ValidationResult<{ inviteeEmail: string; relationship: AccountRelationship }, 'inviteeEmail'> {
  const errors: Partial<Record<'inviteeEmail', string>> = {};
  const email = typeof input.inviteeEmail === 'string' ? input.inviteeEmail.trim().toLowerCase() : '';
  if (!email) errors.inviteeEmail = 'Enter the email of the person to invite.';
  else if (!isLikelyEmail(email)) errors.inviteeEmail = 'Enter a valid email address.';
  else if (email === inviterEmail.trim().toLowerCase())
    errors.inviteeEmail = 'You already have access to this account.';

  const relationship: AccountRelationship = input.relationship === 'authorized' ? 'authorized' : 'joint';
  const ok = Object.keys(errors).length === 0;
  return { ok, errors, value: ok ? { inviteeEmail: email, relationship } : undefined };
}

// ---- Admin user provisioning -----------------------------------------------

export type AdminCreateUserField =
  | 'email'
  | 'displayName'
  | 'role'
  | 'product'
  | 'initialFundingMinor'
  | 'reason';

/** Roles an admin may provision through the console. */
export const ADMIN_CREATABLE_ROLES = [
  'customer',
  'joint_customer',
  'ops_agent',
  'admin',
] as const satisfies readonly UserRole[];

/** POST /api/admin/users body. */
export interface AdminCreateUserRequest {
  email: string;
  displayName: string;
  role?: UserRole;
  /** Optionally open an account for the new user. */
  product?: OnboardingProduct | string | null;
  /** Optional initial funding (minor units); requires a `reason` when > 0. */
  initialFundingMinor?: number;
  /** Required when funding > 0 — the audited admin-adjustment reason. */
  reason?: string | null;
  /** Optional non-secret demo password; defaults to {@link DEMO_DEFAULT_PASSWORD}. */
  password?: string | null;
}

export interface NormalizedAdminCreateUser {
  email: string;
  displayName: string;
  role: UserRole;
  product: OnboardingProduct | null;
  initialFundingMinor: number;
  reason: string | null;
  password: string;
}

/**
 * Validate + normalize an admin "create demo user" request. Enforces the
 * constitution's rule that admin-originated funding is an ADJUSTMENT requiring a
 * REASON (and you cannot fund a user with no account). Pure.
 */
export function validateAdminCreateUser(
  input: Partial<AdminCreateUserRequest>,
): ValidationResult<NormalizedAdminCreateUser, AdminCreateUserField> {
  const errors: Partial<Record<AdminCreateUserField, string>> = {};

  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  if (!email) errors.email = 'Enter an email address.';
  else if (!isLikelyEmail(email)) errors.email = 'Enter a valid email address.';

  const displayName = typeof input.displayName === 'string' ? input.displayName.trim() : '';
  if (!displayName) errors.displayName = 'Enter a display name.';
  else if (displayName.length > ONBOARDING_TEXT.nameMaxLength)
    errors.displayName = `Name must be ${ONBOARDING_TEXT.nameMaxLength} characters or fewer.`;

  const role: UserRole = (input.role ?? 'customer') as UserRole;
  if (!(ADMIN_CREATABLE_ROLES as readonly string[]).includes(role)) {
    errors.role = 'Choose a valid role.';
  }

  let product: OnboardingProduct | null = null;
  if (input.product != null && String(input.product).trim() !== '') {
    if (isOnboardingProduct(input.product)) product = input.product;
    else errors.product = 'Choose a valid product, or leave it blank.';
  }

  const fundingRaw = input.initialFundingMinor ?? 0;
  let initialFundingMinor = 0;
  if (typeof fundingRaw !== 'number' || !Number.isInteger(fundingRaw) || fundingRaw < 0) {
    errors.initialFundingMinor = 'Enter a valid funding amount.';
  } else if (fundingRaw > ONBOARDING_FUNDING.maxMinor) {
    errors.initialFundingMinor = 'Funding exceeds the simulated maximum ($25,000).';
  } else {
    initialFundingMinor = fundingRaw;
  }

  const reason = typeof input.reason === 'string' && input.reason.trim() ? input.reason.trim() : null;
  if (initialFundingMinor > 0) {
    if (!product) {
      errors.product = 'Open an account to fund, or set funding to $0.';
    }
    if (!reason) {
      errors.reason = 'A reason is required to fund a new account (audited adjustment).';
    }
  }

  const password =
    typeof input.password === 'string' && input.password.length >= ONBOARDING_PASSWORD.minLength
      ? input.password
      : DEMO_DEFAULT_PASSWORD;

  const ok = Object.keys(errors).length === 0;
  return {
    ok,
    errors,
    value: ok
      ? { email, displayName, role, product, initialFundingMinor, reason, password }
      : undefined,
  };
}

/** A provisioned user as returned by admin create (never any secret). */
export interface AdminCreatedUser {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  status: string;
  createdAt: string;
}

export interface AdminCreateUserResponse {
  user: AdminCreatedUser;
  account: { id: string; type: string; name: string } | null;
  /** The non-secret demo password to share (SIMULATION). */
  demoPassword: string;
}

/**
 * Shared auth & access-control contracts (introduced in v0.2.0).
 *
 * This module is dependency-free and imported by the backend AND both frontend
 * apps so the login/session/RBAC surface is described in exactly one place.
 *
 * SIMULATION NOTE: authentication here protects fake, seeded demo data only.
 * It uses a real password-hashing library (no custom crypto) and standard
 * session handling so the simulation behaves realistically — but there are no
 * real accounts, real money, or real personal data behind it.
 */
import type { DerivedBalances } from './ledger';
import type { AccountStatus, AccountType, UserRole } from './types';

/**
 * How a user is related to an account they can access. The primary `owner` is
 * also recorded on `Account.userId`; additional access (joint customers,
 * authorized users) is granted via explicit access-grant rows. This is the
 * backbone of "customers see only their own accounts; joint users only
 * authorized accounts."
 */
export const ACCOUNT_RELATIONSHIPS = ['owner', 'joint', 'authorized', 'viewer'] as const;
export type AccountRelationship = (typeof ACCOUNT_RELATIONSHIPS)[number];

/**
 * Tunable auth policy. Centralized so the backend, the seed, and the tests all
 * agree on the same thresholds. Values are deliberately modest for a local demo.
 */
export const AUTH = {
  /** Cookie that carries the opaque session token. */
  sessionCookieName: 'mer_session',
  /** bcrypt cost factor used by the password hasher. */
  bcryptCostFactor: 10,
  /** Failed logins (in a row) before an account is temporarily locked. */
  maxFailedAttempts: 5,
  /** How long an account stays locked after hitting the failure threshold. */
  lockoutDurationMinutes: 15,
  /** Idle session lifetime; each authenticated request slides it forward. */
  sessionTtlMinutes: 8 * 60,
  /** Raw session token length in bytes (hex-encoded in the cookie). */
  sessionTokenBytes: 32,
  /** How many recent login-history rows the customer UI shows. */
  loginHistoryLimit: 10,
} as const;

/** Known reasons attached to a login attempt (stored on LoginEvent.reason). */
export const LOGIN_REASONS = [
  'ok',
  'invalid_credentials',
  'account_locked',
  'account_disabled',
] as const;
export type LoginReason = (typeof LOGIN_REASONS)[number];

// ---- API request/response DTOs ---------------------------------------------

/** POST /api/auth/login body. */
export interface LoginRequest {
  email: string;
  password: string;
}

/** The current user as exposed to clients — never includes the password hash. */
export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
}

/** POST /api/auth/login and GET /api/auth/me success payload. */
export interface AuthResponse {
  user: SessionUser;
}

/**
 * An account the current user is allowed to see, with balances DERIVED on the
 * server from the ledger (never a stored, editable number) and the caller's
 * relationship to it.
 */
export interface AccountSummary {
  id: string;
  name: string;
  type: AccountType;
  status: AccountStatus;
  currency: string;
  relationship: AccountRelationship;
  balances: DerivedBalances;
}

/** A single sign-in attempt in the customer's login history. */
export interface LoginEventDTO {
  id: string;
  success: boolean;
  reason: LoginReason | string;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
}

/** Uniform error body returned by the API for 4xx/5xx auth & access failures. */
export interface ApiErrorResponse {
  error: string;
  code?: string;
}

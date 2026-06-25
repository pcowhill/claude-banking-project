/**
 * Cross-cutting domain types and API DTOs shared by the backend and frontends.
 * These describe the SHAPE of the future product; most are not yet wired into
 * real behavior in v0.1.0, but defining them now keeps the apps honest as
 * features land milestone by milestone.
 */

/** Roles in the system (RBAC arrives in v0.2.0). */
export const USER_ROLES = ['customer', 'joint_customer', 'ops_agent', 'admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** Banking product types. */
export const ACCOUNT_TYPES = ['checking', 'savings', 'credit_card', 'loan', 'cd', 'external'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const ACCOUNT_STATUSES = ['active', 'pending', 'frozen', 'closed'] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

/** Operations queue request types the ops simulator will act on (v0.5.0+). */
export const OPS_REQUEST_TYPES = [
  'onboarding',
  'identity_verification',
  'mfa',
  'deposit',
  'ach',
  'wire',
  'fraud_alert',
  'dispute',
  'support_message',
  'password_reset',
  'external_account_verification',
] as const;
export type OpsRequestType = (typeof OPS_REQUEST_TYPES)[number];

export const OPS_REQUEST_STATUSES = [
  'pending',
  'approved',
  'rejected',
  'on_hold',
  'info_requested',
] as const;
export type OpsRequestStatus = (typeof OPS_REQUEST_STATUSES)[number];

// ---- API response DTOs ------------------------------------------------------

/** GET /health — cheap liveness probe; never touches the database. */
export interface HealthResponse {
  status: 'ok';
  uptimeSeconds: number;
}

/** GET /status — richer readiness + platform metadata; touches the database. */
export interface StatusResponse {
  status: 'ok' | 'degraded';
  version: string;
  milestone: string;
  milestoneName: string;
  isSimulation: true;
  environment: string;
  database: {
    connected: boolean;
    users: number;
    accounts: number;
  };
  serverTime: string;
}

/** GET /api/meta — static platform descriptor for clients. */
export interface MetaResponse {
  name: string;
  version: string;
  milestone: string;
  isSimulation: true;
  disclaimer: string;
}

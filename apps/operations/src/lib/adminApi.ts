import type { AdminCreateUserRequest, AdminCreateUserResponse } from '@simbank/shared';
import { apiRequest } from './api';

/**
 * Typed client for the admin-only provisioning endpoints (v0.6.0). Carries the
 * operator session cookie (via `apiRequest`) and throws `ApiError` on failure so
 * the console can show a specific message. SIMULATION ONLY: this provisions fake
 * demo users + accounts; any opening deposit enters via a bank-originated,
 * audited ledger event on the backend (never real money).
 */

/**
 * POST /api/admin/users — provision a SIMULATED demo user (admin role only).
 * Resolves with the created user, any opened account, and the NON-SECRET demo
 * password the admin can share. Throws `ApiError` (e.g. 409 on duplicate email).
 */
export function createAdminUser(input: AdminCreateUserRequest): Promise<AdminCreateUserResponse> {
  return apiRequest<AdminCreateUserResponse>('/api/admin/users', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

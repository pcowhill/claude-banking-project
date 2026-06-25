import type { FastifyInstance } from 'fastify';
import { SESSION_AUDIENCES, sessionCookieName, type SessionAudience } from '@simbank/shared';
import { prisma } from '../db';
import { applySeedPlan } from '../seed-apply';
import { buildSeedPlan } from '../seed-plan';

/** The seeded demo accounts, with their NON-SECRET demo passwords. */
export const DEMO = {
  customer: { email: 'avery.customer@example.com', password: 'Customer123!' },
  joint: { email: 'jordan.joint@example.com', password: 'Joint123!' },
  ops: { email: 'sam.operator@example.com', password: 'Operator123!' },
  admin: { email: 'riley.admin@example.com', password: 'Admin123!' },
} as const;

/** Seed the full demo plan into the test DB (used once per file in beforeAll). */
export async function seedDemo(): Promise<void> {
  await applySeedPlan(prisma, buildSeedPlan());
}

/**
 * Reset volatile auth state between tests WITHOUT re-hashing passwords (so the
 * suite stays fast): clear sessions + login history and reset per-user lockout
 * counters / status.
 */
export async function resetAuthState(): Promise<void> {
  await prisma.loginEvent.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.updateMany({
    data: { failedLoginAttempts: 0, lockedUntil: null, status: 'active', lastLoginAt: null },
  });
}

interface InjectLikeResponse {
  cookies?: Array<{ name: string; value: string }>;
}

/** Every per-surface session cookie name (customer + operations). */
const SESSION_COOKIE_NAMES = SESSION_AUDIENCES.map(sessionCookieName);

/**
 * The raw session-cookie value from an inject() response, whichever surface's
 * cookie was set. A login sets exactly one session cookie, so this is unambiguous.
 */
export function sessionCookieValue(res: InjectLikeResponse): string | undefined {
  return res.cookies?.find((c) => SESSION_COOKIE_NAMES.includes(c.name))?.value;
}

/**
 * Build a Cookie header carrying a session token. Defaults to the customer
 * surface's cookie name (requests via `app.inject` have no Origin, so the
 * backend reads the customer cookie); pass an audience to target the ops surface.
 */
export function cookieHeader(value: string, audience: SessionAudience = 'customer'): string {
  return `${sessionCookieName(audience)}=${value}`;
}

/** Log in via the API and return the Cookie header for authenticated requests. */
export async function loginAs(
  app: FastifyInstance,
  email: string,
  password: string,
): Promise<{ statusCode: number; cookie: string | undefined; value: string | undefined }> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email, password },
  });
  const value = sessionCookieValue(res);
  return { statusCode: res.statusCode, cookie: value ? cookieHeader(value) : undefined, value };
}

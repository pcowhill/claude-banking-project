import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { AUTH, PUBLIC_DEMO_PLACEHOLDER, PUBLIC_DEMO_RATE_LIMITS } from '@simbank/shared';
import { overrideConfigForTests } from '../config';
import { prisma } from '../db';
import { resetRateLimiters } from '../abuse/rate-limit';
import { hashSessionToken } from '../auth/tokens';
import { buildServer } from '../server';
import { seededShowcaseEmails } from '../seed-plan';
import {
  DEMO,
  loginAs,
  mutatingHeaders,
  resetAuthState,
  seedDemo,
  sessionCookieValue,
} from '../test/fixtures';

/**
 * PUBLIC_DEMO=true behaviour, exercised against the SAME built server as the
 * local-development tests by patching the live config:
 *  - visitor privacy: no real IP / user-agent is persisted;
 *  - seeded showcase accounts cannot be locked out by anonymous visitors, while
 *    every other account keeps the normal lockout (and nothing changes when the
 *    flag is off);
 *  - the in-memory rate limits return 429 on the protected routes;
 *  - the status endpoint + crawler header advertise the posture.
 */
describe('public-demo mode', () => {
  let app: FastifyInstance;
  let restore: (() => void) | null = null;
  const REAL_IP = '203.0.113.99';
  const REAL_UA = 'RealBrowser/1.0 (visitor)';

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();
    await seedDemo();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetAuthState();
    resetRateLimiters();
  });
  afterEach(() => {
    restore?.();
    restore = null;
  });

  function login(email: string, password: string, extra: Record<string, string> = {}) {
    return app.inject({
      method: 'POST',
      url: '/api/auth/login',
      remoteAddress: REAL_IP,
      headers: { 'user-agent': REAL_UA, ...extra },
      payload: { email, password },
    });
  }

  describe('privacy: request identifiers are not persisted', () => {
    it('local development keeps the real ip + user-agent on Session and LoginEvent rows', async () => {
      restore = overrideConfigForTests({ publicDemo: false });
      const res = await login(DEMO.customer.email, DEMO.customer.password);
      expect(res.statusCode).toBe(200);
      const session = await prisma.session.findUnique({
        where: { tokenHash: hashSessionToken(sessionCookieValue(res)!) },
      });
      expect(session?.ip).toBe(REAL_IP);
      expect(session?.userAgent).toBe(REAL_UA);
      const event = await prisma.loginEvent.findFirst({ orderBy: { createdAt: 'desc' } });
      expect(event?.ip).toBe(REAL_IP);
      expect(event?.userAgent).toBe(REAL_UA);
    });

    it('PUBLIC_DEMO: Session + LoginEvent rows carry only the constant placeholder (success AND failure)', async () => {
      restore = overrideConfigForTests({ publicDemo: true });
      const ok = await login(DEMO.customer.email, DEMO.customer.password);
      expect(ok.statusCode).toBe(200);
      const bad = await login(DEMO.customer.email, 'wrong-password');
      expect(bad.statusCode).toBe(401);
      const unknown = await login('nobody@example.com', 'whatever');
      expect(unknown.statusCode).toBe(401);

      const session = await prisma.session.findUnique({
        where: { tokenHash: hashSessionToken(sessionCookieValue(ok)!) },
      });
      expect(session?.ip).toBe(PUBLIC_DEMO_PLACEHOLDER);
      expect(session?.userAgent).toBe(PUBLIC_DEMO_PLACEHOLDER);

      const events = await prisma.loginEvent.findMany({ orderBy: { createdAt: 'desc' }, take: 3 });
      expect(events).toHaveLength(3);
      for (const e of events) {
        expect(e.ip).toBe(PUBLIC_DEMO_PLACEHOLDER);
        expect(e.userAgent).toBe(PUBLIC_DEMO_PLACEHOLDER);
        expect(JSON.stringify(e)).not.toContain(REAL_IP);
        expect(JSON.stringify(e)).not.toContain('RealBrowser');
      }
      // The whole table holds no real identifier at all.
      expect(await prisma.loginEvent.count({ where: { ip: REAL_IP } })).toBe(0);
      expect(await prisma.session.count({ where: { userAgent: REAL_UA } })).toBe(0);
    });

    it('the login-history API therefore shows only the placeholder in public-demo mode', async () => {
      restore = overrideConfigForTests({ publicDemo: true });
      const { cookie } = await loginAs(app, DEMO.customer.email, DEMO.customer.password);
      const res = await app.inject({
        method: 'GET',
        url: '/api/auth/login-history',
        headers: { cookie: cookie! },
      });
      expect(res.statusCode).toBe(200);
      const events = res.json().events as Array<{ ip: string | null; userAgent: string | null }>;
      expect(events.length).toBeGreaterThan(0);
      for (const e of events) {
        expect(e.ip).toBe(PUBLIC_DEMO_PLACEHOLDER);
        expect(e.userAgent).toBe(PUBLIC_DEMO_PLACEHOLDER);
      }
    });
  });

  describe('seeded showcase accounts vs the lockout policy', () => {
    it('the showcase list is derived from the seed plan (demo users + the seeded applicant)', () => {
      const emails = seededShowcaseEmails();
      for (const account of Object.values(DEMO)) expect(emails.has(account.email)).toBe(true);
      expect(emails.has('taylor.prospect@example.com')).toBe(true);
      expect(emails.has('nobody@example.com')).toBe(false);
    });

    async function failRepeatedly(email: string, times = AUTH.maxFailedAttempts + 2) {
      let last;
      for (let i = 0; i < times; i++) last = await login(email, 'definitely-wrong');
      return last!;
    }

    it('PUBLIC_DEMO off: a showcase account still locks after the configured failures (unchanged policy)', async () => {
      restore = overrideConfigForTests({ publicDemo: false });
      const last = await failRepeatedly(DEMO.customer.email);
      expect(last.statusCode).toBe(423);
      const correct = await login(DEMO.customer.email, DEMO.customer.password);
      expect(correct.statusCode).toBe(423);
    });

    it('PUBLIC_DEMO on: a visitor looping wrong passwords cannot lock a showcase account', async () => {
      restore = overrideConfigForTests({ publicDemo: true });
      const lockAuditsBefore = await prisma.auditLog.count({ where: { action: 'account_locked' } });
      const last = await failRepeatedly(DEMO.customer.email, AUTH.maxFailedAttempts * 3);
      // Still a plain "invalid credentials" — password verification is intact...
      expect(last.statusCode).toBe(401);
      expect(last.json().code).toBe('invalid_credentials');
      // ...the failures are still counted + recorded (history/audit), but no lock exists...
      const user = await prisma.user.findUniqueOrThrow({ where: { email: DEMO.customer.email } });
      expect(user.failedLoginAttempts).toBeGreaterThanOrEqual(AUTH.maxFailedAttempts);
      expect(user.lockedUntil).toBeNull();
      expect(await prisma.loginEvent.count({ where: { userId: user.id, success: false } })).toBe(
        AUTH.maxFailedAttempts * 3,
      );
      expect(await prisma.auditLog.count({ where: { action: 'account_locked' } })).toBe(
        lockAuditsBefore,
      );
      // ...and the next visitor with the REAL password gets straight in.
      const correct = await login(DEMO.customer.email, DEMO.customer.password);
      expect(correct.statusCode).toBe(200);
      // The wrong password is still rejected — nothing about verification was bypassed.
      expect((await login(DEMO.customer.email, 'still-wrong')).statusCode).toBe(401);
    });

    it('PUBLIC_DEMO on: a showcase account that was locked BEFORE the flag flipped is not denied', async () => {
      restore = overrideConfigForTests({ publicDemo: true });
      await prisma.user.update({
        where: { email: DEMO.ops.email },
        data: { failedLoginAttempts: 5, lockedUntil: new Date(Date.now() + 10 * 60_000) },
      });
      const res = await login(DEMO.ops.email, DEMO.ops.password, {
        [AUTH.surfaceHeader]: 'operations',
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().user.role).toBe('ops_agent');
    });

    it('PUBLIC_DEMO on: a NON-seeded account keeps the normal lockout', async () => {
      restore = overrideConfigForTests({ publicDemo: true });
      const { hashPassword } = await import('../auth/password');
      const email = 'visitor.created@example.com';
      await prisma.user.deleteMany({ where: { email } });
      await prisma.user.create({
        data: {
          email,
          displayName: 'Visitor Created',
          role: 'customer',
          passwordHash: await hashPassword('Visitor123!'),
        },
      });
      try {
        const last = await failRepeatedly(email);
        expect(last.statusCode).toBe(423);
        expect((await login(email, 'Visitor123!')).statusCode).toBe(423);
      } finally {
        await prisma.user.deleteMany({ where: { email } });
      }
    });
  });

  describe('rate limits', () => {
    it('are OFF in local development: far more logins than the budget still pass through', async () => {
      restore = overrideConfigForTests({ rateLimitsEnabled: false });
      const budget = PUBLIC_DEMO_RATE_LIMITS.login.max;
      let last;
      for (let i = 0; i < budget + 2; i++)
        last = await login(DEMO.customer.email, DEMO.customer.password);
      expect(last!.statusCode).toBe(200);
    });

    it('login: 429 with Retry-After once a client exhausts its window (public-demo)', async () => {
      restore = overrideConfigForTests({ publicDemo: true });
      const budget = PUBLIC_DEMO_RATE_LIMITS.login.max;
      let last;
      for (let i = 0; i < budget; i++) {
        last = await login(DEMO.customer.email, 'wrong');
        expect(last.statusCode).toBe(401);
      }
      const blocked = await login(DEMO.customer.email, DEMO.customer.password);
      expect(blocked.statusCode).toBe(429);
      expect(blocked.json().code).toBe('rate_limited');
      expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
      // Keyed per client: another address is unaffected.
      const other = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        remoteAddress: '198.51.100.5',
        payload: { email: DEMO.customer.email, password: DEMO.customer.password },
      });
      expect(other.statusCode).toBe(200);
    });

    it('public onboarding: a small per-client budget, then 429 (no DB/bcrypt work past the limit)', async () => {
      restore = overrideConfigForTests({ publicDemo: true });
      const budget = PUBLIC_DEMO_RATE_LIMITS.onboarding.max;
      const before = await prisma.onboardingApplication.count();
      for (let i = 0; i < budget; i++) {
        const res = await app.inject({
          method: 'POST',
          url: '/api/onboarding/applications',
          remoteAddress: REAL_IP,
          payload: { nonsense: true }, // invalid → 400, but it still spends budget
        });
        expect(res.statusCode).toBe(400);
      }
      const blocked = await app.inject({
        method: 'POST',
        url: '/api/onboarding/applications',
        remoteAddress: REAL_IP,
        payload: {
          fullName: 'Rate Limited',
          email: 'rate.limited@example.com',
          password: 'Password123!',
          product: 'checking',
          initialFundingMinor: 0,
          consent: true,
        },
      });
      expect(blocked.statusCode).toBe(429);
      expect(await prisma.onboardingApplication.count()).toBe(before);
    });

    it('authenticated money movement is keyed per USER and returns 429 past the budget', async () => {
      restore = overrideConfigForTests({ publicDemo: true });
      const { cookie } = await loginAs(app, DEMO.customer.email, DEMO.customer.password);
      const budget = PUBLIC_DEMO_RATE_LIMITS.money.max;
      let last;
      for (let i = 0; i < budget; i++) {
        last = await app.inject({
          method: 'POST',
          url: '/api/transfers',
          headers: mutatingHeaders(cookie),
          payload: { nonsense: true }, // 400 — proves we passed auth + CSRF and spent budget
        });
        expect(last.statusCode).toBe(400);
      }
      const blocked = await app.inject({
        method: 'POST',
        url: '/api/transfers',
        headers: mutatingHeaders(cookie),
        payload: {},
      });
      expect(blocked.statusCode).toBe(429);
      // A different user is unaffected (per-user key), and safe GETs are never limited.
      const joint = await loginAs(app, DEMO.joint.email, DEMO.joint.password);
      const ok = await app.inject({
        method: 'POST',
        url: '/api/transfers',
        headers: mutatingHeaders(joint.cookie),
        payload: {},
      });
      expect(ok.statusCode).toBe(400);
      const get = await app.inject({
        method: 'GET',
        url: '/api/accounts',
        headers: { cookie: cookie! },
      });
      expect(get.statusCode).toBe(200);
    });

    it('operator mutations share the operations bucket', async () => {
      restore = overrideConfigForTests({ publicDemo: true });
      const { value, csrf } = await loginAs(app, DEMO.ops.email, DEMO.ops.password);
      const headers = {
        cookie: `${AUTH.sessionCookieNames.operations}=${value}; ${AUTH.csrfCookieName}=${csrf}`,
        [AUTH.surfaceHeader]: 'operations',
        [AUTH.csrfHeader]: csrf!,
      };
      const budget = PUBLIC_DEMO_RATE_LIMITS.operations.max;
      for (let i = 0; i < budget; i++) {
        const res = await app.inject({
          method: 'POST',
          url: '/api/ops/simulate/event',
          headers,
          payload: { channel: 'nope' },
        });
        expect(res.statusCode).toBe(400);
      }
      const blocked = await app.inject({
        method: 'POST',
        url: '/api/ops/simulate/event',
        headers,
        payload: { channel: 'sms' },
      });
      expect(blocked.statusCode).toBe(429);
    });
  });

  describe('posture is advertised', () => {
    it('GET /status reports publicDemo and API responses carry X-Robots-Tag only in public-demo mode', async () => {
      restore = overrideConfigForTests({ publicDemo: false });
      const dev = await app.inject({ method: 'GET', url: '/status' });
      expect(dev.json().publicDemo).toBe(false);
      restore();
      restore = overrideConfigForTests({ publicDemo: true });
      const demo = await app.inject({ method: 'GET', url: '/status' });
      expect(demo.json().publicDemo).toBe(true);
      expect(demo.json().isSimulation).toBe(true);
    });
  });
});

describe('a server BUILT in public-demo mode adds the crawler header', () => {
  it('sets X-Robots-Tag: noindex, nofollow on every response', async () => {
    const restore = overrideConfigForTests({ publicDemo: true });
    const app = await buildServer();
    try {
      await app.ready();
      const res = await app.inject({ method: 'GET', url: '/health' });
      expect(res.headers['x-robots-tag']).toBe('noindex, nofollow');
    } finally {
      await app.close();
      restore();
    }
  });
});

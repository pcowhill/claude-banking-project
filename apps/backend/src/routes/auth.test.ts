import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { AUTH, sessionCookieName } from '@simbank/shared';
import { buildServer } from '../server';
import { prisma } from '../db';
import { DEMO, cookieHeader, loginAs, resetAuthState, seedDemo, sessionCookieValue } from '../test/fixtures';

describe('auth routes', () => {
  let app: FastifyInstance;

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
  });

  describe('login', () => {
    it('accepts valid credentials, returns the user, and sets an httpOnly cookie', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: DEMO.customer.email, password: DEMO.customer.password },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().user).toMatchObject({ email: DEMO.customer.email, role: 'customer' });
      expect(res.json().user.passwordHash).toBeUndefined();

      const cookie = res.cookies.find((c) => c.name === sessionCookieName('customer'));
      expect(cookie).toBeDefined();
      expect(cookie?.httpOnly).toBe(true);
      expect(cookie?.value).toBeTruthy();
    });

    it('is case-insensitive on the email', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: DEMO.customer.email.toUpperCase(), password: DEMO.customer.password },
      });
      expect(res.statusCode).toBe(200);
    });

    it('rejects a wrong password with 401 and no cookie', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: DEMO.customer.email, password: 'not-the-password' },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().code).toBe('invalid_credentials');
      expect(sessionCookieValue(res)).toBeUndefined();
    });

    it('rejects an unknown email with the same generic 401 (no user enumeration)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: 'nobody@example.com', password: 'whatever' },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().code).toBe('invalid_credentials');
    });

    it('400s when fields are missing', async () => {
      const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: '' } });
      expect(res.statusCode).toBe(400);
    });

    it('rejects a disabled account with 403', async () => {
      await prisma.user.update({
        where: { email: DEMO.customer.email },
        data: { status: 'disabled' },
      });
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: DEMO.customer.email, password: DEMO.customer.password },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe('account_disabled');
    });
  });

  describe('lockout', () => {
    it('locks the account after the configured number of failures', async () => {
      let last;
      for (let i = 0; i < AUTH.maxFailedAttempts; i++) {
        last = await app.inject({
          method: 'POST',
          url: '/api/auth/login',
          payload: { email: DEMO.customer.email, password: 'wrong' },
        });
      }
      expect(last?.statusCode).toBe(423);
      expect(last?.json().code).toBe('account_locked');

      // Even the CORRECT password is now refused while locked.
      const correct = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: DEMO.customer.email, password: DEMO.customer.password },
      });
      expect(correct.statusCode).toBe(423);
      expect(correct.json().code).toBe('account_locked');
    });

    it('writes an AuditLog row when an account locks', async () => {
      for (let i = 0; i < AUTH.maxFailedAttempts; i++) {
        await app.inject({
          method: 'POST',
          url: '/api/auth/login',
          payload: { email: DEMO.customer.email, password: 'wrong' },
        });
      }
      const locked = await prisma.auditLog.findFirst({
        where: { action: 'account_locked', entity: 'user' },
        orderBy: { createdAt: 'desc' },
      });
      expect(locked).not.toBeNull();
    });
  });

  describe('session lifecycle', () => {
    it('GET /api/auth/me requires a session', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/auth/me' });
      expect(res.statusCode).toBe(401);
      expect(res.json().code).toBe('unauthenticated');
    });

    it('GET /api/auth/me returns the current user when authenticated', async () => {
      const { cookie } = await loginAs(app, DEMO.admin.email, DEMO.admin.password);
      const res = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: cookie! } });
      expect(res.statusCode).toBe(200);
      expect(res.json().user).toMatchObject({ email: DEMO.admin.email, role: 'admin' });
    });

    it('rejects a bogus session cookie and clears it', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: { cookie: cookieHeader('deadbeef-not-a-real-token') },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().code).toBe('session_expired');
    });

    it('logout revokes the session so the cookie can no longer be used', async () => {
      const { cookie } = await loginAs(app, DEMO.customer.email, DEMO.customer.password);
      expect(cookie).toBeTruthy();

      const me1 = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: cookie! } });
      expect(me1.statusCode).toBe(200);

      const out = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie: cookie! } });
      expect(out.statusCode).toBe(200);

      const me2 = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: cookie! } });
      expect(me2.statusCode).toBe(401);
    });

    it('logout works even when the request declares an empty application/json body', async () => {
      // Regression: a bodyless POST that sets Content-Type: application/json (as a
      // best-effort browser logout does) must still revoke the session, not 400.
      const { cookie } = await loginAs(app, DEMO.customer.email, DEMO.customer.password);
      const out = await app.inject({
        method: 'POST',
        url: '/api/auth/logout',
        headers: { cookie: cookie!, 'content-type': 'application/json' },
      });
      expect(out.statusCode).toBe(200);

      const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: cookie! } });
      expect(me.statusCode).toBe(401);
    });

    it('treats an expired session as logged out', async () => {
      const { value } = await loginAs(app, DEMO.customer.email, DEMO.customer.password);
      // Force the session to be already expired.
      const { hashSessionToken } = await import('../auth/tokens');
      await prisma.session.update({
        where: { tokenHash: hashSessionToken(value!) },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      const res = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: { cookie: cookieHeader(value!) },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('login history & audit', () => {
    it('records every attempt and writes an audit row on success', async () => {
      // One failure, then a success.
      await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: DEMO.customer.email, password: 'wrong' },
      });
      const { cookie } = await loginAs(app, DEMO.customer.email, DEMO.customer.password);

      const res = await app.inject({
        method: 'GET',
        url: '/api/auth/login-history',
        headers: { cookie: cookie! },
      });
      expect(res.statusCode).toBe(200);
      const events = res.json().events as Array<{ success: boolean; reason: string }>;
      expect(events.length).toBeGreaterThanOrEqual(2);
      // Most recent first: the successful login.
      expect(events[0]).toMatchObject({ success: true, reason: 'ok' });
      expect(events.some((e) => !e.success && e.reason === 'invalid_credentials')).toBe(true);

      const audit = await prisma.auditLog.findFirst({
        where: { action: 'login', entity: 'session' },
        orderBy: { createdAt: 'desc' },
      });
      expect(audit).not.toBeNull();
    });
  });
});

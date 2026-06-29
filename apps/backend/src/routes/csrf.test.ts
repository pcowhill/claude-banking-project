import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { AUTH } from '@simbank/shared';
import { buildServer } from '../server';
import { DEMO, cookieHeader, loginAs, mutatingHeaders, seedDemo } from '../test/fixtures';

/**
 * CSRF protection (v1.0.0 / SEC-1) — the global double-submit hook. A
 * state-changing request from an authenticated session must carry an
 * `x-meridian-csrf` header matching the `mer_csrf` cookie; otherwise 403.
 * Unauthenticated requests and exempt paths (login/logout/public onboarding) are
 * not gated, and safe requests issue a token cookie.
 */
describe('CSRF protection (v1.0.0)', () => {
  let app: FastifyInstance;
  let session = { cookie: undefined as string | undefined, csrf: undefined as string | undefined };

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();
    await seedDemo();
    const login = await loginAs(app, DEMO.customer.email, DEMO.customer.password);
    session = { cookie: login.cookie, csrf: login.csrf };
  });
  afterAll(async () => {
    await app.close();
  });

  function post(url: string, headers: Record<string, string>, payload?: InjectOptions['payload']) {
    return app.inject({ method: 'POST', url, headers, payload });
  }

  it('a safe GET issues a mer_csrf token cookie to a brand-new client', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/auth/me' });
    expect(res.cookies?.some((c) => c.name === AUTH.csrfCookieName && c.value.length > 0)).toBe(true);
  });

  it('login issues a CSRF token (exempt from the check, seeds the cookie)', () => {
    expect(session.csrf && session.csrf.length).toBeGreaterThan(0);
    expect(session.cookie).toContain(`${AUTH.csrfCookieName}=`);
  });

  it('rejects an authenticated state-changing POST with NO csrf header (403)', async () => {
    // Session cookie present (no csrf header) → the forgeable case → blocked.
    const res = await post('/api/schedules', { cookie: session.cookie! }, { kind: 'bill_pay' });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('csrf_failed');
  });

  it('rejects an authenticated POST whose csrf header does NOT match the cookie (403)', async () => {
    const res = await post(
      '/api/schedules',
      { cookie: session.cookie!, [AUTH.csrfHeader]: 'not-the-right-token' },
      { kind: 'bill_pay' },
    );
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('csrf_failed');
  });

  it('allows an authenticated POST with a MATCHING csrf header (passes the gate)', async () => {
    // A bad body → 400 invalid_request, which PROVES the CSRF gate was passed
    // (a 403 would mean it was blocked). mutatingHeaders attaches the token.
    const res = await post('/api/schedules', mutatingHeaders(session.cookie), { kind: 'nonsense' });
    expect(res.statusCode).not.toBe(403);
    expect([400, 201]).toContain(res.statusCode);
  });

  it('does NOT gate an UNAUTHENTICATED state-changing POST (auth returns 401, not 403)', async () => {
    const res = await post('/api/schedules', {}, { kind: 'bill_pay' });
    expect(res.statusCode).toBe(401);
  });

  it('does NOT gate exempt paths: logout works without a csrf header', async () => {
    const res = await post('/api/auth/logout', { cookie: session.cookie! });
    expect(res.statusCode).not.toBe(403);
  });

  it('does NOT gate exempt paths: the public onboarding submit needs no csrf header', async () => {
    const res = await post('/api/onboarding/applications', {}, { nonsense: true });
    // 400 (validation) — NOT 403. The public submit is unauthenticated by design.
    expect(res.statusCode).not.toBe(403);
  });

  void cookieHeader; // (kept available for future per-surface CSRF cases)
});

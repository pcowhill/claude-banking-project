import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { AUTH, sessionCookieName } from '@simbank/shared';
import { buildServer } from '../server';
import { DEMO, resetAuthState, seedDemo } from '../test/fixtures';

/**
 * Operations session must resolve on requests that OMIT the `Origin` header
 * (v0.6.2, regression for the human-reported login loop / B-06).
 *
 * Root cause of the v0.6.1 "logged in for a split second, then bounced to the
 * sign-in screen" loop: the backend picked the per-surface session cookie from
 * the request `Origin` header, defaulting to the CUSTOMER cookie whenever Origin
 * was absent. But browsers omit `Origin` on a same-origin GET — so the ops
 * console's authenticated GETs (which set `mer_ops_session` at login) were read
 * against the empty customer cookie and 401'd. v0.6.0 surfaced that as
 * "Not authenticated"; the v0.6.1 session-recovery handler escalated the same
 * 401 into an unrecoverable login loop.
 *
 * The fix: each app declares its surface with an explicit `AUTH.surfaceHeader`
 * that the backend trusts ahead of `Origin`. These tests drive the backend as a
 * same-origin browser would — cookie present, NO Origin — and assert the ops
 * session resolves when (and only when) the surface header identifies it.
 */

const OPS_ORIGIN = 'http://localhost:5174';
const OPS_COOKIE = sessionCookieName('operations'); // mer_ops_session

describe('operations session resolves on Origin-less requests (v0.6.2 / B-06)', () => {
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

  /** Log in from the ops surface and return the Cookie header it set. */
  async function loginOps(): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { origin: OPS_ORIGIN },
      payload: { email: DEMO.ops.email, password: DEMO.ops.password },
    });
    expect(res.statusCode).toBe(200);
    const set = res.cookies.find((c) => c.name === OPS_COOKIE);
    expect(set, 'ops login should set the operations cookie').toBeTruthy();
    return `${OPS_COOKIE}=${set?.value}`;
  }

  it('an ops login sets the operations session cookie', async () => {
    const cookie = await loginOps();
    expect(cookie.startsWith(`${OPS_COOKIE}=`)).toBe(true);
  });

  it('resolves the operator session on an Origin-less request that carries the surface header (the fix)', async () => {
    const cookie = await loginOps();
    // Exactly what a real browser sends on a SAME-ORIGIN GET: the cookie, the
    // app's surface header, and NO Origin header.
    const res = await app.inject({
      method: 'GET',
      url: '/api/ops/requests',
      headers: { cookie, [AUTH.surfaceHeader]: 'operations' },
    });
    expect(res.statusCode).toBe(200);
  });

  it('restores the operator on GET /api/auth/me with the surface header and no Origin', async () => {
    const cookie = await loginOps();
    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie, [AUTH.surfaceHeader]: 'operations' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().user).toMatchObject({ email: DEMO.ops.email, role: 'ops_agent' });
  });

  it('still honors an explicit ops Origin when no surface header is sent (fallback unchanged)', async () => {
    const cookie = await loginOps();
    const res = await app.inject({
      method: 'GET',
      url: '/api/ops/requests',
      headers: { cookie, origin: OPS_ORIGIN },
    });
    expect(res.statusCode).toBe(200);
  });

  it('without Origin AND without the surface header, the ops cookie is not resolved (documents the latent default)', async () => {
    const cookie = await loginOps();
    // No surface signal at all → request defaults to the customer surface, which
    // has no session → 401. This is the exact condition the surface header fixes.
    const res = await app.inject({ method: 'GET', url: '/api/ops/requests', headers: { cookie } });
    expect(res.statusCode).toBe(401);
  });
});

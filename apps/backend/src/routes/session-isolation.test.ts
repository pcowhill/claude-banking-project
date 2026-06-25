import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { sessionCookieName } from '@simbank/shared';
import { buildServer } from '../server';
import { DEMO, resetAuthState, seedDemo } from '../test/fixtures';

/**
 * Cross-app session isolation (v0.3.0 task W-00).
 *
 * Regression test for the human-reported v0.2.0 bug: the customer portal (:5173)
 * and the operations console (:5174) share this one backend origin, and browser
 * cookies are not isolated by port. With a single shared session cookie, an
 * operations login bled into the customer portal — after logging out of the
 * customer app, `/dashboard` showed the operator/admin instead of redirecting to
 * the customer login.
 *
 * The fix gives each surface its own session cookie, selected by the request
 * Origin. These tests drive the backend exactly as two browser tabs would: the
 * browser holds BOTH cookies and sends both to the API, and the backend must read
 * only the cookie for the surface the request came from.
 */

const CUSTOMER_ORIGIN = 'http://localhost:5173';
const OPS_ORIGIN = 'http://localhost:5174';
const CUSTOMER_COOKIE = sessionCookieName('customer'); // mer_session
const OPS_COOKIE = sessionCookieName('operations'); // mer_ops_session

describe('cross-app session isolation', () => {
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

  /** Log in from a given app surface (Origin) and return the cookie it set. */
  async function login(email: string, password: string, origin: string) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { origin },
      payload: { email, password },
    });
    const set = res.cookies.find((c) => c.name === CUSTOMER_COOKIE || c.name === OPS_COOKIE);
    return {
      statusCode: res.statusCode,
      cookieName: set?.name,
      header: set ? `${set.name}=${set.value}` : undefined,
    };
  }

  function me(origin: string, cookie: string | undefined) {
    return app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { origin, ...(cookie ? { cookie } : {}) },
    });
  }

  it('issues a different, surface-specific cookie for each app', async () => {
    const customer = await login(DEMO.customer.email, DEMO.customer.password, CUSTOMER_ORIGIN);
    const ops = await login(DEMO.admin.email, DEMO.admin.password, OPS_ORIGIN);

    expect(customer.statusCode).toBe(200);
    expect(customer.cookieName).toBe(CUSTOMER_COOKIE);
    expect(ops.statusCode).toBe(200);
    expect(ops.cookieName).toBe(OPS_COOKIE);
    // Distinct names are what keep the two sessions from clobbering each other.
    expect(customer.cookieName).not.toBe(ops.cookieName);
  });

  it('reads only the customer cookie on the customer portal, even when both cookies are present', async () => {
    const customer = await login(DEMO.customer.email, DEMO.customer.password, CUSTOMER_ORIGIN);
    const ops = await login(DEMO.admin.email, DEMO.admin.password, OPS_ORIGIN);
    const bothCookies = `${customer.header}; ${ops.header}`;

    const res = await me(CUSTOMER_ORIGIN, bothCookies);
    expect(res.statusCode).toBe(200);
    expect(res.json().user).toMatchObject({ email: DEMO.customer.email, role: 'customer' });

    // ...and the ops console reads only the ops cookie, resolving the admin.
    const opsRes = await me(OPS_ORIGIN, bothCookies);
    expect(opsRes.statusCode).toBe(200);
    expect(opsRes.json().user).toMatchObject({ email: DEMO.admin.email, role: 'admin' });
  });

  it('after a customer logout, the portal redirects to login even while an ops session is active (the reported bug)', async () => {
    const customer = await login(DEMO.customer.email, DEMO.customer.password, CUSTOMER_ORIGIN);
    const ops = await login(DEMO.admin.email, DEMO.admin.password, OPS_ORIGIN);
    const bothCookies = `${customer.header}; ${ops.header}`;

    // The customer logs out of the portal (sending both cookies, as a browser would).
    const logout = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { origin: CUSTOMER_ORIGIN, cookie: bothCookies },
    });
    expect(logout.statusCode).toBe(200);

    // Visiting /dashboard now: the portal sees NO session and returns 401, so the
    // app redirects to the customer login — exactly what the human expected. The
    // operator/admin no longer "shows through" on the customer side.
    const after = await me(CUSTOMER_ORIGIN, ops.header);
    expect(after.statusCode).toBe(401);
    expect(after.json().code).toBe('unauthenticated');

    // The operations session is untouched and still works on its own console.
    const opsStill = await me(OPS_ORIGIN, ops.header);
    expect(opsStill.statusCode).toBe(200);
    expect(opsStill.json().user).toMatchObject({ email: DEMO.admin.email, role: 'admin' });
  });

  it('an operations logout does not disturb the customer portal session (independent lifecycles)', async () => {
    const customer = await login(DEMO.customer.email, DEMO.customer.password, CUSTOMER_ORIGIN);
    const ops = await login(DEMO.ops.email, DEMO.ops.password, OPS_ORIGIN);
    const bothCookies = `${customer.header}; ${ops.header}`;

    const opsLogout = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { origin: OPS_ORIGIN, cookie: bothCookies },
    });
    expect(opsLogout.statusCode).toBe(200);

    // Customer portal still signed in.
    const customerStill = await me(CUSTOMER_ORIGIN, customer.header);
    expect(customerStill.statusCode).toBe(200);
    expect(customerStill.json().user).toMatchObject({ email: DEMO.customer.email, role: 'customer' });

    // Ops console is now logged out.
    const opsGone = await me(OPS_ORIGIN, ops.header);
    expect(opsGone.statusCode).toBe(401);
  });
});

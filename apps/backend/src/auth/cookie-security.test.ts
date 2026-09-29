import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { AUTH, sessionCookieName } from '@simbank/shared';
import { overrideConfigForTests } from '../config';
import { buildServer } from '../server';
import { DEMO, seedDemo } from '../test/fixtures';
import { baseCookieOptions, clearedCookieOptions, sessionCookieOptions } from './cookies';
import { csrfCookieOptions } from './csrf';

/**
 * Cookie attributes across BOTH deployment postures. Local http development must
 * keep working (no `Secure`, or browsers would drop the cookie), while a
 * production/HTTPS build must never send a session token in clear text. The
 * session cookie stays httpOnly; the CSRF cookie must stay readable by page JS
 * (double-submit); both stay SameSite=Lax and share the same path so the
 * clear-cookie call always matches.
 */
describe('cookie option builders', () => {
  it('development: session + csrf cookies are NOT Secure, session is httpOnly, csrf is not', () => {
    expect(sessionCookieOptions(false)).toMatchObject({
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
    });
    expect(csrfCookieOptions(false)).toMatchObject({
      httpOnly: false,
      secure: false,
      sameSite: 'lax',
      path: '/',
    });
    expect(clearedCookieOptions(false)).toMatchObject({
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
    });
  });

  it('production: both cookies are Secure; httpOnly split is unchanged', () => {
    expect(sessionCookieOptions(true)).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
    });
    expect(csrfCookieOptions(true)).toMatchObject({
      httpOnly: false,
      secure: true,
      sameSite: 'lax',
    });
    expect(clearedCookieOptions(true)).toMatchObject({ httpOnly: true, secure: true });
  });

  it('the base attributes are shared so the two cookies cannot drift', () => {
    expect(baseCookieOptions(true)).toEqual({ sameSite: 'lax', secure: true, path: '/' });
    expect(sessionCookieOptions(true).maxAge).toBe(AUTH.sessionTtlMinutes * 60);
    expect(csrfCookieOptions(true).maxAge).toBe(AUTH.sessionTtlMinutes * 60);
  });
});

describe('login sets cookies according to the runtime posture', () => {
  let app: FastifyInstance;
  let restore: (() => void) | null = null;

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();
    await seedDemo();
  });
  afterAll(async () => {
    await app.close();
  });
  afterEach(() => {
    restore?.();
    restore = null;
  });

  async function login(surface: 'customer' | 'operations', email: string, password: string) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { [AUTH.surfaceHeader]: surface },
      payload: { email, password },
    });
    expect(res.statusCode).toBe(200);
    const session = res.cookies.find((c) => c.name === sessionCookieName(surface));
    const csrf = res.cookies.find((c) => c.name === AUTH.csrfCookieName);
    return { session, csrf };
  }

  it('development posture: cookies are httpOnly (session) / readable (csrf) and NOT Secure', async () => {
    restore = overrideConfigForTests({ secureCookies: false });
    const { session, csrf } = await login('customer', DEMO.customer.email, DEMO.customer.password);
    expect(session?.httpOnly).toBe(true);
    expect(session?.secure).toBeFalsy();
    expect(session?.sameSite?.toLowerCase()).toBe('lax');
    expect(csrf?.httpOnly).toBeFalsy();
    expect(csrf?.secure).toBeFalsy();
  });

  it('production posture: the SAME cookies gain Secure, session isolation intact', async () => {
    restore = overrideConfigForTests({ secureCookies: true });
    const customer = await login('customer', DEMO.customer.email, DEMO.customer.password);
    expect(customer.session?.name).toBe(sessionCookieName('customer'));
    expect(customer.session?.httpOnly).toBe(true);
    expect(customer.session?.secure).toBe(true);
    expect(customer.csrf?.secure).toBe(true);
    expect(customer.csrf?.httpOnly).toBeFalsy(); // still readable by page JS

    const ops = await login('operations', DEMO.ops.email, DEMO.ops.password);
    expect(ops.session?.name).toBe(sessionCookieName('operations'));
    expect(ops.session?.secure).toBe(true);
    expect(ops.session?.httpOnly).toBe(true);
    expect(ops.session?.name).not.toBe(customer.session?.name);
  });

  it('production posture: logout clears the cookie with matching Secure attributes', async () => {
    restore = overrideConfigForTests({ secureCookies: true });
    const { session } = await login('customer', DEMO.customer.email, DEMO.customer.password);
    const out = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { cookie: `${session!.name}=${session!.value}` },
    });
    expect(out.statusCode).toBe(200);
    const cleared = out.cookies.find((c) => c.name === sessionCookieName('customer'));
    expect(cleared).toBeDefined();
    expect(cleared?.secure).toBe(true);
    expect(cleared?.value).toBe('');
  });
});

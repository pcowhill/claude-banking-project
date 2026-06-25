import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../server';
import { prisma } from '../db';
import { DEMO, loginAs, seedDemo } from '../test/fixtures';

describe('role-based access control', () => {
  let app: FastifyInstance;
  let checkingId = '';
  let savingsId = '';

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();
    await seedDemo();
    const accounts = await prisma.account.findMany();
    checkingId = accounts.find((a) => a.name === 'Everyday Checking')!.id;
    savingsId = accounts.find((a) => a.name === 'Goal Savings')!.id;
  });

  afterAll(async () => {
    await app.close();
  });

  async function get(url: string, cookie?: string) {
    return app.inject({ method: 'GET', url, headers: cookie ? { cookie } : {} });
  }

  describe('GET /api/accounts (own-accounts scoping)', () => {
    it('requires authentication', async () => {
      const res = await get('/api/accounts');
      expect(res.statusCode).toBe(401);
    });

    it('returns the owner BOTH of their accounts with derived balances', async () => {
      const { cookie } = await loginAs(app, DEMO.customer.email, DEMO.customer.password);
      const res = await get('/api/accounts', cookie);
      expect(res.statusCode).toBe(200);
      const accounts = res.json().accounts as Array<{ name: string; relationship: string; balances: unknown }>;
      expect(accounts.map((a) => a.name).sort()).toEqual(['Everyday Checking', 'Goal Savings']);
      expect(accounts.every((a) => a.relationship === 'owner')).toBe(true);
      expect(accounts[0].balances).toBeDefined();
    });

    it('returns a joint user ONLY the shared account, marked joint', async () => {
      const { cookie } = await loginAs(app, DEMO.joint.email, DEMO.joint.password);
      const res = await get('/api/accounts', cookie);
      expect(res.statusCode).toBe(200);
      const accounts = res.json().accounts as Array<{ name: string; relationship: string }>;
      expect(accounts).toHaveLength(1);
      expect(accounts[0]).toMatchObject({ name: 'Everyday Checking', relationship: 'joint' });
    });

    it('returns no banking accounts for an operator', async () => {
      const { cookie } = await loginAs(app, DEMO.ops.email, DEMO.ops.password);
      const res = await get('/api/accounts', cookie);
      expect(res.statusCode).toBe(200);
      expect(res.json().accounts).toHaveLength(0);
    });
  });

  describe('GET /api/accounts/:id (ownership checks)', () => {
    it('lets the owner read their own account', async () => {
      const { cookie } = await loginAs(app, DEMO.customer.email, DEMO.customer.password);
      const res = await get(`/api/accounts/${savingsId}`, cookie);
      expect(res.statusCode).toBe(200);
      expect(res.json().account).toMatchObject({ name: 'Goal Savings', relationship: 'owner' });
    });

    it('lets a joint user read the shared account', async () => {
      const { cookie } = await loginAs(app, DEMO.joint.email, DEMO.joint.password);
      const res = await get(`/api/accounts/${checkingId}`, cookie);
      expect(res.statusCode).toBe(200);
      expect(res.json().account).toMatchObject({ relationship: 'joint' });
    });

    it('forbids a joint user from an account they were NOT granted', async () => {
      const { cookie } = await loginAs(app, DEMO.joint.email, DEMO.joint.password);
      const res = await get(`/api/accounts/${savingsId}`, cookie);
      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe('forbidden');
    });

    it('forbids an operator from a customer account', async () => {
      const { cookie } = await loginAs(app, DEMO.ops.email, DEMO.ops.password);
      const res = await get(`/api/accounts/${checkingId}`, cookie);
      expect(res.statusCode).toBe(403);
    });

    it('404s for an account that does not exist', async () => {
      const { cookie } = await loginAs(app, DEMO.customer.email, DEMO.customer.password);
      const res = await get('/api/accounts/this-id-does-not-exist', cookie);
      expect(res.statusCode).toBe(404);
    });
  });

  describe('role-gated endpoints', () => {
    it('GET /api/ops/summary is allowed for ops and admin, forbidden for customers', async () => {
      const ops = await loginAs(app, DEMO.ops.email, DEMO.ops.password);
      const opsRes = await get('/api/ops/summary', ops.cookie);
      expect(opsRes.statusCode).toBe(200);
      expect(opsRes.json()).toMatchObject({ users: expect.any(Number), accounts: expect.any(Number) });

      const admin = await loginAs(app, DEMO.admin.email, DEMO.admin.password);
      expect((await get('/api/ops/summary', admin.cookie)).statusCode).toBe(200);

      const customer = await loginAs(app, DEMO.customer.email, DEMO.customer.password);
      const denied = await get('/api/ops/summary', customer.cookie);
      expect(denied.statusCode).toBe(403);
      expect(denied.json().code).toBe('forbidden');
    });

    it('GET /api/admin/users is admin-only and never leaks password hashes', async () => {
      const customer = await loginAs(app, DEMO.customer.email, DEMO.customer.password);
      expect((await get('/api/admin/users', customer.cookie)).statusCode).toBe(403);

      const ops = await loginAs(app, DEMO.ops.email, DEMO.ops.password);
      expect((await get('/api/admin/users', ops.cookie)).statusCode).toBe(403);

      const admin = await loginAs(app, DEMO.admin.email, DEMO.admin.password);
      const res = await get('/api/admin/users', admin.cookie);
      expect(res.statusCode).toBe(200);
      const users = res.json().users as Array<Record<string, unknown>>;
      expect(users).toHaveLength(4);
      for (const u of users) {
        expect(u.passwordHash).toBeUndefined();
        expect('passwordHash' in u).toBe(false);
      }
    });
  });
});

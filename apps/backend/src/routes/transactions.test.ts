import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { TransactionDTO } from '@simbank/shared';
import { buildServer } from '../server';
import { prisma } from '../db';
import { DEMO, loginAs, seedDemo } from '../test/fixtures';

/**
 * GET /api/accounts/:id/transactions (v0.4.0). Proves the endpoint is scoped by
 * the SAME access rules as the single-account read, that the derived view
 * (newest-first + running settled balance + pending vs posted) is correct, and
 * that the `?q=&group=&origin=` search/filter is honored server-side.
 */
describe('account transactions endpoint', () => {
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

  function get(url: string, cookie?: string) {
    return app.inject({ method: 'GET', url, headers: cookie ? { cookie } : {} });
  }

  it('requires authentication', async () => {
    expect((await get(`/api/accounts/${checkingId}/transactions`)).statusCode).toBe(401);
  });

  it('returns the account header + its transactions newest-first for the owner', async () => {
    const { cookie } = await loginAs(app, DEMO.customer.email, DEMO.customer.password);
    const res = await get(`/api/accounts/${checkingId}/transactions`, cookie);
    expect(res.statusCode).toBe(200);
    const body = res.json() as { account: { name: string }; transactions: TransactionDTO[] };
    expect(body.account).toMatchObject({ name: 'Everyday Checking', relationship: 'owner' });
    expect(body.transactions.length).toBeGreaterThan(10);

    // Newest-first by effective time (postedAt ?? createdAt), descending.
    const times = body.transactions.map((t) => Date.parse(t.postedAt ?? t.createdAt));
    const sorted = [...times].sort((a, b) => b - a);
    expect(times).toEqual(sorted);

    // A settled entry carries a running balance; a pending one does not.
    expect(body.transactions.some((t) => t.status === 'posted' && t.runningBalanceMinor !== null)).toBe(true);
    expect(body.transactions.some((t) => t.status === 'pending' && t.runningBalanceMinor === null)).toBe(true);
  });

  it('lets a joint user read the shared checking transactions', async () => {
    const { cookie } = await loginAs(app, DEMO.joint.email, DEMO.joint.password);
    const res = await get(`/api/accounts/${checkingId}/transactions`, cookie);
    expect(res.statusCode).toBe(200);
    expect(res.json().account).toMatchObject({ relationship: 'joint' });
  });

  it('forbids a joint user from an account they were NOT granted (403)', async () => {
    const { cookie } = await loginAs(app, DEMO.joint.email, DEMO.joint.password);
    const res = await get(`/api/accounts/${savingsId}/transactions`, cookie);
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('forbidden');
  });

  it('forbids an operator from a customer account (403)', async () => {
    const { cookie } = await loginAs(app, DEMO.ops.email, DEMO.ops.password);
    expect((await get(`/api/accounts/${checkingId}/transactions`, cookie)).statusCode).toBe(403);
  });

  it('404s for an account that does not exist', async () => {
    const { cookie } = await loginAs(app, DEMO.customer.email, DEMO.customer.password);
    expect((await get('/api/accounts/no-such-account/transactions', cookie)).statusCode).toBe(404);
  });

  it('filters to the pending group server-side', async () => {
    const { cookie } = await loginAs(app, DEMO.customer.email, DEMO.customer.password);
    const res = await get(`/api/accounts/${checkingId}/transactions?group=pending`, cookie);
    expect(res.statusCode).toBe(200);
    const txns = res.json().transactions as TransactionDTO[];
    expect(txns.length).toBeGreaterThan(0);
    expect(txns.every((t) => t.status === 'pending' || t.status === 'held')).toBe(true);
  });

  it('searches the description (case-insensitive) server-side', async () => {
    const { cookie } = await loginAs(app, DEMO.customer.email, DEMO.customer.password);
    const res = await get(`/api/accounts/${checkingId}/transactions?q=simmons`, cookie);
    expect(res.statusCode).toBe(200);
    const txns = res.json().transactions as TransactionDTO[];
    expect(txns.length).toBeGreaterThan(0);
    expect(txns.every((t) => /simmons/i.test(t.description))).toBe(true);
  });

  it('filters by origin server-side', async () => {
    const { cookie } = await loginAs(app, DEMO.customer.email, DEMO.customer.password);
    const res = await get(`/api/accounts/${checkingId}/transactions?origin=interest`, cookie);
    expect(res.statusCode).toBe(200);
    // Checking has no interest entries; interest accrues on savings.
    expect((res.json().transactions as TransactionDTO[]).length).toBe(0);
  });

  it('ignores an unknown filter value rather than erroring', async () => {
    const { cookie } = await loginAs(app, DEMO.customer.email, DEMO.customer.password);
    const res = await get(`/api/accounts/${checkingId}/transactions?group=bogus&origin=nonsense`, cookie);
    expect(res.statusCode).toBe(200);
    // Unknown values are dropped, so the full set comes back.
    expect((res.json().transactions as TransactionDTO[]).length).toBeGreaterThan(10);
  });
});

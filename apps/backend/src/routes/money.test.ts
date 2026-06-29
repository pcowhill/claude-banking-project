import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { buildServer } from '../server';
import { prisma } from '../db';
import { RecordingOpsRealtime } from '../ops/realtime';
import { DEMO, loginAs, mutatingHeaders, seedDemo } from '../test/fixtures';

/**
 * Integration tests for v0.7.0 money movement: the customer endpoints (immediate
 * internal transfer; reviewable external movement), the operator APPROVAL that
 * POSTS a pending movement (incl. the carried-forward Q-01 deposit pending →
 * posted), rejection → failed, the ops reversal (posted → reversed), RBAC, and —
 * above all — the MONEY DISCIPLINE invariants: money only ever moves via ledger
 * entries, a transfer nets to zero, and the settled total only changes by a
 * bank-originated credit or a posted debit. Balances stay derived throughout.
 */
describe('money movement (v0.7.0)', () => {
  let app: FastifyInstance;
  const realtime = new RecordingOpsRealtime();
  let ops = { cookie: undefined as string | undefined };
  let customer = { cookie: undefined as string | undefined };
  let joint = { cookie: undefined as string | undefined };

  beforeAll(async () => {
    app = await buildServer({ opsRealtime: realtime });
    await app.ready();
    await seedDemo();
    ops = { cookie: (await loginAs(app, DEMO.ops.email, DEMO.ops.password)).cookie };
    customer = { cookie: (await loginAs(app, DEMO.customer.email, DEMO.customer.password)).cookie };
    joint = { cookie: (await loginAs(app, DEMO.joint.email, DEMO.joint.password)).cookie };
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    realtime.changes.length = 0;
    realtime.events.length = 0;
  });

  function get(url: string, cookie?: string) {
    return app.inject({ method: 'GET', url, headers: mutatingHeaders(cookie) });
  }
  function post(url: string, cookie?: string, payload?: InjectOptions['payload']) {
    return app.inject({ method: 'POST', url, headers: mutatingHeaders(cookie), payload });
  }

  /** Net signed total of settled (posted/disputed) ledger entries across the system. */
  async function settledTotal(): Promise<number> {
    const rows = await prisma.ledgerEntry.findMany({
      where: { status: { in: ['posted', 'disputed'] } },
      select: { amountMinor: true, direction: true },
    });
    return rows.reduce((s, r) => s + (r.direction === 'credit' ? r.amountMinor : -r.amountMinor), 0);
  }

  async function averyAccounts() {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: DEMO.customer.email } });
    const checking = await prisma.account.findFirstOrThrow({ where: { userId: user.id, type: 'checking' } });
    const savings = await prisma.account.findFirstOrThrow({ where: { userId: user.id, type: 'savings' } });
    return { checking, savings };
  }

  /** Available balance for an account, as the customer's own dashboard would derive it. */
  async function availableViaApi(accountId: string): Promise<number> {
    const res = await get(`/api/accounts/${accountId}`, customer.cookie);
    return (res.json().account.balances.availableMinor as number);
  }

  // ---- Internal transfer ----------------------------------------------------

  describe('POST /api/transfers (internal, immediate)', () => {
    it('posts BOTH legs, nets to zero (settled total unchanged), and updates derived balances', async () => {
      const { checking, savings } = await averyAccounts();
      const totalBefore = await settledTotal();
      const checkingBefore = await availableViaApi(checking.id);
      const savingsBefore = await availableViaApi(savings.id);

      const res = await post('/api/transfers', customer.cookie, {
        fromAccountId: checking.id,
        toAccountId: savings.id,
        amountMinor: 100_00,
        memo: 'Move to savings',
      });
      expect(res.statusCode).toBe(201);

      // Both legs exist as posted `transfer` entries.
      const legs = await prisma.ledgerEntry.findMany({
        where: { origin: 'transfer', status: 'posted', accountId: { in: [checking.id, savings.id] }, description: { contains: 'Move to savings' } },
      });
      expect(legs).toHaveLength(2);
      expect(legs.find((l) => l.accountId === checking.id)!.direction).toBe('debit');
      expect(legs.find((l) => l.accountId === savings.id)!.direction).toBe('credit');

      // The MONEY SUPPLY did not change — a transfer creates nothing.
      expect(await settledTotal()).toBe(totalBefore);
      // Source down, destination up, by exactly the amount.
      expect(await availableViaApi(checking.id)).toBe(checkingBefore - 100_00);
      expect(await availableViaApi(savings.id)).toBe(savingsBefore + 100_00);

      // Audited.
      const audit = await prisma.auditLog.findFirst({ where: { action: 'money_transfer', entityId: checking.id } });
      expect(audit).not.toBeNull();
    });

    it('rejects a transfer that exceeds available funds (400) and posts nothing', async () => {
      const { checking, savings } = await averyAccounts();
      const before = await prisma.ledgerEntry.count();
      const avail = await availableViaApi(checking.id);
      const res = await post('/api/transfers', customer.cookie, {
        fromAccountId: checking.id,
        toAccountId: savings.id,
        amountMinor: avail + 1_00, // a dollar over available (still within the $50k cap)
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe('insufficient_funds');
      expect(await prisma.ledgerEntry.count()).toBe(before);
    });

    it('forbids transferring from an account the caller cannot access (403)', async () => {
      const { checking, savings } = await averyAccounts();
      // Jordan (joint) can see checking but NOT savings → cannot pull from savings.
      const res = await post('/api/transfers', joint.cookie, {
        fromAccountId: savings.id,
        toAccountId: checking.id,
        amountMinor: 10_00,
      });
      expect(res.statusCode).toBe(403);
    });

    it('rejects same-source-and-destination and missing fields (400)', async () => {
      const { checking } = await averyAccounts();
      expect((await post('/api/transfers', customer.cookie, { fromAccountId: checking.id, toAccountId: checking.id, amountMinor: 100 })).statusCode).toBe(400);
      expect((await post('/api/transfers', customer.cookie, { amountMinor: 100 })).statusCode).toBe(400);
    });

    it('requires authentication (401)', async () => {
      const { checking, savings } = await averyAccounts();
      expect((await post('/api/transfers', undefined, { fromAccountId: checking.id, toAccountId: savings.id, amountMinor: 100 })).statusCode).toBe(401);
    });
  });

  // ---- External reviewable movement -----------------------------------------

  describe('POST /api/movements (external, reviewable)', () => {
    it('queues a mobile check deposit as a PENDING credit + a deposit ops request (no money yet)', async () => {
      const { checking } = await averyAccounts();
      const totalBefore = await settledTotal();

      const res = await post('/api/movements', customer.cookie, {
        accountId: checking.id,
        kind: 'mobile_check_deposit',
        amountMinor: 250_00,
      });
      expect(res.statusCode).toBe(201);
      const body = res.json() as { reference: string; status: string; kind: string };
      expect(body.status).toBe('pending_review');
      expect(body.reference).toMatch(/^MOV-/);

      // A pending CREDIT entry was written; the settled total did NOT move yet.
      const pending = await prisma.ledgerEntry.findFirst({
        where: { accountId: checking.id, status: 'pending', direction: 'credit', origin: 'deposit', amountMinor: 250_00 },
        // Sim-clock dating (v1.0.0/ADR-0003) can give same-session entries an
      // identical createdAt, so break ties by id (cuid is timestamp-prefixed →
      // newest last/largest) to deterministically pick the just-created request.
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
      expect(pending).not.toBeNull();
      expect(await settledTotal()).toBe(totalBefore);

      // A linked ops request carries the movement payload + the soft link.
      const request = await prisma.operationsRequest.findFirst({
        where: { type: 'deposit', subjectEmail: DEMO.customer.email },
        // Sim-clock dating (v1.0.0/ADR-0003) can give same-session entries an
      // identical createdAt, so break ties by id (cuid is timestamp-prefixed →
      // newest last/largest) to deterministically pick the just-created request.
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
      expect(request).not.toBeNull();
      const payload = JSON.parse(request!.payload!) as { ledgerEntryIds: string[]; kind: string };
      expect(payload.kind).toBe('mobile_check_deposit');
      expect(payload.ledgerEntryIds).toContain(pending!.id);

      // Pushed live to operators.
      expect(realtime.changes.some((c) => c.request.id === request!.id && c.change === 'created')).toBe(true);
    });

    it('reserves available funds for an outbound movement and rejects one over balance', async () => {
      const { checking } = await averyAccounts();
      const availBefore = await availableViaApi(checking.id);

      const res = await post('/api/movements', customer.cookie, {
        accountId: checking.id,
        kind: 'bill_pay',
        amountMinor: 40_00,
        counterparty: 'City Power',
      });
      expect(res.statusCode).toBe(201);
      // The pending debit immediately reserves available (a hold).
      expect(await availableViaApi(checking.id)).toBe(availBefore - 40_00);

      // Over-balance outbound is refused.
      const availNow = await availableViaApi(checking.id);
      const over = await post('/api/movements', customer.cookie, {
        accountId: checking.id,
        kind: 'wire',
        amountMinor: availNow + 1_00, // a dollar over available (within the $50k cap)
        counterparty: 'Acme LLC',
      });
      expect(over.statusCode).toBe(400);
      expect(over.json().code).toBe('insufficient_funds');
    });

    it('requires authentication (401)', async () => {
      const { checking } = await averyAccounts();
      expect((await post('/api/movements', undefined, { accountId: checking.id, kind: 'mobile_check_deposit', amountMinor: 100 })).statusCode).toBe(401);
    });
  });

  // ---- Approval posts the movement (the heart + Q-01) -----------------------

  describe('operator approval posts the movement', () => {
    it('approving the seeded mobile check deposit posts it: pending → posted, available updates (Q-01)', async () => {
      const { checking } = await averyAccounts();
      const request = await prisma.operationsRequest.findFirstOrThrow({
        where: { type: 'deposit', summary: { contains: 'Mobile check deposit awaiting review' } },
      });
      const payload = JSON.parse(request.payload!) as { ledgerEntryIds: string[]; amountMinor: number };
      const entryId = payload.ledgerEntryIds[0];

      // Before: the linked entry is pending and the $320 is NOT in available.
      const before = await prisma.ledgerEntry.findUniqueOrThrow({ where: { id: entryId } });
      expect(before.status).toBe('pending');
      const availBefore = await availableViaApi(checking.id);
      const totalBefore = await settledTotal();

      const res = await post(`/api/ops/requests/${request.id}/action`, ops.cookie, { action: 'approve' });
      expect(res.statusCode).toBe(200);
      expect(res.json().request.status).toBe('approved');

      // After: the entry is POSTED (a bank-originated deposit credit).
      const after = await prisma.ledgerEntry.findUniqueOrThrow({ where: { id: entryId } });
      expect(after.status).toBe('posted');
      expect(after.postedAt).not.toBeNull();

      // The customer's available balance and the system settled total both rose
      // by exactly the deposit — and the customer's line no longer reads pending.
      expect(await availableViaApi(checking.id)).toBe(availBefore + payload.amountMinor);
      expect(await settledTotal()).toBe(totalBefore + payload.amountMinor);
      const txns = await get(`/api/accounts/${checking.id}/transactions`, customer.cookie);
      const line = (txns.json().transactions as Array<{ id: string; status: string }>).find((t) => t.id === entryId);
      expect(line!.status).toBe('posted');

      // A "posted" simulated event was emitted to operators.
      expect(realtime.events.some((e) => e.summary.toLowerCase().includes('posted'))).toBe(true);
    });

    it('approving an outbound movement posts the debit (settled total falls by the amount)', async () => {
      const { checking } = await averyAccounts();
      await post('/api/movements', customer.cookie, { accountId: checking.id, kind: 'wire', amountMinor: 60_00, counterparty: 'Acme LLC' });
      const request = await prisma.operationsRequest.findFirstOrThrow({
        where: { type: 'wire', subjectEmail: DEMO.customer.email, status: 'pending' },
        // Sim-clock dating (v1.0.0/ADR-0003) can give same-session entries an
      // identical createdAt, so break ties by id (cuid is timestamp-prefixed →
      // newest last/largest) to deterministically pick the just-created request.
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
      const totalBefore = await settledTotal();
      await post(`/api/ops/requests/${request.id}/action`, ops.cookie, { action: 'approve' });
      const payload = JSON.parse((await prisma.operationsRequest.findUniqueOrThrow({ where: { id: request.id } })).payload!) as { ledgerEntryIds: string[] };
      const entry = await prisma.ledgerEntry.findUniqueOrThrow({ where: { id: payload.ledgerEntryIds[0] } });
      expect(entry.status).toBe('posted');
      expect(entry.direction).toBe('debit');
      // Money left the system: settled total fell by the amount.
      expect(await settledTotal()).toBe(totalBefore - 60_00);
    });

    it('rejecting a movement marks the pending entry failed and restores reserved funds', async () => {
      const { checking } = await averyAccounts();
      const availStart = await availableViaApi(checking.id);
      await post('/api/movements', customer.cookie, { accountId: checking.id, kind: 'bill_pay', amountMinor: 30_00, counterparty: 'Metro Water' });
      const request = await prisma.operationsRequest.findFirstOrThrow({
        where: { type: 'bill_pay', subjectEmail: DEMO.customer.email, status: 'pending' },
        // Sim-clock dating (v1.0.0/ADR-0003) can give same-session entries an
      // identical createdAt, so break ties by id (cuid is timestamp-prefixed →
      // newest last/largest) to deterministically pick the just-created request.
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
      // Reserved while pending.
      expect(await availableViaApi(checking.id)).toBe(availStart - 30_00);

      const res = await post(`/api/ops/requests/${request.id}/action`, ops.cookie, { action: 'reject' });
      expect(res.statusCode).toBe(200);
      const payload = JSON.parse((await prisma.operationsRequest.findUniqueOrThrow({ where: { id: request.id } })).payload!) as { ledgerEntryIds: string[] };
      const entry = await prisma.ledgerEntry.findUniqueOrThrow({ where: { id: payload.ledgerEntryIds[0] } });
      expect(entry.status).toBe('failed');
      // Funds released back to available.
      expect(await availableViaApi(checking.id)).toBe(availStart);
    });

    it('holding a movement leaves the ledger entry pending (no money moved)', async () => {
      const { checking } = await averyAccounts();
      await post('/api/movements', customer.cookie, { accountId: checking.id, kind: 'mobile_check_deposit', amountMinor: 15_00 });
      const request = await prisma.operationsRequest.findFirstOrThrow({
        where: { type: 'deposit', subjectEmail: DEMO.customer.email, status: 'pending' },
        // Sim-clock dating (v1.0.0/ADR-0003) can give same-session entries an
      // identical createdAt, so break ties by id (cuid is timestamp-prefixed →
      // newest last/largest) to deterministically pick the just-created request.
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
      await post(`/api/ops/requests/${request.id}/action`, ops.cookie, { action: 'hold' });
      const payload = JSON.parse((await prisma.operationsRequest.findUniqueOrThrow({ where: { id: request.id } })).payload!) as { ledgerEntryIds: string[] };
      const entry = await prisma.ledgerEntry.findUniqueOrThrow({ where: { id: payload.ledgerEntryIds[0] } });
      expect(entry.status).toBe('pending');
    });

    it('approving a deposit request with NO movement payload posts nothing (legacy/workflow item)', async () => {
      const bare = await prisma.operationsRequest.create({
        data: { type: 'deposit', status: 'pending', priority: 'normal', summary: 'Bare deposit review' },
      });
      const before = await prisma.ledgerEntry.count();
      await post(`/api/ops/requests/${bare.id}/action`, ops.cookie, { action: 'approve' });
      expect(await prisma.ledgerEntry.count()).toBe(before);
    });
  });

  // ---- Reversal -------------------------------------------------------------

  describe('POST /api/ops/movements/:requestId/reverse', () => {
    async function approvedDeposit(amountMinor: number) {
      const { checking } = await averyAccounts();
      await post('/api/movements', customer.cookie, { accountId: checking.id, kind: 'mobile_check_deposit', amountMinor });
      const request = await prisma.operationsRequest.findFirstOrThrow({
        where: { type: 'deposit', subjectEmail: DEMO.customer.email, status: 'pending' },
        // Sim-clock dating (v1.0.0/ADR-0003) can give same-session entries an
      // identical createdAt, so break ties by id (cuid is timestamp-prefixed →
      // newest last/largest) to deterministically pick the just-created request.
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
      await post(`/api/ops/requests/${request.id}/action`, ops.cookie, { action: 'approve' });
      return request;
    }

    it('reverses a posted movement (posted → reversed), removing its balance effect, with a reason + audit', async () => {
      const request = await approvedDeposit(80_00);
      const payload = JSON.parse((await prisma.operationsRequest.findUniqueOrThrow({ where: { id: request.id } })).payload!) as { ledgerEntryIds: string[] };
      const totalAfterPost = await settledTotal();

      const res = await post(`/api/ops/movements/${request.id}/reverse`, ops.cookie, { reason: 'Check returned unpaid (simulated)' });
      expect(res.statusCode).toBe(200);

      const entry = await prisma.ledgerEntry.findUniqueOrThrow({ where: { id: payload.ledgerEntryIds[0] } });
      expect(entry.status).toBe('reversed');
      // The reversal removed the posted credit's effect.
      expect(await settledTotal()).toBe(totalAfterPost - 80_00);

      const audit = await prisma.auditLog.findFirst({ where: { action: 'movement_reversed', entityId: payload.ledgerEntryIds[0] } });
      expect(audit!.reason).toBe('Check returned unpaid (simulated)');
      expect(realtime.events.some((e) => e.summary.toLowerCase().includes('reversed'))).toBe(true);
    });

    it('requires a reason (400)', async () => {
      const request = await approvedDeposit(20_00);
      expect((await post(`/api/ops/movements/${request.id}/reverse`, ops.cookie, { reason: '  ' })).statusCode).toBe(400);
    });

    it('409s when there is nothing posted to reverse (still pending)', async () => {
      const { checking } = await averyAccounts();
      await post('/api/movements', customer.cookie, { accountId: checking.id, kind: 'mobile_check_deposit', amountMinor: 12_00 });
      const request = await prisma.operationsRequest.findFirstOrThrow({
        where: { type: 'deposit', subjectEmail: DEMO.customer.email, status: 'pending' },
        // Sim-clock dating (v1.0.0/ADR-0003) can give same-session entries an
      // identical createdAt, so break ties by id (cuid is timestamp-prefixed →
      // newest last/largest) to deterministically pick the just-created request.
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
      const res = await post(`/api/ops/movements/${request.id}/reverse`, ops.cookie, { reason: 'too soon' });
      expect(res.statusCode).toBe(409);
    });

    it('400s for a request that is not a money movement', async () => {
      const support = await prisma.operationsRequest.create({
        data: { type: 'support_message', status: 'pending', priority: 'normal', summary: 'Not a movement' },
      });
      const res = await post(`/api/ops/movements/${support.id}/reverse`, ops.cookie, { reason: 'x' });
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe('not_a_movement');
    });

    it('forbids a customer from reversing (403)', async () => {
      const request = await approvedDeposit(10_00);
      expect((await post(`/api/ops/movements/${request.id}/reverse`, customer.cookie, { reason: 'nope' })).statusCode).toBe(403);
    });
  });
});

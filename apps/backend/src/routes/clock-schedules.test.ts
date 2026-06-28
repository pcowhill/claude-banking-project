import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { buildServer } from '../server';
import { prisma } from '../db';
import { RecordingOpsRealtime } from '../ops/realtime';
import { DEMO, loginAs, seedDemo } from '../test/fixtures';

/**
 * Integration tests for v0.9.0 — the simulation clock + the clock-driven
 * scheduler + statement cycles. Above all the MONEY DISCIPLINE: a scheduled fire
 * moves money ONLY via ledger entries (an internal transfer nets to zero; a bill
 * pay queues a pending review), the clock is forward-only and ops-gated, and
 * customers can only schedule on their own accounts.
 */
describe('simulation clock + scheduler (v0.9.0)', () => {
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
    return app.inject({ method: 'GET', url, headers: cookie ? { cookie } : {} });
  }
  function post(url: string, cookie?: string, payload?: InjectOptions['payload']) {
    return app.inject({ method: 'POST', url, headers: cookie ? { cookie } : {}, payload });
  }

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

  async function availableViaApi(accountId: string): Promise<number> {
    const res = await get(`/api/accounts/${accountId}`, customer.cookie);
    return res.json().account.balances.availableMinor as number;
  }

  /** Cancel every active schedule so a firing test only fires the one it creates. */
  async function cleanSlate(): Promise<void> {
    await prisma.paymentSchedule.updateMany({
      where: { status: 'active' },
      data: { status: 'cancelled', nextRunAt: null },
    });
  }

  async function createSchedule(payload: Record<string, unknown>, cookie = customer.cookie) {
    return post('/api/schedules', cookie, payload);
  }
  async function advance(body: Record<string, unknown>, cookie = ops.cookie) {
    return post('/api/ops/clock/advance', cookie, body);
  }

  // ---- Clock read + RBAC ----------------------------------------------------

  describe('clock read + forward-only advance (RBAC)', () => {
    it('any signed-in user can read the simulated date', async () => {
      const res = await get('/api/clock', customer.cookie);
      expect(res.statusCode).toBe(200);
      expect(typeof res.json().clock.currentTime).toBe('string');
      expect(Number.isNaN(Date.parse(res.json().clock.currentTime))).toBe(false);
    });

    it('a customer cannot advance the clock or list all schedules (403)', async () => {
      expect((await advance({ days: 1 }, customer.cookie)).statusCode).toBe(403);
      expect((await get('/api/ops/schedules', customer.cookie)).statusCode).toBe(403);
    });

    it('the clock is forward-only: a zero or negative advance is rejected', async () => {
      expect((await advance({ minutes: 0 })).statusCode).toBe(400);
      expect((await advance({ days: -1 })).statusCode).toBe(400);
    });

    it('advancing moves the clock strictly forward', async () => {
      const before = Date.parse((await get('/api/clock', ops.cookie)).json().clock.currentTime);
      const res = await advance({ hours: 1 });
      expect(res.statusCode).toBe(200);
      const after = Date.parse(res.json().clock.currentTime);
      expect(after).toBe(before + 60 * 60 * 1000);
    });
  });

  // ---- Schedule CRUD + RBAC -------------------------------------------------

  describe('schedule CRUD + access control', () => {
    it('creates an internal-transfer schedule (no money moves yet)', async () => {
      const { checking, savings } = await averyAccounts();
      const before = await settledTotal();
      const res = await createSchedule({
        kind: 'internal_transfer',
        fromAccountId: checking.id,
        toAccountId: savings.id,
        amountMinor: 50_00,
        frequency: 'monthly',
        firstRunInDays: 10,
        memo: 'CRUD test',
      });
      expect(res.statusCode).toBe(201);
      const dto = res.json().schedule;
      expect(dto.status).toBe('active');
      expect(dto.runCount).toBe(0);
      expect(typeof dto.nextRunAt).toBe('string');
      // Creating a schedule does not move money.
      expect(await settledTotal()).toBe(before);
    });

    it('rejects a bill-pay schedule with no biller (400 + field errors)', async () => {
      const { checking } = await averyAccounts();
      const res = await createSchedule({
        kind: 'bill_pay',
        fromAccountId: checking.id,
        amountMinor: 25_00,
        frequency: 'monthly',
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().fields.counterparty).toBeTruthy();
    });

    it('forbids scheduling on an account the caller cannot access (403)', async () => {
      const { savings } = await averyAccounts(); // Jordan (joint) has access to checking only
      const res = await createSchedule(
        { kind: 'bill_pay', fromAccountId: savings.id, counterparty: 'X', amountMinor: 10_00, frequency: 'once' },
        joint.cookie,
      );
      expect(res.statusCode).toBe(403);
    });

    it('lists the caller’s own schedules; an operator sees all', async () => {
      const mine = (await get('/api/schedules', customer.cookie)).json().schedules;
      expect(Array.isArray(mine)).toBe(true);
      expect(mine.length).toBeGreaterThanOrEqual(1);
      const all = (await get('/api/ops/schedules', ops.cookie)).json().schedules;
      // The seed planted 2 schedules for Avery, so ops sees at least those.
      expect(all.length).toBeGreaterThanOrEqual(2);
    });

    it('cancels an active schedule (owner only); re-cancel is 409', async () => {
      const { checking, savings } = await averyAccounts();
      const created = (
        await createSchedule({
          kind: 'internal_transfer',
          fromAccountId: checking.id,
          toAccountId: savings.id,
          amountMinor: 12_00,
          frequency: 'monthly',
          firstRunInDays: 20,
        })
      ).json().schedule;

      // Another customer cannot cancel it.
      expect((await post(`/api/schedules/${created.id}/cancel`, joint.cookie)).statusCode).toBe(403);

      const res = await post(`/api/schedules/${created.id}/cancel`, customer.cookie);
      expect(res.statusCode).toBe(200);
      expect(res.json().schedule.status).toBe('cancelled');
      expect(res.json().schedule.nextRunAt).toBeNull();

      expect((await post(`/api/schedules/${created.id}/cancel`, customer.cookie)).statusCode).toBe(409);
    });
  });

  // ---- Firing on clock advance ----------------------------------------------

  describe('firing due schedules on clock advance', () => {
    beforeEach(cleanSlate);

    it('fires a due internal transfer: posts BOTH legs (nets to zero), moves derived balances', async () => {
      const { checking, savings } = await averyAccounts();
      const created = (
        await createSchedule({
          kind: 'internal_transfer',
          fromAccountId: checking.id,
          toAccountId: savings.id,
          amountMinor: 70_00,
          frequency: 'monthly',
          firstRunInDays: 1,
        })
      ).json().schedule;

      const totalBefore = await settledTotal();
      const checkingBefore = await availableViaApi(checking.id);
      const savingsBefore = await availableViaApi(savings.id);

      const res = await advance({ days: 2 });
      expect(res.statusCode).toBe(200);
      const summary = res.json().fired.find((f: { scheduleId: string }) => f.scheduleId === created.id);
      expect(summary).toMatchObject({ runs: 1, postedMinor: 70_00, skipped: 0 });

      // Both legs posted at the DUE date; nets to zero (settled total unchanged).
      expect(await settledTotal()).toBe(totalBefore);
      expect(await availableViaApi(checking.id)).toBe(checkingBefore - 70_00);
      expect(await availableViaApi(savings.id)).toBe(savingsBefore + 70_00);

      const after = (await get('/api/schedules', customer.cookie)).json().schedules.find(
        (s: { id: string }) => s.id === created.id,
      );
      expect(after.runCount).toBe(1);
      expect(after.lastRunAt).not.toBeNull();
      expect(after.status).toBe('active'); // monthly → still active, next month scheduled
      expect(Date.parse(after.nextRunAt)).toBeGreaterThan(Date.parse(created.nextRunAt));
    });

    it('fires a due bill pay: queues a PENDING review an operator then posts', async () => {
      const { checking } = await averyAccounts();
      const biller = 'Test Biller QZX';
      const created = (
        await createSchedule({
          kind: 'bill_pay',
          fromAccountId: checking.id,
          counterparty: biller,
          amountMinor: 33_00,
          frequency: 'once',
          firstRunInDays: 1,
        })
      ).json().schedule;

      const totalBefore = await settledTotal();
      const res = await advance({ days: 2 });
      const summary = res.json().fired.find((f: { scheduleId: string }) => f.scheduleId === created.id);
      expect(summary).toMatchObject({ runs: 1, queuedMinor: 33_00 });
      expect(summary.status).toBe('completed'); // a one-time schedule is done after firing

      // A pending bill-pay review now exists with a pending payment debit; nothing posted yet.
      expect(await settledTotal()).toBe(totalBefore);
      const request = await prisma.operationsRequest.findFirstOrThrow({
        where: { type: 'bill_pay', status: 'pending', summary: { contains: biller } },
        orderBy: { createdAt: 'desc' },
      });
      const payload = JSON.parse(request.payload!) as { ledgerEntryIds: string[] };
      const pending = await prisma.ledgerEntry.findUniqueOrThrow({ where: { id: payload.ledgerEntryIds[0] } });
      expect(pending.status).toBe('pending');
      expect(pending.direction).toBe('debit');

      // The operator approves → it posts; money leaves the system.
      await post(`/api/ops/requests/${request.id}/action`, ops.cookie, { action: 'approve' });
      const posted = await prisma.ledgerEntry.findUniqueOrThrow({ where: { id: payload.ledgerEntryIds[0] } });
      expect(posted.status).toBe('posted');
      expect(await settledTotal()).toBe(totalBefore - 33_00);
    });

    it('catches up multiple missed occurrences when the clock jumps several periods', async () => {
      const { checking, savings } = await averyAccounts();
      const created = (
        await createSchedule({
          kind: 'internal_transfer',
          fromAccountId: checking.id,
          toAccountId: savings.id,
          amountMinor: 5_00,
          frequency: 'weekly',
          firstRunInDays: 0,
        })
      ).json().schedule;

      const res = await advance({ days: 21 });
      const summary = res.json().fired.find((f: { scheduleId: string }) => f.scheduleId === created.id);
      expect(summary.runs).toBeGreaterThanOrEqual(3); // ~weekly over 3 weeks
      const after = (await get('/api/schedules', customer.cookie)).json().schedules.find(
        (s: { id: string }) => s.id === created.id,
      );
      expect(after.runCount).toBe(summary.runs);
    });

    it('skips (does not fire) an occurrence with insufficient funds, recording it', async () => {
      const { checking, savings } = await averyAccounts();
      const created = (
        await createSchedule({
          kind: 'internal_transfer',
          fromAccountId: checking.id,
          toAccountId: savings.id,
          amountMinor: 49_999_00, // far exceeds available
          frequency: 'monthly',
          firstRunInDays: 1,
        })
      ).json().schedule;

      const totalBefore = await settledTotal();
      const res = await advance({ days: 2 });
      const summary = res.json().fired.find((f: { scheduleId: string }) => f.scheduleId === created.id);
      expect(summary).toMatchObject({ runs: 0, skipped: 1 });
      // No money moved; a skip was recorded in the audit trail.
      expect(await settledTotal()).toBe(totalBefore);
      const skip = await prisma.auditLog.findFirst({
        where: { action: 'schedule_payment_skipped', entityId: created.id },
      });
      expect(skip).not.toBeNull();
    });

    it('a cancelled schedule never fires', async () => {
      const { checking, savings } = await averyAccounts();
      const created = (
        await createSchedule({
          kind: 'internal_transfer',
          fromAccountId: checking.id,
          toAccountId: savings.id,
          amountMinor: 8_00,
          frequency: 'monthly',
          firstRunInDays: 1,
        })
      ).json().schedule;
      await post(`/api/schedules/${created.id}/cancel`, customer.cookie);

      const totalBefore = await settledTotal();
      const res = await advance({ days: 5 });
      expect(res.json().fired.find((f: { scheduleId: string }) => f.scheduleId === created.id)).toBeUndefined();
      expect(await settledTotal()).toBe(totalBefore);
    });
  });

  // ---- Statement cycles (ST-01) ---------------------------------------------

  describe('statement cycles derived from the clock', () => {
    it('returns monthly periods with derived figures for an accessible account', async () => {
      const { checking } = await averyAccounts();
      const res = await get(`/api/accounts/${checking.id}/statements`, customer.cookie);
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(typeof body.asOf).toBe('string');
      expect(body.periods.length).toBeGreaterThanOrEqual(1);
      const period = body.periods[0];
      expect(period).toHaveProperty('openingMinor');
      expect(period).toHaveProperty('closingMinor');
      expect(period).toHaveProperty('creditsMinor');
      expect(period).toHaveProperty('debitsMinor');
      expect(typeof period.label).toBe('string');
    });

    it('enforces access (403 for an account the caller cannot see; 404 unknown)', async () => {
      const { savings } = await averyAccounts(); // Jordan cannot see savings
      expect((await get(`/api/accounts/${savings.id}/statements`, joint.cookie)).statusCode).toBe(403);
      expect((await get('/api/accounts/does-not-exist/statements', customer.cookie)).statusCode).toBe(404);
    });
  });
});

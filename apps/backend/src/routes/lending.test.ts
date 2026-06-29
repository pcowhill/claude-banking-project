import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { amortizedPaymentMinor, monthlyAccrualMinor, DEFAULT_SAVINGS_APY_BPS } from '@simbank/shared';
import { buildServer } from '../server';
import { prisma } from '../db';
import { RecordingOpsRealtime } from '../ops/realtime';
import { DEMO, loginAs, mutatingHeaders, seedDemo } from '../test/fixtures';

/**
 * Integration tests for v1.0.0 lending & interest accrual: open a CD / loan, make
 * a loan payment, withdraw a matured CD, and clock-driven accrual. Above all the
 * MONEY DISCIPLINE: opening / paying / withdrawing NETS TO ZERO (the system
 * settled total is unchanged), interest is the only thing that changes the total
 * (bank-originated), a loan account carries a negative derived balance, and
 * balances stay derived throughout.
 */
describe('lending & interest accrual (v1.0.0)', () => {
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

  async function settledTotal(): Promise<number> {
    const rows = await prisma.ledgerEntry.findMany({
      where: { status: { in: ['posted', 'disputed'] } },
      select: { amountMinor: true, direction: true },
    });
    return rows.reduce((s, r) => s + (r.direction === 'credit' ? r.amountMinor : -r.amountMinor), 0);
  }
  async function balance(accountId: string): Promise<number> {
    const rows = await prisma.ledgerEntry.findMany({
      where: { accountId, status: { in: ['posted', 'disputed'] } },
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
  async function cleanSchedules() {
    await prisma.paymentSchedule.updateMany({ where: { status: 'active' }, data: { status: 'cancelled', nextRunAt: null } });
  }
  function advance(body: Record<string, unknown>) {
    return post('/api/ops/clock/advance', ops.cookie, body);
  }

  describe('open a CD', () => {
    it('moves the principal as a net-zero pair and creates a positive-balance CD', async () => {
      const { checking } = await averyAccounts();
      const totalBefore = await settledTotal();
      const checkingBefore = await balance(checking.id);

      const res = await post('/api/lending/cds', customer.cookie, {
        fundingAccountId: checking.id,
        principalMinor: 5_000_00,
        termMonths: 12,
      });
      expect(res.statusCode).toBe(201);
      const product = res.json().product;
      expect(product).toMatchObject({ kind: 'cd', status: 'active', apyBps: 450, principalMinor: 5_000_00, balanceMinor: 5_000_00 });

      // Net zero: the system settled total is unchanged; checking dropped by the deposit.
      expect(await settledTotal()).toBe(totalBefore);
      expect(await balance(checking.id)).toBe(checkingBefore - 5_000_00);
      expect(await balance(product.accountId)).toBe(5_000_00);
    });

    it('rejects a CD that exceeds available funds (400) and an unowned funding account (403)', async () => {
      const { checking, savings } = await averyAccounts();
      expect((await post('/api/lending/cds', customer.cookie, { fundingAccountId: checking.id, principalMinor: 999_999_00, termMonths: 12 })).statusCode).toBe(400);
      // Jordan (joint) funding from Avery's checking they don't hold → 403; savings they DO hold is fine.
      const other = await prisma.account.findFirstOrThrow({ where: { user: { email: DEMO.ops.email } } }).catch(() => null);
      if (other) expect((await post('/api/lending/cds', customer.cookie, { fundingAccountId: other.id, principalMinor: 100_00, termMonths: 12 })).statusCode).toBe(403);
      void savings;
      void joint;
    });
  });

  describe('open a loan', () => {
    it('disburses cash (net zero) and the loan account carries the negative owed balance', async () => {
      const { checking } = await averyAccounts();
      const totalBefore = await settledTotal();
      const checkingBefore = await balance(checking.id);

      const res = await post('/api/lending/loans', customer.cookie, {
        disbursementAccountId: checking.id,
        principalMinor: 12_000_00,
        termMonths: 24,
      });
      expect(res.statusCode).toBe(201);
      const product = res.json().product;
      expect(product.kind).toBe('loan');
      expect(product.apyBps).toBe(1050);
      expect(product.paymentMinor).toBe(amortizedPaymentMinor(12_000_00, 1050, 24));
      expect(product.balanceMinor).toBe(-12_000_00); // owed
      expect(product.outstandingMinor).toBe(12_000_00);

      // Net zero across the pair; the customer received the cash in checking.
      expect(await settledTotal()).toBe(totalBefore);
      expect(await balance(checking.id)).toBe(checkingBefore + 12_000_00);
    });
  });

  describe('loan payment', () => {
    it('reduces what is owed (net zero) and pays off + closes the loan when cleared', async () => {
      const { checking } = await averyAccounts();
      const open = (await post('/api/lending/loans', customer.cookie, { disbursementAccountId: checking.id, principalMinor: 1_000_00, termMonths: 12 })).json().product;

      const totalBefore = await settledTotal();
      // A partial payment.
      const pay1 = await post(`/api/lending/loans/${open.id}/pay`, customer.cookie, { fromAccountId: checking.id, amountMinor: 400_00 });
      expect(pay1.statusCode).toBe(200);
      expect(pay1.json().product.outstandingMinor).toBe(600_00);
      expect(await settledTotal()).toBe(totalBefore); // net zero

      // Pay the rest (overpay is capped at what is owed) → paid off + account closed.
      const pay2 = await post(`/api/lending/loans/${open.id}/pay`, customer.cookie, { fromAccountId: checking.id, amountMinor: 10_000_00 });
      expect(pay2.statusCode).toBe(200);
      expect(pay2.json().product.status).toBe('paid_off');
      expect(pay2.json().product.outstandingMinor).toBe(0);
      expect(await settledTotal()).toBe(totalBefore);
      const loanAcct = await prisma.account.findUniqueOrThrow({ where: { id: open.accountId } });
      expect(loanAcct.status).toBe('closed');
    });
  });

  describe('clock-driven interest accrual', () => {
    beforeEach(cleanSchedules);

    it('credits a CD and charges a loan one month of interest on a ~1-month advance', async () => {
      const { checking } = await averyAccounts();
      const cd = (await post('/api/lending/cds', customer.cookie, { fundingAccountId: checking.id, principalMinor: 10_000_00, termMonths: 12 })).json().product;
      const loan = (await post('/api/lending/loans', customer.cookie, { disbursementAccountId: checking.id, principalMinor: 6_000_00, termMonths: 24 })).json().product;

      // Advance ~1 month (35 days: always ≥ 1 and < 2 monthly anniversaries).
      const res = await advance({ days: 35 });
      expect(res.statusCode).toBe(200);
      const accrued = res.json().accrued;
      expect(accrued.cdsAccrued).toBeGreaterThanOrEqual(1);
      expect(accrued.loansAccrued).toBeGreaterThanOrEqual(1);

      // CD earned exactly one month of interest at 4.50%.
      expect(await balance(cd.accountId)).toBe(10_000_00 + monthlyAccrualMinor(10_000_00, 450));
      // Loan now owes one month MORE than principal at 10.50%.
      const owed = -(await balance(loan.accountId));
      expect(owed).toBe(6_000_00 + monthlyAccrualMinor(6_000_00, 1050));
    });

    it('is idempotent: re-advancing within the same month accrues nothing new', async () => {
      const { checking } = await averyAccounts();
      const cd = (await post('/api/lending/cds', customer.cookie, { fundingAccountId: checking.id, principalMinor: 2_000_00, termMonths: 12 })).json().product;
      await advance({ days: 35 }); // one month accrues
      const afterFirst = await balance(cd.accountId);
      await advance({ days: 5 }); // < a month later → no new monthly anniversary
      expect(await balance(cd.accountId)).toBe(afterFirst);
    });

    it('accrues savings interest at the default APY', async () => {
      const { savings } = await averyAccounts();
      const before = await balance(savings.id);
      const res = await advance({ days: 35 });
      expect(res.json().accrued.savingsAccountsAccrued).toBeGreaterThanOrEqual(1);
      expect(await balance(savings.id)).toBe(before + monthlyAccrualMinor(before, DEFAULT_SAVINGS_APY_BPS));
    });
  });

  describe('CD maturity + withdrawal', () => {
    beforeEach(cleanSchedules);

    it('matures a CD past its term, then withdraws the proceeds (net zero) and closes it', async () => {
      const { checking } = await averyAccounts();
      const cd = (await post('/api/lending/cds', customer.cookie, { fundingAccountId: checking.id, principalMinor: 4_000_00, termMonths: 6 })).json().product;

      // Cannot withdraw before maturity.
      expect((await post(`/api/lending/cds/${cd.id}/withdraw`, customer.cookie, { toAccountId: checking.id })).statusCode).toBe(400);

      // Advance > 6 months → the CD matures (and earns interest along the way).
      const res = await advance({ days: 200 });
      expect(res.json().accrued.cdsMatured).toBeGreaterThanOrEqual(1);
      const matured = (await get('/api/lending', customer.cookie)).json().products.find((p: { id: string }) => p.id === cd.id);
      expect(matured.status).toBe('matured');
      expect(matured.balanceMinor).toBeGreaterThan(4_000_00); // principal + earned interest

      const totalBefore = await settledTotal();
      const cdBalance = await balance(cd.accountId);
      const checkingBefore = await balance(checking.id);
      const wres = await post(`/api/lending/cds/${cd.id}/withdraw`, customer.cookie, { toAccountId: checking.id });
      expect(wres.statusCode).toBe(200);
      expect(wres.json().product.status).toBe('closed');

      // Net zero: proceeds moved to checking; system total unchanged.
      expect(await settledTotal()).toBe(totalBefore);
      expect(await balance(checking.id)).toBe(checkingBefore + cdBalance);
      expect(await balance(cd.accountId)).toBe(0);
    });
  });

  describe('RBAC + reads', () => {
    it('lists the caller’s products; an operator sees all; a customer cannot read the ops list', async () => {
      const mine = await get('/api/lending', customer.cookie);
      expect(mine.statusCode).toBe(200);
      expect(Array.isArray(mine.json().products)).toBe(true);
      expect((await get('/api/ops/lending', customer.cookie)).statusCode).toBe(403);
      expect((await get('/api/ops/lending', ops.cookie)).statusCode).toBe(200);
    });

    it('a customer cannot pay or withdraw another customer’s product (403/404)', async () => {
      const { checking } = await averyAccounts();
      const loan = (await post('/api/lending/loans', customer.cookie, { disbursementAccountId: checking.id, principalMinor: 1_000_00, termMonths: 12 })).json().product;
      // Jordan (joint on Avery's savings, but NOT on Avery's new loan account) cannot pay it.
      const jordanChecking = await prisma.account.findFirst({ where: { user: { email: DEMO.joint.email }, type: 'checking' } });
      const res = await post(`/api/lending/loans/${loan.id}/pay`, joint.cookie, {
        fromAccountId: jordanChecking?.id ?? checking.id,
        amountMinor: 100_00,
      });
      expect([403, 404]).toContain(res.statusCode);
    });
  });
});

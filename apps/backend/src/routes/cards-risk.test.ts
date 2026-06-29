import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { buildServer } from '../server';
import { prisma } from '../db';
import { RecordingOpsRealtime } from '../ops/realtime';
import { DEMO, loginAs, mutatingHeaders, seedDemo } from '../test/fixtures';

/**
 * Integration tests for v0.8.0 — cards, fraud, disputes.
 *
 *  - CARDS: lifecycle (issue / freeze / unfreeze / report→replace / travel
 *    notices) is access-checked and writes NO ledger (balances untouched).
 *  - DISPUTES: filing flags the entry `disputed`; an operator UPHOLD reverses it
 *    (refund as a ledger status change), DENY restores it to `posted`.
 *  - FRAUD: the customer confirms/denies; an operator CONFIRM reverses the
 *    suspicious entry + freezes the linked card; DISMISS has no money effect.
 *
 * MONEY DISCIPLINE is asserted throughout: every money effect is a ledger STATUS
 * change, never a balance edit; card lifecycle never touches the ledger.
 */
describe('cards, fraud & disputes (v0.8.0)', () => {
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

  async function ledgerCount(): Promise<number> {
    return prisma.ledgerEntry.count();
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

  // ====================== CARDS ======================

  describe('card lifecycle', () => {
    it('issues a card, lists it, and writes NO ledger entry', async () => {
      const { checking } = await averyAccounts();
      const ledgerBefore = await ledgerCount();

      const res = await post(`/api/accounts/${checking.id}/cards`, customer.cookie, { cardType: 'debit', network: 'visa' });
      expect(res.statusCode).toBe(201);
      const card = res.json().card;
      expect(card.status).toBe('active');
      expect(card.last4).toMatch(/^\d{4}$/);
      expect(card.network).toBe('visa');

      const list = await get('/api/cards', customer.cookie);
      expect(list.json().cards.some((c: { id: string }) => c.id === card.id)).toBe(true);

      // Card lifecycle moves no money.
      expect(await ledgerCount()).toBe(ledgerBefore);
    });

    it('freezes then unfreezes a card, and rejects an invalid transition', async () => {
      const { checking } = await averyAccounts();
      const issued = (await post(`/api/accounts/${checking.id}/cards`, customer.cookie, { cardType: 'debit' })).json().card;

      const frozen = await post(`/api/cards/${issued.id}/freeze`, customer.cookie);
      expect(frozen.statusCode).toBe(200);
      expect(frozen.json().card.status).toBe('frozen');

      // Freezing an already-frozen card is invalid.
      const again = await post(`/api/cards/${issued.id}/freeze`, customer.cookie);
      expect(again.statusCode).toBe(400);
      expect(again.json().code).toBe('invalid_state');

      const unfrozen = await post(`/api/cards/${issued.id}/unfreeze`, customer.cookie);
      expect(unfrozen.statusCode).toBe(200);
      expect(unfrozen.json().card.status).toBe('active');
    });

    it('reports a card lost and issues a replacement (old terminal, new active)', async () => {
      const { checking } = await averyAccounts();
      const issued = (await post(`/api/accounts/${checking.id}/cards`, customer.cookie, { cardType: 'debit' })).json().card;

      const res = await post(`/api/cards/${issued.id}/report`, customer.cookie, { reason: 'lost' });
      expect(res.statusCode).toBe(201);
      const { card: replacement, replaced } = res.json();
      expect(replaced.status).toBe('lost');
      expect(replacement.status).toBe('active');
      expect(replacement.replacesCardId).toBe(issued.id);
      expect(replacement.last4).not.toBe(issued.last4);

      // The reported card can no longer be frozen.
      const frozen = await post(`/api/cards/${issued.id}/freeze`, customer.cookie);
      expect(frozen.statusCode).toBe(400);
    });

    it('adds and cancels a travel notice', async () => {
      const { checking } = await averyAccounts();
      const issued = (await post(`/api/accounts/${checking.id}/cards`, customer.cookie, { cardType: 'credit' })).json().card;

      const added = await post(`/api/cards/${issued.id}/travel-notices`, customer.cookie, {
        destination: 'Lisbon',
        startsOn: '2026-08-01',
        endsOn: '2026-08-12',
        note: 'Vacation',
      });
      expect(added.statusCode).toBe(201);
      const withNotice = added.json().card;
      expect(withNotice.travelNotices).toHaveLength(1);
      const noticeId = withNotice.travelNotices[0].id;

      const cancelled = await post(`/api/cards/${issued.id}/travel-notices/${noticeId}/cancel`, customer.cookie);
      expect(cancelled.statusCode).toBe(200);
      expect(cancelled.json().card.travelNotices).toHaveLength(0);
    });

    it('RBAC: a joint customer cannot manage cards on an account they cannot access', async () => {
      const { savings } = await averyAccounts(); // jordan has access to checking only
      const res = await post(`/api/accounts/${savings.id}/cards`, joint.cookie, { cardType: 'debit' });
      expect(res.statusCode).toBe(403);
    });

    it('requires authentication', async () => {
      const res = await get('/api/cards');
      expect(res.statusCode).toBe(401);
    });
  });

  // ====================== DISPUTES ======================

  describe('disputes', () => {
    /** A posted card debit on Avery's checking to dispute (the $44.30 QuickFuel). */
    async function postedCardEntry(amountMinor: number) {
      const { checking } = await averyAccounts();
      return prisma.ledgerEntry.findFirstOrThrow({
        where: { accountId: checking.id, status: 'posted', origin: 'card', amountMinor },
      });
    }

    it('files a dispute, flags the entry `disputed`, and queues a dispute item (no balance edit)', async () => {
      const entry = await postedCardEntry(4430);
      const res = await post('/api/disputes', customer.cookie, { ledgerEntryId: entry.id, reason: 'not_recognized' });
      expect(res.statusCode).toBe(201);
      const requestId = res.json().requestId;

      const refreshed = await prisma.ledgerEntry.findUniqueOrThrow({ where: { id: entry.id } });
      expect(refreshed.status).toBe('disputed');

      const request = await prisma.operationsRequest.findUniqueOrThrow({ where: { id: requestId } });
      expect(request.type).toBe('dispute');
      expect(request.status).toBe('pending');
      // Pushed live to operators.
      expect(realtime.changes.some((c) => c.change === 'created' && c.request.id === requestId)).toBe(true);
    });

    it('operator UPHOLD reverses the disputed entry (refund via status change) and tags it reversed', async () => {
      // File on a distinct posted entry (Trattoria 38.75) to keep tests independent.
      const { checking } = await averyAccounts();
      const target = await prisma.ledgerEntry.findFirstOrThrow({
        where: { accountId: checking.id, status: 'posted', origin: 'card', amountMinor: 3875 },
      });
      const filed = await post('/api/disputes', customer.cookie, { ledgerEntryId: target.id, reason: 'incorrect_amount' });
      const requestId = filed.json().requestId;

      const settledBefore = await settledTotal();
      const res = await post(`/api/ops/requests/${requestId}/action`, ops.cookie, { action: 'approve' });
      expect(res.statusCode).toBe(200);

      const reversed = await prisma.ledgerEntry.findUniqueOrThrow({ where: { id: target.id } });
      expect(reversed.status).toBe('reversed');
      // Reversing a settled DEBIT raises the settled total by the amount (a refund).
      expect(await settledTotal()).toBe(settledBefore + 3875);

      // The request carries the reversed flag (drives the R-03 "Reversed" tag).
      const request = await prisma.operationsRequest.findUniqueOrThrow({ where: { id: requestId } });
      expect(request.status).toBe('approved');
      expect(JSON.parse(request.payload!).reversed).toBe(true);
    });

    it('operator DENY restores the disputed entry to posted (charge stands)', async () => {
      const { checking } = await averyAccounts();
      const target = await prisma.ledgerEntry.findFirstOrThrow({
        where: { accountId: checking.id, status: 'posted', origin: 'card', description: { contains: 'Coffee Roasters' } },
      });
      const filed = await post('/api/disputes', customer.cookie, { ledgerEntryId: target.id, reason: 'other', details: 'mistake' });
      const requestId = filed.json().requestId;
      expect((await prisma.ledgerEntry.findUniqueOrThrow({ where: { id: target.id } })).status).toBe('disputed');

      const res = await post(`/api/ops/requests/${requestId}/action`, ops.cookie, { action: 'reject' });
      expect(res.statusCode).toBe(200);
      expect((await prisma.ledgerEntry.findUniqueOrThrow({ where: { id: target.id } })).status).toBe('posted');
      const request = await prisma.operationsRequest.findUniqueOrThrow({ where: { id: requestId } });
      expect(JSON.parse(request.payload!).resolution).toBe('denied');
    });

    it('RBAC: a customer cannot dispute a transaction on an account they cannot access', async () => {
      const { savings } = await averyAccounts(); // jordan cannot see savings
      const entry = await prisma.ledgerEntry.findFirstOrThrow({ where: { accountId: savings.id, status: 'posted' } });
      const res = await post('/api/disputes', joint.cookie, { ledgerEntryId: entry.id, reason: 'not_recognized' });
      expect(res.statusCode).toBe(403);
    });

    it('rejects disputing a non-posted (e.g. pending) transaction', async () => {
      const { checking } = await averyAccounts();
      const pending = await prisma.ledgerEntry.findFirstOrThrow({ where: { accountId: checking.id, status: 'pending' } });
      const res = await post('/api/disputes', customer.cookie, { ledgerEntryId: pending.id, reason: 'not_recognized' });
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe('invalid_state');
    });

    it('rejects disputing an internal transfer leg (it must net to zero)', async () => {
      const { checking } = await averyAccounts();
      const transferLeg = await prisma.ledgerEntry.findFirstOrThrow({
        where: { accountId: checking.id, status: 'posted', origin: 'transfer' },
      });
      const res = await post('/api/disputes', customer.cookie, { ledgerEntryId: transferLeg.id, reason: 'not_recognized' });
      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe('invalid_state');
      // The transfer leg stays posted.
      expect((await prisma.ledgerEntry.findUniqueOrThrow({ where: { id: transferLeg.id } })).status).toBe('posted');
    });
  });

  // ====================== FRAUD ======================

  describe('fraud alerts', () => {
    async function fraudAlert() {
      return prisma.operationsRequest.findFirstOrThrow({ where: { type: 'fraud_alert', subjectEmail: DEMO.customer.email } });
    }

    it('lists the customer’s pending fraud alerts', async () => {
      const res = await get('/api/fraud-alerts', customer.cookie);
      expect(res.statusCode).toBe(200);
      const alerts = res.json().alerts;
      expect(alerts.length).toBeGreaterThanOrEqual(1);
      expect(alerts[0].merchant).toBeTruthy();
    });

    it('records the customer’s confirm/deny without resolving the item', async () => {
      const alert = await fraudAlert();
      const res = await post(`/api/fraud-alerts/${alert.id}/respond`, customer.cookie, { response: 'report_fraud' });
      expect(res.statusCode).toBe(200);
      const request = await prisma.operationsRequest.findUniqueOrThrow({ where: { id: alert.id } });
      expect(request.status).toBe('pending'); // still awaiting operator
      expect(JSON.parse(request.payload!).customerResponse).toBe('report_fraud');
      // An INBOUND simulated event was pushed.
      expect(realtime.events.some((e) => e.direction === 'inbound')).toBe(true);
    });

    it('RBAC: another customer cannot respond to an alert that is not theirs', async () => {
      const alert = await fraudAlert(); // subject is Avery
      const res = await post(`/api/fraud-alerts/${alert.id}/respond`, joint.cookie, { response: 'confirm_legit' });
      expect(res.statusCode).toBe(403);
    });

    it('operator CONFIRM fraud reverses the suspicious entry and freezes the linked card', async () => {
      const alert = await fraudAlert();
      const payload = JSON.parse(alert.payload!);
      const entryBefore = await prisma.ledgerEntry.findUniqueOrThrow({ where: { id: payload.ledgerEntryId } });
      expect(entryBefore.status).toBe('posted');
      const settledBefore = await settledTotal();

      const res = await post(`/api/ops/requests/${alert.id}/action`, ops.cookie, { action: 'approve' });
      expect(res.statusCode).toBe(200);

      const entryAfter = await prisma.ledgerEntry.findUniqueOrThrow({ where: { id: payload.ledgerEntryId } });
      expect(entryAfter.status).toBe('reversed');
      expect(await settledTotal()).toBe(settledBefore + entryBefore.amountMinor); // reversed debit
      const card = await prisma.card.findUniqueOrThrow({ where: { id: payload.cardId } });
      expect(card.status).toBe('frozen');
      const request = await prisma.operationsRequest.findUniqueOrThrow({ where: { id: alert.id } });
      expect(request.status).toBe('approved');
      expect(JSON.parse(request.payload!).reversed).toBe(true);
    });

    it('operator DISMISS leaves money untouched', async () => {
      // Create a fresh fraud alert with no links → dismiss is a clean no-op on money.
      const created = await prisma.operationsRequest.create({
        data: {
          type: 'fraud_alert',
          status: 'pending',
          summary: 'Test fraud alert',
          subjectName: 'Avery Customer',
          subjectEmail: DEMO.customer.email,
          payload: JSON.stringify({ merchant: 'Test', amountMinor: 100 }),
        },
      });
      const settledBefore = await settledTotal();
      const res = await post(`/api/ops/requests/${created.id}/action`, ops.cookie, { action: 'reject' });
      expect(res.statusCode).toBe(200);
      expect(await settledTotal()).toBe(settledBefore);
      const request = await prisma.operationsRequest.findUniqueOrThrow({ where: { id: created.id } });
      expect(JSON.parse(request.payload!).resolution).toBe('dismissed');
    });
  });
});

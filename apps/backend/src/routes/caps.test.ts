import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { MAX_REQUEST_BODY_BYTES, RESOURCE_CAPS } from '@simbank/shared';
import { prisma } from '../db';
import { buildServer } from '../server';
import { DEMO, loginAs, mutatingHeaders, seedDemo } from '../test/fixtures';

/**
 * Server-side growth bounds that hold in EVERY mode: per-user / per-resource
 * caps on live rows (409 `limit_reached`), the request-body ceiling (413), and
 * length bounds on the last unbounded inputs.
 */
describe('resource caps and input bounds', () => {
  let app: FastifyInstance;
  let cookie: string | undefined;
  let checkingId = '';
  let savingsId = '';

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();
    await seedDemo();
    const login = await loginAs(app, DEMO.customer.email, DEMO.customer.password);
    cookie = login.cookie;
    const accounts = (
      await app.inject({ method: 'GET', url: '/api/accounts', headers: { cookie: cookie! } })
    ).json().accounts as Array<{ id: string; type: string }>;
    checkingId = accounts.find((a) => a.type === 'checking')!.id;
    savingsId = accounts.find((a) => a.type === 'savings')!.id;
  });
  afterAll(async () => {
    await app.close();
  });

  const post = (url: string, payload: unknown) =>
    app.inject({
      method: 'POST',
      url,
      headers: mutatingHeaders(cookie),
      payload: payload as Record<string, unknown>,
    });

  it('active schedules per user are capped; cancelling frees capacity', async () => {
    const existing = await prisma.paymentSchedule.count({
      where: { user: { email: DEMO.customer.email }, status: 'active' },
    });
    const body = {
      kind: 'bill_pay',
      fromAccountId: checkingId,
      counterparty: 'Cap Test Biller',
      amountMinor: 100,
      frequency: 'monthly',
      firstRunInDays: 30,
    };
    const created: string[] = [];
    for (let i = existing; i < RESOURCE_CAPS.activeSchedulesPerUser; i++) {
      const res = await post('/api/schedules', body);
      expect(res.statusCode).toBe(201);
      created.push(res.json().schedule.id);
    }
    const over = await post('/api/schedules', body);
    expect(over.statusCode, over.body).toBe(409);
    expect(over.json().code).toBe('limit_reached');

    const cancel = await post(`/api/schedules/${created[0]}/cancel`, {});
    expect(cancel.statusCode).toBe(200);
    const again = await post('/api/schedules', body);
    expect(again.statusCode).toBe(201);
    // Tidy up so later tests in this file see a normal state.
    await prisma.paymentSchedule.deleteMany({ where: { counterparty: 'Cap Test Biller' } });
  });

  it('open lending products per user are capped (a loan needs no funds, so this matters)', async () => {
    const open = await prisma.lendingProduct.count({
      where: { status: 'active', account: { user: { email: DEMO.customer.email } } },
    });
    const loan = { disbursementAccountId: checkingId, principalMinor: 100_00, termMonths: 12 };
    for (let i = open; i < RESOURCE_CAPS.openLendingProductsPerUser; i++) {
      const res = await post('/api/lending/loans', loan);
      expect(res.statusCode).toBe(201);
    }
    const over = await post('/api/lending/loans', loan);
    expect(over.statusCode, over.body).toBe(409);
    expect(over.json().code).toBe('limit_reached');
    const cd = await post('/api/lending/cds', {
      fundingAccountId: checkingId,
      principalMinor: 100_00,
      termMonths: 6,
    });
    expect(cd.statusCode).toBe(409);
  });

  it('live cards per account are capped', async () => {
    const live = await prisma.card.count({
      where: { accountId: savingsId, status: { in: ['active', 'frozen'] } },
    });
    for (let i = live; i < RESOURCE_CAPS.liveCardsPerAccount; i++) {
      const res = await post(`/api/accounts/${savingsId}/cards`, {
        cardType: 'debit',
        network: 'visa',
      });
      expect(res.statusCode).toBe(201);
    }
    const over = await post(`/api/accounts/${savingsId}/cards`, {
      cardType: 'debit',
      network: 'visa',
    });
    expect(over.statusCode, over.body).toBe(409);
    expect(over.json().code).toBe('limit_reached');
  });

  it('active travel notices per card are capped', async () => {
    const card = await prisma.card.findFirstOrThrow({
      where: { accountId: savingsId, status: 'active' },
    });
    const notice = { destination: 'Lisbon', startsOn: '2030-01-01', endsOn: '2030-01-10' };
    const active = await prisma.cardTravelNotice.count({
      where: { cardId: card.id, status: 'active' },
    });
    for (let i = active; i < RESOURCE_CAPS.activeTravelNoticesPerCard; i++) {
      const res = await post(`/api/cards/${card.id}/travel-notices`, notice);
      expect(res.statusCode).toBe(201);
    }
    const over = await post(`/api/cards/${card.id}/travel-notices`, notice);
    expect(over.statusCode, over.body).toBe(409);
    expect(over.json().code).toBe('limit_reached');
  });

  it('pending joint invitations per account are capped', async () => {
    const pending = await prisma.accountInvitation.count({
      where: { accountId: savingsId, status: 'pending' },
    });
    for (let i = pending; i < RESOURCE_CAPS.pendingInvitationsPerAccount; i++) {
      const res = await post(`/api/accounts/${savingsId}/invitations`, {
        inviteeEmail: `invitee${i}@example.com`,
      });
      expect(res.statusCode).toBe(201);
    }
    const over = await post(`/api/accounts/${savingsId}/invitations`, {
      inviteeEmail: 'one.too.many@example.com',
    });
    expect(over.statusCode, over.body).toBe(409);
    expect(over.json().code).toBe('limit_reached');
  });

  it('movements awaiting review per user are capped', async () => {
    const pending = await prisma.operationsRequest.count({
      where: {
        status: 'pending',
        subjectEmail: DEMO.customer.email,
        type: { in: ['ach', 'wire', 'deposit', 'bill_pay'] },
      },
    });
    const deposit = { accountId: checkingId, kind: 'mobile_check_deposit', amountMinor: 100 };
    for (let i = pending; i < RESOURCE_CAPS.pendingMovementsPerUser; i++) {
      const res = await post('/api/movements', deposit);
      expect(res.statusCode).toBe(201);
    }
    const over = await post('/api/movements', deposit);
    expect(over.statusCode, over.body).toBe(409);
    expect(over.json().code).toBe('limit_reached');
  });

  it('unreviewed onboarding applications per email are capped (public route)', async () => {
    const email = 'capped.applicant@example.com';
    const application = {
      fullName: 'Capped Applicant',
      email,
      password: 'Password123!',
      product: 'savings',
      initialFundingMinor: 0,
      consent: true,
    };
    for (let i = 0; i < RESOURCE_CAPS.pendingApplicationsPerEmail; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/onboarding/applications',
        payload: application,
      });
      expect(res.statusCode).toBe(201);
    }
    const over = await app.inject({
      method: 'POST',
      url: '/api/onboarding/applications',
      payload: application,
    });
    expect(over.statusCode, over.body).toBe(409);
    expect(over.json().code).toBe('limit_reached');
  });

  it('rejects a request body over the ceiling with 413', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'a@example.com', password: 'x'.repeat(MAX_REQUEST_BODY_BYTES + 100) },
    });
    expect(res.statusCode).toBe(413);
  });

  it('rejects over-long login fields cheaply with 400', async () => {
    const longEmail = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: `${'a'.repeat(300)}@example.com`, password: 'x' },
    });
    expect(longEmail.statusCode).toBe(400);
    const longPassword = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: DEMO.customer.email, password: 'x'.repeat(500) },
    });
    expect(longPassword.statusCode).toBe(400);
  });

  it('bounds the simulated-event kind label', async () => {
    const ops = await loginAs(app, DEMO.ops.email, DEMO.ops.password);
    const headers = {
      ...mutatingHeaders(ops.cookie),
      cookie: `mer_ops_session=${ops.value}; mer_csrf=${ops.csrf}`,
      'x-meridian-surface': 'operations',
    };
    const res = await app.inject({
      method: 'POST',
      url: '/api/ops/simulate/event',
      headers,
      payload: { channel: 'sms', kind: 'k'.repeat(500) },
    });
    expect(res.statusCode).toBe(200);
    expect((res.json().event.kind as string).length).toBeLessThanOrEqual(64);
  });
});

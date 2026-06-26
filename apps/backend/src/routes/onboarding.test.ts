import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { buildServer } from '../server';
import { prisma } from '../db';
import { RecordingOpsRealtime } from '../ops/realtime';
import { DEMO, loginAs, seedDemo } from '../test/fixtures';

/**
 * Integration tests for onboarding & account opening (v0.6.0): the PUBLIC
 * open-account submission feeding the operations queue, the operator APPROVAL
 * that provisions a user + account + BANK-ORIGINATED initial funding (money
 * discipline held), rejection, joint invitations → access grants, admin-created
 * demo users, and the non-decision `note` action.
 */
describe('onboarding & account opening (v0.6.0)', () => {
  let app: FastifyInstance;
  const realtime = new RecordingOpsRealtime();
  let ops = { cookie: undefined as string | undefined };
  let admin = { cookie: undefined as string | undefined };
  let customer = { cookie: undefined as string | undefined };
  let joint = { cookie: undefined as string | undefined };

  let seq = 0;
  const freshEmail = (label: string) => `t${Date.now()}-${seq++}-${label}@example.com`;

  beforeAll(async () => {
    app = await buildServer({ opsRealtime: realtime });
    await app.ready();
    await seedDemo();
    ops = { cookie: (await loginAs(app, DEMO.ops.email, DEMO.ops.password)).cookie };
    admin = { cookie: (await loginAs(app, DEMO.admin.email, DEMO.admin.password)).cookie };
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

  /** Net signed total of settled (posted/disputed) ledger entries across the system. */
  async function settledTotal(): Promise<number> {
    const rows = await prisma.ledgerEntry.findMany({
      where: { status: { in: ['posted', 'disputed'] } },
      select: { amountMinor: true, direction: true },
    });
    return rows.reduce((s, r) => s + (r.direction === 'credit' ? r.amountMinor : -r.amountMinor), 0);
  }

  const validApplication = (email: string, extra: Record<string, unknown> = {}) => ({
    fullName: 'Pat Applicant',
    email,
    password: 'Applicant123!',
    product: 'checking',
    initialFundingMinor: 25_000,
    consent: true,
    ...extra,
  });

  // ---- Public submission ----------------------------------------------------

  describe('POST /api/onboarding/applications (public)', () => {
    it('accepts a valid application, queues it, and emits — but creates no user/account/money', async () => {
      const email = freshEmail('apply');
      const usersBefore = await prisma.user.count();
      const ledgerBefore = await prisma.ledgerEntry.count();

      const res = await post('/api/onboarding/applications', undefined, validApplication(email));
      expect(res.statusCode).toBe(201);
      const body = res.json() as { reference: string; status: string; product: string };
      expect(body.status).toBe('submitted');
      expect(body.reference).toMatch(/^MER-/);

      // A pending onboarding queue item now exists for this applicant.
      const request = await prisma.operationsRequest.findFirst({
        where: { type: 'onboarding', subjectEmail: email },
      });
      expect(request).not.toBeNull();
      expect(request!.status).toBe('pending');

      // The application row exists and links to the request (hash NOT exposed anywhere).
      const application = await prisma.onboardingApplication.findUnique({
        where: { requestId: request!.id },
      });
      expect(application).not.toBeNull();
      expect(application!.passwordHash).not.toBe('Applicant123!');

      // No user, account, or money was created by submitting.
      expect(await prisma.user.count()).toBe(usersBefore);
      expect(await prisma.ledgerEntry.count()).toBe(ledgerBefore);

      // Fed the live queue + simulated-event feed (operators room only).
      expect(realtime.changes.some((c) => c.request.id === request!.id && c.change === 'created')).toBe(true);
      expect(realtime.events.length).toBeGreaterThan(0);
    });

    it('rejects an invalid application with 400 + field errors', async () => {
      const res = await post('/api/onboarding/applications', undefined, {
        fullName: '',
        email: 'not-an-email',
        password: 'short',
        product: 'loan',
        initialFundingMinor: -1,
        consent: false,
      });
      expect(res.statusCode).toBe(400);
      const body = res.json() as { fields?: Record<string, string> };
      expect(body.fields?.email).toBeTruthy();
      expect(body.fields?.consent).toBeTruthy();
    });

    it('never serializes the password hash in the queue DTO', async () => {
      const email = freshEmail('apply2');
      await post('/api/onboarding/applications', undefined, validApplication(email));
      const request = await prisma.operationsRequest.findFirst({
        where: { type: 'onboarding', subjectEmail: email },
      });
      const detail = await get(`/api/ops/requests/${request!.id}`, ops.cookie);
      expect(JSON.stringify(detail.json())).not.toContain('passwordHash');
    });
  });

  // ---- Approval → provisioning (the money-discipline heart) -----------------

  describe('operator approval provisions the account (bank-originated funding)', () => {
    it('creates user + account + a posted bank-originated deposit; settled total moves only by the funding', async () => {
      const email = freshEmail('approve');
      await post('/api/onboarding/applications', undefined, validApplication(email, { initialFundingMinor: 30_000 }));
      const request = await prisma.operationsRequest.findFirst({
        where: { type: 'onboarding', subjectEmail: email },
      });

      const totalBefore = await settledTotal();
      const res = await post(`/api/ops/requests/${request!.id}/action`, ops.cookie, { action: 'approve' });
      expect(res.statusCode).toBe(200);
      expect(res.json().request.status).toBe('approved');

      // A real user + account now exist.
      const user = await prisma.user.findUnique({ where: { email } });
      expect(user).not.toBeNull();
      expect(user!.role).toBe('customer');
      const account = await prisma.account.findFirst({ where: { userId: user!.id } });
      expect(account!.type).toBe('checking');

      // Initial funding entered ONLY via a bank-originated, posted `deposit`.
      const entries = await prisma.ledgerEntry.findMany({ where: { accountId: account!.id } });
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({ origin: 'deposit', status: 'posted', direction: 'credit', amountMinor: 30_000 });

      // System-wide settled total moved by EXACTLY the funding amount.
      expect(await settledTotal()).toBe(totalBefore + 30_000);

      // Application marked provisioned + audited; an "account opened" event emitted.
      const application = await prisma.onboardingApplication.findUnique({ where: { requestId: request!.id } });
      expect(application!.status).toBe('provisioned');
      expect(realtime.events.some((e) => e.summary.toLowerCase().includes('opened'))).toBe(true);

      // The provisioned customer can now sign in with the password they chose.
      const login = await loginAs(app, email, 'Applicant123!');
      expect(login.statusCode).toBe(200);
    });

    it('a zero-funding application opens an account with no ledger entry', async () => {
      const email = freshEmail('zerofund');
      await post('/api/onboarding/applications', undefined, validApplication(email, { initialFundingMinor: 0 }));
      const request = await prisma.operationsRequest.findFirst({
        where: { type: 'onboarding', subjectEmail: email },
      });
      await post(`/api/ops/requests/${request!.id}/action`, ops.cookie, { action: 'approve' });
      const user = await prisma.user.findUnique({ where: { email } });
      const account = await prisma.account.findFirst({ where: { userId: user!.id } });
      expect(await prisma.ledgerEntry.count({ where: { accountId: account!.id } })).toBe(0);
    });

    it('creates a joint invitation when the application requested one', async () => {
      const email = freshEmail('withjoint');
      const inviteeEmail = freshEmail('invitee');
      await post(
        '/api/onboarding/applications',
        undefined,
        validApplication(email, { jointInviteEmail: inviteeEmail, initialFundingMinor: 0 }),
      );
      const request = await prisma.operationsRequest.findFirst({
        where: { type: 'onboarding', subjectEmail: email },
      });
      await post(`/api/ops/requests/${request!.id}/action`, ops.cookie, { action: 'approve' });
      const invitation = await prisma.accountInvitation.findFirst({ where: { inviteeEmail } });
      expect(invitation).not.toBeNull();
      expect(invitation!.status).toBe('pending');
    });

    it('blocks (and rolls back) approval when the applicant email already belongs to a user', async () => {
      // Submit using a seeded user's email; approval must fail without creating anything.
      await post('/api/onboarding/applications', undefined, validApplication(DEMO.customer.email));
      const request = await prisma.operationsRequest.findFirst({
        where: { type: 'onboarding', subjectEmail: DEMO.customer.email, status: 'pending' },
      });
      const usersBefore = await prisma.user.count();
      const res = await post(`/api/ops/requests/${request!.id}/action`, ops.cookie, { action: 'approve' });
      expect(res.statusCode).toBe(400);
      expect(await prisma.user.count()).toBe(usersBefore);
      // Request remains actionable (not left half-approved).
      const after = await prisma.operationsRequest.findUnique({ where: { id: request!.id } });
      expect(after!.status).toBe('pending');
    });

    it('rejecting an onboarding request marks the application rejected and creates no user', async () => {
      const email = freshEmail('reject');
      await post('/api/onboarding/applications', undefined, validApplication(email));
      const request = await prisma.operationsRequest.findFirst({
        where: { type: 'onboarding', subjectEmail: email },
      });
      await post(`/api/ops/requests/${request!.id}/action`, ops.cookie, { action: 'reject' });
      const application = await prisma.onboardingApplication.findUnique({ where: { requestId: request!.id } });
      expect(application!.status).toBe('rejected');
      expect(await prisma.user.findUnique({ where: { email } })).toBeNull();
    });
  });

  // ---- Note action (B-02) ---------------------------------------------------

  describe('note action (B-02)', () => {
    async function pending() {
      return prisma.operationsRequest.create({
        data: { type: 'support_message', status: 'pending', priority: 'normal', summary: 'Note target' },
      });
    }

    it('records a note without changing status and never touches the ledger', async () => {
      const req = await pending();
      const ledgerBefore = await prisma.ledgerEntry.count();
      const res = await post(`/api/ops/requests/${req.id}/action`, ops.cookie, { action: 'note', note: 'Looking into this' });
      expect(res.statusCode).toBe(200);
      const after = await prisma.operationsRequest.findUnique({ where: { id: req.id } });
      expect(after!.status).toBe('pending'); // unchanged
      expect(await prisma.ledgerEntry.count()).toBe(ledgerBefore);
      const audit = await prisma.auditLog.findFirst({
        where: { entity: 'operations_request', entityId: req.id, action: 'ops_note' },
      });
      expect(audit!.reason).toBe('Looking into this');
      // Emits an "updated" so other consoles re-sync.
      expect(realtime.changes.some((c) => c.request.id === req.id)).toBe(true);
    });

    it('is allowed AFTER a decision (on a terminal request)', async () => {
      const req = await pending();
      await post(`/api/ops/requests/${req.id}/action`, ops.cookie, { action: 'approve' });
      const res = await post(`/api/ops/requests/${req.id}/action`, ops.cookie, { action: 'note', note: 'Post-decision context' });
      expect(res.statusCode).toBe(200);
      const after = await prisma.operationsRequest.findUnique({ where: { id: req.id } });
      expect(after!.status).toBe('approved'); // still terminal, unchanged
      const notes = await prisma.auditLog.count({
        where: { entity: 'operations_request', entityId: req.id, action: 'ops_note' },
      });
      expect(notes).toBe(1);
    });

    it('requires note text (400 on an empty note)', async () => {
      const req = await pending();
      expect((await post(`/api/ops/requests/${req.id}/action`, ops.cookie, { action: 'note', note: '   ' })).statusCode).toBe(400);
    });

    it('forbids a customer from adding a note', async () => {
      const req = await pending();
      expect((await post(`/api/ops/requests/${req.id}/action`, customer.cookie, { action: 'note', note: 'x' })).statusCode).toBe(403);
    });
  });

  // ---- Joint invitations (N-05) ---------------------------------------------

  describe('joint invitations', () => {
    async function averyAccount(type: 'checking' | 'savings') {
      const user = await prisma.user.findUnique({ where: { email: DEMO.customer.email } });
      return prisma.account.findFirst({ where: { userId: user!.id, type } });
    }

    it('lets an owner invite a joint owner (and emits a simulated email)', async () => {
      const savings = await averyAccount('savings');
      const inviteeEmail = freshEmail('jointinvite');
      const res = await post(`/api/accounts/${savings!.id}/invitations`, customer.cookie, { inviteeEmail });
      expect(res.statusCode).toBe(201);
      expect(res.json().invitation.status).toBe('pending');
      expect(realtime.events.some((e) => e.kind === 'invitation')).toBe(true);
    });

    it('forbids a non-owner from inviting (403)', async () => {
      const checking = await averyAccount('checking'); // Jordan is JOINT here, not owner
      const res = await post(`/api/accounts/${checking!.id}/invitations`, joint.cookie, {
        inviteeEmail: freshEmail('x'),
      });
      expect(res.statusCode).toBe(403);
    });

    it('requires authentication (401)', async () => {
      const savings = await averyAccount('savings');
      expect((await post(`/api/accounts/${savings!.id}/invitations`, undefined, { inviteeEmail: 'a@b.co' })).statusCode).toBe(401);
    });

    it('accepting an invitation grants joint access so the invitee sees the account', async () => {
      const savings = await averyAccount('savings');
      // Invite the existing joint user to savings (they only have checking access today).
      await post(`/api/accounts/${savings!.id}/invitations`, customer.cookie, { inviteeEmail: DEMO.joint.email });
      const invitation = await prisma.accountInvitation.findFirst({
        where: { accountId: savings!.id, inviteeEmail: DEMO.joint.email, status: 'pending' },
        orderBy: { createdAt: 'desc' },
      });

      // Before accepting, Jordan cannot see savings.
      expect((await get(`/api/accounts/${savings!.id}`, joint.cookie)).statusCode).not.toBe(200);

      const accept = await post(`/api/invitations/${invitation!.id}/accept`, joint.cookie);
      expect(accept.statusCode).toBe(200);

      // A joint access grant now exists, and Jordan can read the account.
      const grant = await prisma.accountAccess.findUnique({
        where: { userId_accountId: { userId: (await prisma.user.findUnique({ where: { email: DEMO.joint.email } }))!.id, accountId: savings!.id } },
      });
      expect(grant!.relationship).toBe('joint');
      expect((await get(`/api/accounts/${savings!.id}`, joint.cookie)).statusCode).toBe(200);
    });

    it('forbids accepting an invitation addressed to someone else (403)', async () => {
      const savings = await averyAccount('savings');
      await post(`/api/accounts/${savings!.id}/invitations`, customer.cookie, { inviteeEmail: freshEmail('other') });
      const invitation = await prisma.accountInvitation.findFirst({
        where: { accountId: savings!.id, status: 'pending' },
        orderBy: { createdAt: 'desc' },
      });
      const res = await post(`/api/invitations/${invitation!.id}/accept`, joint.cookie);
      expect(res.statusCode).toBe(403);
    });

    it('lists my pending invitations and lets me decline', async () => {
      const savings = await averyAccount('savings');
      const inviteeEmail = freshEmail('declineme');
      await post(`/api/accounts/${savings!.id}/invitations`, customer.cookie, { inviteeEmail });
      // Create a throwaway user for that email so they can authenticate.
      const created = await post('/api/admin/users', admin.cookie, { email: inviteeEmail, displayName: 'Decliner' });
      expect(created.statusCode).toBe(201);
      const login = await loginAs(app, inviteeEmail, created.json().demoPassword);

      const list = await get('/api/invitations', login.cookie);
      expect(list.statusCode).toBe(200);
      const invitations = list.json().invitations as Array<{ id: string }>;
      expect(invitations.length).toBeGreaterThanOrEqual(1);

      const decline = await post(`/api/invitations/${invitations[0].id}/decline`, login.cookie);
      expect(decline.statusCode).toBe(200);
      expect(decline.json().invitation.status).toBe('declined');
    });
  });

  // ---- Admin-created demo users (N-06) --------------------------------------

  describe('admin create demo user', () => {
    it('creates a plain user (no account, no money) that can sign in', async () => {
      const email = freshEmail('plain');
      const res = await post('/api/admin/users', admin.cookie, { email, displayName: 'Plain User' });
      expect(res.statusCode).toBe(201);
      const body = res.json() as { user: { id: string }; account: unknown; demoPassword: string };
      expect(body.account).toBeNull();
      const login = await loginAs(app, email, body.demoPassword);
      expect(login.statusCode).toBe(200);
    });

    it('opens + funds an account via an AUDITED bank-originated adjustment (reason required)', async () => {
      const email = freshEmail('funded');
      const totalBefore = await settledTotal();
      const res = await post('/api/admin/users', admin.cookie, {
        email,
        displayName: 'Funded User',
        product: 'savings',
        initialFundingMinor: 50_000,
        reason: 'Opening balance for a demo account',
      });
      expect(res.statusCode).toBe(201);
      const accountId = res.json().account.id as string;
      const entries = await prisma.ledgerEntry.findMany({ where: { accountId } });
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({ origin: 'adjustment', status: 'posted', amountMinor: 50_000 });
      expect(entries[0].reason).toBe('Opening balance for a demo account');
      // Money entered only via the adjustment.
      expect(await settledTotal()).toBe(totalBefore + 50_000);
      // The adjustment is audited.
      const audit = await prisma.auditLog.findFirst({ where: { action: 'admin_adjustment', entityId: accountId } });
      expect(audit!.reason).toBe('Opening balance for a demo account');
    });

    it('rejects funding without a reason (400)', async () => {
      const res = await post('/api/admin/users', admin.cookie, {
        email: freshEmail('noreason'),
        displayName: 'No Reason',
        product: 'checking',
        initialFundingMinor: 10_000,
      });
      expect(res.statusCode).toBe(400);
    });

    it('rejects a duplicate email (409)', async () => {
      const res = await post('/api/admin/users', admin.cookie, {
        email: DEMO.customer.email,
        displayName: 'Dupe',
      });
      expect(res.statusCode).toBe(409);
    });

    it('forbids a non-admin (ops_agent) from creating users (403)', async () => {
      const res = await post('/api/admin/users', ops.cookie, { email: freshEmail('nope'), displayName: 'Nope' });
      expect(res.statusCode).toBe(403);
    });
  });
});

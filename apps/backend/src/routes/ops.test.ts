import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { InjectOptions } from 'fastify';
import { buildServer } from '../server';
import { prisma } from '../db';
import { RecordingOpsRealtime } from '../ops/realtime';
import { DEMO, loginAs, mutatingHeaders, seedDemo } from '../test/fixtures';

/**
 * Integration tests for the v0.5.0 operations endpoints: RBAC (only ops_agent /
 * admin), the live queue + filters, operator actions + their state transitions,
 * the audit trail, real-time emissions (asserted via a recording publisher), and
 * the SIMULATED external-event flow. Money is never touched — these are workflow
 * state changes only.
 */
describe('operations endpoints (v0.5.0)', () => {
  let app: FastifyInstance;
  const realtime = new RecordingOpsRealtime();
  let ops = { cookie: undefined as string | undefined };
  let admin = { cookie: undefined as string | undefined };
  let customer = { cookie: undefined as string | undefined };
  let joint = { cookie: undefined as string | undefined };

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
    return app.inject({ method: 'GET', url, headers: mutatingHeaders(cookie) });
  }
  function post(url: string, cookie?: string, payload?: InjectOptions['payload']) {
    return app.inject({ method: 'POST', url, headers: mutatingHeaders(cookie), payload });
  }

  async function createPendingRequest(overrides: Record<string, unknown> = {}) {
    return prisma.operationsRequest.create({
      data: {
        type: 'support_message',
        status: 'pending',
        priority: 'normal',
        summary: 'Test request',
        subjectName: 'Avery Customer',
        ...overrides,
      },
    });
  }

  // ---- RBAC -----------------------------------------------------------------

  describe('RBAC', () => {
    const routes: Array<[string, string]> = [
      ['GET', '/api/ops/requests'],
      ['GET', '/api/ops/events'],
      ['GET', '/api/ops/summary'],
    ];

    it('rejects unauthenticated callers with 401', async () => {
      for (const [, url] of routes) {
        expect((await get(url)).statusCode).toBe(401);
      }
      expect((await post('/api/ops/simulate/event', undefined, { channel: 'sms' })).statusCode).toBe(401);
    });

    it('forbids customer and joint_customer roles with 403', async () => {
      const seeded = await prisma.operationsRequest.findFirst();
      for (const cookie of [customer.cookie, joint.cookie]) {
        expect((await get('/api/ops/requests', cookie)).statusCode).toBe(403);
        expect((await get(`/api/ops/requests/${seeded!.id}`, cookie)).statusCode).toBe(403);
        expect((await get('/api/ops/events', cookie)).statusCode).toBe(403);
        const denied = await post('/api/ops/simulate/event', cookie, { channel: 'sms' });
        expect(denied.statusCode).toBe(403);
        expect(denied.json().code).toBe('forbidden');
      }
    });

    it('allows ops_agent and admin', async () => {
      for (const cookie of [ops.cookie, admin.cookie]) {
        expect((await get('/api/ops/requests', cookie)).statusCode).toBe(200);
        expect((await get('/api/ops/events', cookie)).statusCode).toBe(200);
      }
    });
  });

  // ---- Queue reads ----------------------------------------------------------

  describe('GET /api/ops/requests', () => {
    it('returns the seeded queue with full status counts', async () => {
      const res = await get('/api/ops/requests', ops.cookie);
      expect(res.statusCode).toBe(200);
      const body = res.json() as {
        requests: Array<{ id: string; status: string; type: string }>;
        counts: Record<string, number>;
      };
      expect(body.requests.length).toBeGreaterThanOrEqual(8);
      // Counts cover every status key (zeros included).
      for (const key of ['pending', 'approved', 'rejected', 'on_hold', 'info_requested']) {
        expect(typeof body.counts[key]).toBe('number');
      }
      expect(body.counts.pending).toBeGreaterThan(0);
    });

    it('filters by status', async () => {
      const res = await get('/api/ops/requests?status=on_hold', ops.cookie);
      expect(res.statusCode).toBe(200);
      const requests = res.json().requests as Array<{ status: string }>;
      expect(requests.every((r) => r.status === 'on_hold')).toBe(true);
    });

    it('filters by type', async () => {
      const res = await get('/api/ops/requests?type=fraud_alert', ops.cookie);
      expect(res.statusCode).toBe(200);
      const requests = res.json().requests as Array<{ type: string }>;
      expect(requests.every((r) => r.type === 'fraud_alert')).toBe(true);
    });

    it('rejects an unknown status filter with 400', async () => {
      const res = await get('/api/ops/requests?status=bogus', ops.cookie);
      expect(res.statusCode).toBe(400);
    });
  });

  describe('GET /api/ops/requests/:id', () => {
    it('returns detail with intake history and linked events', async () => {
      const seeded = await prisma.operationsRequest.findFirst({ where: { type: 'mfa' } });
      const res = await get(`/api/ops/requests/${seeded!.id}`, ops.cookie);
      expect(res.statusCode).toBe(200);
      const request = res.json().request as {
        history: Array<{ action: string }>;
        events: Array<{ channel: string }>;
      };
      // The seed writes an intake audit row, surfaced as a "created" history entry.
      expect(request.history.some((h) => h.action === 'created')).toBe(true);
      // The mfa request has a linked simulated SMS event from the seed.
      expect(request.events.some((e) => e.channel === 'sms')).toBe(true);
    });

    it('404s for an unknown id', async () => {
      const res = await get('/api/ops/requests/no-such-id', ops.cookie);
      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe('not_found');
    });
  });

  // ---- Operator actions -----------------------------------------------------

  describe('POST /api/ops/requests/:id/action', () => {
    it.each([
      ['approve', 'approved'],
      ['reject', 'rejected'],
      ['hold', 'on_hold'],
      ['request_info', 'info_requested'],
    ])('%s transitions the request to %s and emits a real-time change', async (action, expected) => {
      const request = await createPendingRequest();
      const res = await post(`/api/ops/requests/${request.id}/action`, ops.cookie, {
        action,
        note: 'because reasons',
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().request.status).toBe(expected);

      // Persisted.
      const after = await prisma.operationsRequest.findUnique({ where: { id: request.id } });
      expect(after!.status).toBe(expected);
      expect(after!.lastAction).toBe(action);
      expect(after!.lastActorName).toBe('Sam Operator');

      // Audited.
      const audit = await prisma.auditLog.findFirst({
        where: { entity: 'operations_request', entityId: request.id, action: `ops_${action}` },
      });
      expect(audit).not.toBeNull();

      // Real-time change emitted to operators.
      expect(realtime.changes.some((c) => c.request.id === request.id && c.change === 'updated')).toBe(true);
    });

    it('sets resolvedAt only for terminal statuses', async () => {
      const approved = await createPendingRequest();
      await post(`/api/ops/requests/${approved.id}/action`, ops.cookie, { action: 'approve' });
      const a = await prisma.operationsRequest.findUnique({ where: { id: approved.id } });
      expect(a!.resolvedAt).not.toBeNull();

      const held = await createPendingRequest();
      await post(`/api/ops/requests/${held.id}/action`, ops.cookie, { action: 'hold' });
      const h = await prisma.operationsRequest.findUnique({ where: { id: held.id } });
      expect(h!.resolvedAt).toBeNull();
    });

    it('request_info auto-generates a linked simulated email event', async () => {
      const request = await createPendingRequest();
      const res = await post(`/api/ops/requests/${request.id}/action`, ops.cookie, {
        action: 'request_info',
      });
      expect(res.statusCode).toBe(200);
      const event = await prisma.simulatedEvent.findFirst({ where: { requestId: request.id } });
      expect(event).not.toBeNull();
      expect(event!.channel).toBe('email');
      // Both a queue change AND an external event were pushed.
      expect(realtime.changes.length).toBeGreaterThan(0);
      expect(realtime.events.some((e) => e.requestId === request.id)).toBe(true);
    });

    it('rejects an invalid action with 400 and does not emit', async () => {
      const request = await createPendingRequest();
      const res = await post(`/api/ops/requests/${request.id}/action`, ops.cookie, { action: 'explode' });
      expect(res.statusCode).toBe(400);
      expect(realtime.changes).toHaveLength(0);
    });

    it('404s when acting on an unknown request', async () => {
      const res = await post('/api/ops/requests/no-such-id/action', ops.cookie, { action: 'approve' });
      expect(res.statusCode).toBe(404);
    });

    it('409s when acting on an already-resolved request', async () => {
      const request = await createPendingRequest();
      expect((await post(`/api/ops/requests/${request.id}/action`, ops.cookie, { action: 'approve' })).statusCode).toBe(200);
      const again = await post(`/api/ops/requests/${request.id}/action`, ops.cookie, { action: 'reject' });
      expect(again.statusCode).toBe(409);
      expect(again.json().code).toBe('already_resolved');
    });

    it('forbids a customer from acting', async () => {
      const request = await createPendingRequest();
      const res = await post(`/api/ops/requests/${request.id}/action`, customer.cookie, { action: 'approve' });
      expect(res.statusCode).toBe(403);
    });
  });

  // ---- Simulated external events --------------------------------------------

  describe('POST /api/ops/simulate/event', () => {
    it('creates a simulated event, audits it, and emits it', async () => {
      const res = await post('/api/ops/simulate/event', ops.cookie, {
        channel: 'sms',
        kind: 'otp',
        summary: 'Test passcode',
      });
      expect(res.statusCode).toBe(200);
      const event = res.json().event as { id: string; channel: string; detail: string };
      expect(event.channel).toBe('sms');
      // Clearly labelled as a simulation; never a real provider.
      expect(event.detail.toLowerCase()).toContain('simulation');

      const stored = await prisma.simulatedEvent.findUnique({ where: { id: event.id } });
      expect(stored).not.toBeNull();
      const audit = await prisma.auditLog.findFirst({
        where: { entity: 'simulated_event', entityId: event.id },
      });
      expect(audit).not.toBeNull();
      expect(realtime.events.some((e) => e.id === event.id)).toBe(true);
    });

    it('rejects an unknown channel with 400', async () => {
      const res = await post('/api/ops/simulate/event', ops.cookie, { channel: 'carrier-pigeon' });
      expect(res.statusCode).toBe(400);
    });

    it('drops a dangling requestId rather than failing', async () => {
      const res = await post('/api/ops/simulate/event', ops.cookie, {
        channel: 'email',
        requestId: 'no-such-request',
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().event.requestId).toBeNull();
    });
  });

  describe('GET /api/ops/events', () => {
    it('returns recent simulated events newest-first', async () => {
      const res = await get('/api/ops/events?limit=5', ops.cookie);
      expect(res.statusCode).toBe(200);
      const events = res.json().events as Array<{ createdAt: string }>;
      expect(events.length).toBeGreaterThan(0);
      const times = events.map((e) => Date.parse(e.createdAt));
      expect([...times].sort((a, b) => b - a)).toEqual(times);
    });
  });

  // ---- Money discipline -----------------------------------------------------

  it('operator actions never create ledger entries', async () => {
    const before = await prisma.ledgerEntry.count();
    const request = await createPendingRequest({ type: 'deposit', summary: 'Deposit review' });
    await post(`/api/ops/requests/${request.id}/action`, ops.cookie, { action: 'approve' });
    const after = await prisma.ledgerEntry.count();
    expect(after).toBe(before);
  });
});

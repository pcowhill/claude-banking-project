import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  countRequestsByStatus,
  isOpsAction,
  isSimEventChannel,
  OPS_REQUEST_STATUSES,
  OPS_REQUEST_TYPES,
  SIM_EVENT_DIRECTIONS,
  SIM_EVENT_STATUSES,
  validateAdminCreateUser,
  type ApiErrorResponse,
  type OperationsQueueQuery,
  type OpsRequestStatus,
  type OpsRequestType,
  type SimEventDirection,
  type SimEventStatus,
  type SimulateEventRequest,
} from '@simbank/shared';
import { prisma } from '../db';
import { requireAuth, requireRole } from '../auth/guards';
import {
  applyOperatorAction,
  createSimulatedEvent,
  getOperationsRequestDetail,
  listOperationsRequests,
  listSimulatedEvents,
  OpsActionError,
} from '../ops/requests';
import { adminCreateUser, AdminUserError } from '../ops/admin-users';
import { reverseMovement, MovementError } from '../money/movements';
import { MOVEMENT_TEXT } from '@simbank/shared';

/**
 * Operations & admin endpoints, gated by role (ops_agent / admin). Customers and
 * joint customers receive 403 from all of them — the access-control demonstration
 * for the non-customer roles.
 *
 *  - `/api/ops/summary` — operational snapshot (counts) for the console overview.
 *  - `/api/ops/requests` — the live work queue (+ status counts); `:id` for detail.
 *  - `/api/ops/requests/:id/action` — approve/reject/hold/request_info an item.
 *  - `/api/ops/simulate/event` — generate a SIMULATED external event (never real).
 *  - `/api/ops/events` — the recent simulated-event feed.
 *  - `/api/admin/users` (admin only) — the demo-user roster (no hashes/tokens).
 *
 * Mutations push a real-time update to connected operator consoles via
 * `app.opsRealtime` (the operators room only — customers never receive them).
 */

const MAX_NOTE_LENGTH = 500;

/** A reusable role gate for every operations route (ops_agent / admin only). */
const opsOnly = { preHandler: [requireAuth, requireRole('ops_agent', 'admin')] };

function badRequest(reply: FastifyReply, error: string): void {
  reply.code(400).send({ error, code: 'bad_request' } satisfies ApiErrorResponse);
}

export async function opsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/ops/summary', opsOnly, async (_req, reply) => {
    const now = new Date();
    const [users, accounts, requests, lockedAccounts] = await Promise.all([
      prisma.user.count(),
      prisma.account.count(),
      prisma.operationsRequest.findMany({ select: { status: true } }),
      prisma.user.count({ where: { lockedUntil: { gt: now } } }),
    ]);
    const byStatus = countRequestsByStatus(
      requests.map((r) => ({ status: r.status as OpsRequestStatus })),
    );
    return reply.send({
      users,
      accounts,
      pendingRequests: byStatus.pending,
      lockedAccounts,
      requestCounts: byStatus,
    });
  });

  // ---- Operations queue -----------------------------------------------------

  app.get('/api/ops/requests', opsOnly, async (req, reply) => {
    const { status, type } = req.query as { status?: string; type?: string };
    if (status && !OPS_REQUEST_STATUSES.includes(status as OpsRequestStatus)) {
      return badRequest(reply, `Unknown status filter '${status}'.`);
    }
    if (type && !OPS_REQUEST_TYPES.includes(type as OpsRequestType)) {
      return badRequest(reply, `Unknown type filter '${type}'.`);
    }
    const query: OperationsQueueQuery = {
      status: status as OpsRequestStatus | undefined,
      type: type as OpsRequestType | undefined,
    };
    const requests = await listOperationsRequests(prisma, query);
    // Counts always reflect the WHOLE queue (unfiltered) so the header is stable.
    const all = await prisma.operationsRequest.findMany({ select: { status: true } });
    const counts = countRequestsByStatus(all.map((r) => ({ status: r.status as OpsRequestStatus })));
    return reply.send({ requests, counts });
  });

  app.get('/api/ops/requests/:id', opsOnly, async (req, reply) => {
    const { id } = req.params as { id: string };
    const request = await getOperationsRequestDetail(prisma, id);
    if (!request) {
      return reply
        .code(404)
        .send({ error: 'That operations request does not exist.', code: 'not_found' } satisfies ApiErrorResponse);
    }
    return reply.send({ request });
  });

  app.post('/api/ops/requests/:id/action', opsOnly, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as { action?: unknown; note?: unknown };
    if (!isOpsAction(body.action)) {
      return badRequest(
        reply,
        'A valid action (approve | reject | hold | request_info | note) is required.',
      );
    }
    const note =
      typeof body.note === 'string' ? body.note.slice(0, MAX_NOTE_LENGTH) : undefined;
    // A note carries no decision, so its text is mandatory.
    if (body.action === 'note' && !note?.trim()) {
      return badRequest(reply, 'A note is required to add a note.');
    }

    try {
      const { request, event, events } = await applyOperatorAction(
        prisma,
        { id, action: body.action, note, actor: req.user! },
        new Date(),
      );
      // Push the queue change (and any auto-generated simulated events) to operators.
      app.opsRealtime.requestChanged('updated', request);
      if (event) app.opsRealtime.externalEvent(event);
      for (const extra of events ?? []) app.opsRealtime.externalEvent(extra);
      return reply.send({ request });
    } catch (err) {
      if (err instanceof OpsActionError) {
        const code = err.code === 'not_found' ? 404 : err.code === 'already_resolved' ? 409 : 400;
        return reply.code(code).send({ error: err.message, code: err.code } satisfies ApiErrorResponse);
      }
      throw err;
    }
  });

  // ---- Simulated external events --------------------------------------------

  app.post('/api/ops/simulate/event', opsOnly, async (req, reply) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (!isSimEventChannel(body.channel)) {
      return badRequest(reply, 'A valid channel (sms | email | mfa | identity) is required.');
    }
    if (body.outcome && !SIM_EVENT_STATUSES.includes(body.outcome as SimEventStatus)) {
      return badRequest(reply, `Unknown outcome '${String(body.outcome)}'.`);
    }
    if (body.direction && !SIM_EVENT_DIRECTIONS.includes(body.direction as SimEventDirection)) {
      return badRequest(reply, `Unknown direction '${String(body.direction)}'.`);
    }

    const input: SimulateEventRequest = {
      channel: body.channel,
      kind: typeof body.kind === 'string' ? body.kind : undefined,
      requestId: typeof body.requestId === 'string' ? body.requestId : undefined,
      outcome: body.outcome as SimEventStatus | undefined,
      direction: body.direction as SimEventDirection | undefined,
      summary: typeof body.summary === 'string' ? body.summary.slice(0, MAX_NOTE_LENGTH) : undefined,
    };
    const event = await createSimulatedEvent(prisma, input, req.user!, new Date());
    app.opsRealtime.externalEvent(event);
    return reply.send({ event });
  });

  app.get('/api/ops/events', opsOnly, async (req, reply) => {
    const { limit } = req.query as { limit?: string };
    const parsed = limit ? Number.parseInt(limit, 10) : 50;
    const events = await listSimulatedEvents(prisma, Number.isFinite(parsed) ? parsed : 50);
    return reply.send({ events });
  });

  // ---- Money-movement reversal (v0.7.0) -------------------------------------
  // Reverse a SETTLED money movement: flips its posted ledger entry(ies) to
  // `reversed` (removing the balance effect — never editing a balance). Requires
  // a reason (audited), mirroring the admin-adjustment discipline. Emits a live
  // queue update so every console re-syncs.
  app.post('/api/ops/movements/:requestId/reverse', opsOnly, async (req, reply) => {
    const { requestId } = req.params as { requestId: string };
    const body = (req.body ?? {}) as { reason?: unknown };
    const reason =
      typeof body.reason === 'string' ? body.reason.trim().slice(0, MOVEMENT_TEXT.reasonMaxLength) : '';
    if (!reason) {
      return badRequest(reply, 'A reason is required to reverse a movement.');
    }
    try {
      const { request, events } = await reverseMovement(requestId, req.user!, reason, new Date());
      app.opsRealtime.requestChanged('updated', request);
      for (const event of events) app.opsRealtime.externalEvent(event);
      return reply.send({ request });
    } catch (err) {
      if (err instanceof MovementError) {
        const code = err.code === 'not_found' ? 404 : err.code === 'nothing_to_reverse' ? 409 : 400;
        return reply.code(code).send({ error: err.message, code: err.code } satisfies ApiErrorResponse);
      }
      throw err;
    }
  });

  // ---- Admin ----------------------------------------------------------------

  const adminOnly = { preHandler: [requireAuth, requireRole('admin')] };

  app.get('/api/admin/users', adminOnly, async (_req, reply) => {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        status: true,
        lastLoginAt: true,
        failedLoginAttempts: true,
        lockedUntil: true,
        createdAt: true,
      },
    });
    return reply.send({
      users: users.map((u) => ({
        ...u,
        lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
        lockedUntil: u.lockedUntil ? u.lockedUntil.toISOString() : null,
        createdAt: u.createdAt.toISOString(),
      })),
    });
  });

  // Admin-created demo users (v0.6.0). Optionally opens + funds an account;
  // funding is an AUDITED bank-originated adjustment requiring a reason (enforced
  // by the shared validator + the service). Balances stay derived.
  app.post('/api/admin/users', adminOnly, async (req, reply) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const check = validateAdminCreateUser({
      email: typeof body.email === 'string' ? body.email.slice(0, MAX_NOTE_LENGTH) : undefined,
      displayName: typeof body.displayName === 'string' ? body.displayName.slice(0, MAX_NOTE_LENGTH) : undefined,
      role: typeof body.role === 'string' ? (body.role as never) : undefined,
      product: typeof body.product === 'string' ? body.product : undefined,
      initialFundingMinor:
        typeof body.initialFundingMinor === 'number' ? body.initialFundingMinor : undefined,
      reason: typeof body.reason === 'string' ? body.reason.slice(0, MAX_NOTE_LENGTH) : undefined,
      password: typeof body.password === 'string' ? body.password : undefined,
    });
    if (!check.ok || !check.value) {
      return reply.code(400).send({
        error: 'Please correct the highlighted fields.',
        code: 'invalid_request',
        fields: check.errors,
      } as ApiErrorResponse & { fields?: Record<string, string> });
    }
    try {
      const result = await adminCreateUser(check.value, req.user!, new Date());
      return reply.code(201).send(result);
    } catch (err) {
      if (err instanceof AdminUserError) {
        return reply.code(409).send({ error: err.message, code: err.code } satisfies ApiErrorResponse);
      }
      throw err;
    }
  });
}

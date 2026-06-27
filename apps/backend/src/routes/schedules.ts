import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  validateCreateSchedule,
  type ApiErrorResponse,
  type CancelScheduleResponse,
  type CreateScheduleResponse,
  type ScheduleListResponse,
} from '@simbank/shared';
import { prisma } from '../db';
import { requireAuth } from '../auth/guards';
import { simulationNow } from '../clock/clock';
import {
  cancelSchedule,
  createSchedule,
  listSchedulesForUser,
  ScheduleError,
  type ScheduleErrorCode,
} from '../scheduler/schedules';

/**
 * Customer scheduled-payment endpoints (v0.9.0). All authenticated and scoped to
 * the caller's own accounts (the service re-checks access per account, and the
 * firing actor is always the schedule owner). Creating a schedule moves NO money;
 * it fires when an operator advances the clock past its due date.
 *
 *  - `POST /api/schedules`           — create a one-off-future / recurring schedule.
 *  - `GET  /api/schedules`           — the caller's own schedules.
 *  - `POST /api/schedules/:id/cancel — cancel one of the caller's active schedules.
 */

const MAX_FIELD = 500;

function scheduleHttpStatus(code: ScheduleErrorCode): number {
  switch (code) {
    case 'not_found':
      return 404;
    case 'forbidden':
      return 403;
    case 'already_inactive':
      return 409;
    default:
      return 400; // inactive_account | invalid
  }
}

function handleScheduleError(reply: FastifyReply, err: unknown): FastifyReply {
  if (err instanceof ScheduleError) {
    return reply
      .code(scheduleHttpStatus(err.code))
      .send({ error: err.message, code: err.code } satisfies ApiErrorResponse);
  }
  throw err;
}

function invalid(reply: FastifyReply, error: string, fields?: Record<string, string>): void {
  reply.code(400).send({ error, code: 'invalid_request', fields } as ApiErrorResponse & {
    fields?: Record<string, string>;
  });
}

export async function scheduleRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/schedules', { preHandler: requireAuth }, async (req, reply) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const check = validateCreateSchedule({
      kind: typeof body.kind === 'string' ? body.kind : undefined,
      fromAccountId: typeof body.fromAccountId === 'string' ? body.fromAccountId.slice(0, MAX_FIELD) : undefined,
      toAccountId: typeof body.toAccountId === 'string' ? body.toAccountId.slice(0, MAX_FIELD) : undefined,
      counterparty: typeof body.counterparty === 'string' ? body.counterparty.slice(0, MAX_FIELD) : undefined,
      memo: typeof body.memo === 'string' ? body.memo.slice(0, MAX_FIELD) : undefined,
      amountMinor: typeof body.amountMinor === 'number' ? body.amountMinor : undefined,
      frequency: typeof body.frequency === 'string' ? body.frequency : undefined,
      firstRunInDays: typeof body.firstRunInDays === 'number' ? body.firstRunInDays : undefined,
    });
    if (!check.ok || !check.value) {
      return invalid(reply, 'Please correct the highlighted fields.', check.errors as Record<string, string>);
    }
    try {
      const now = await simulationNow(prisma);
      const schedule = await createSchedule(req.user!, check.value, now);
      const response: CreateScheduleResponse = {
        schedule,
        message:
          'Your schedule was created (SIMULATION). It will run when the simulation clock reaches its next run date — nothing has moved yet.',
      };
      return reply.code(201).send(response);
    } catch (err) {
      return handleScheduleError(reply, err);
    }
  });

  app.get('/api/schedules', { preHandler: requireAuth }, async (req, reply) => {
    const schedules = await listSchedulesForUser(req.user!.id);
    return reply.send({ schedules } satisfies ScheduleListResponse);
  });

  app.post('/api/schedules/:id/cancel', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const now = await simulationNow(prisma);
      const schedule = await cancelSchedule(req.user!, id, now);
      return reply.send({ schedule } satisfies CancelScheduleResponse);
    } catch (err) {
      return handleScheduleError(reply, err);
    }
  });
}

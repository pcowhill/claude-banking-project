import type { FastifyInstance } from 'fastify';
import {
  validateAdvance,
  type AdvanceClockResponse,
  type ApiErrorResponse,
  type ClockResponse,
  type ScheduleListResponse,
} from '@simbank/shared';
import { prisma } from '../db';
import { requireAuth, requireRole } from '../auth/guards';
import { advanceClock, ClockError, getClockState } from '../clock/clock';
import { runDueSchedules } from '../scheduler/scheduler';
import { listAllSchedules } from '../scheduler/schedules';
import { runInterestAccrual } from '../lending/accrual';

/**
 * Simulation-clock endpoints (v0.9.0).
 *
 *  - `GET  /api/clock`              — read the current simulated date (ANY signed-in
 *    user; display only).
 *  - `POST /api/ops/clock/advance`  — ops/admin only: advance the clock FORWARD,
 *    then FIRE any now-due schedules (every fire is a real ledger entry via the
 *    money service). Returns the new clock + a per-schedule fired summary, and
 *    broadcasts fired bill-pay reviews + events to the operators room.
 *  - `GET  /api/ops/schedules`      — ops/admin only: every customer schedule.
 *
 * The clock can only move forward (the append-only ledger must never be
 * back-dated). SIMULATION: advancing time contacts no real money network.
 */
export async function clockRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/clock', { preHandler: requireAuth }, async (_req, reply) => {
    const clock = await getClockState(prisma);
    return reply.send({ clock } satisfies ClockResponse);
  });

  const opsOnly = { preHandler: [requireAuth, requireRole('ops_agent', 'admin')] };

  app.post('/api/ops/clock/advance', opsOnly, async (req, reply) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const check = validateAdvance({
      minutes: typeof body.minutes === 'number' ? body.minutes : undefined,
      hours: typeof body.hours === 'number' ? body.hours : undefined,
      days: typeof body.days === 'number' ? body.days : undefined,
    });
    if (!check.ok || !check.value) {
      return reply
        .code(400)
        .send({ error: check.errors.amount ?? 'Invalid clock advance.', code: 'invalid_request' } satisfies ApiErrorResponse);
    }
    try {
      const advanced = await advanceClock(prisma, check.value.minutes, req.user!);
      // Fire everything that became due, then accrue interest, then push results.
      const scheduler = await runDueSchedules(advanced.to);
      // v1.0.0: clock-driven interest accrual (savings + CD credits, loan debits).
      // Runs AFTER the scheduler so a payment that fired this advance is reflected
      // before interest is computed. Every accrual is a bank-originated ledger entry.
      const accrued = await runInterestAccrual(advanced.to);
      for (const request of scheduler.requests) app.opsRealtime.requestChanged('created', request);
      for (const event of scheduler.events) app.opsRealtime.externalEvent(event);
      const response: AdvanceClockResponse = { clock: advanced.clock, fired: scheduler.fired, accrued };
      return reply.send(response);
    } catch (err) {
      if (err instanceof ClockError) {
        return reply.code(400).send({ error: err.message, code: err.code } satisfies ApiErrorResponse);
      }
      throw err;
    }
  });

  app.get('/api/ops/schedules', opsOnly, async (_req, reply) => {
    const schedules = await listAllSchedules();
    return reply.send({ schedules } satisfies ScheduleListResponse);
  });
}

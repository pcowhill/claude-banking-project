import type { PaymentSchedule } from '@prisma/client';
import {
  addInterval,
  formatMinor,
  SCHEDULE_KIND_LABELS,
  SCHEDULE_LIMITS,
  type OperationsRequestDTO,
  type ScheduleFireSummary,
  type ScheduleFrequency,
  type ScheduleKind,
  type ScheduleStatus,
  type SessionUser,
  type SimulatedEventDTO,
  type UserRole,
} from '@simbank/shared';
import { prisma } from '../db';
import { writeAudit } from '../auth/audit';
import {
  createExternalMovement,
  createTransfer,
  MovementError,
  recordSimEvent,
} from '../money/movements';

/**
 * The clock-driven scheduler (v0.9.0). When the simulation clock advances (see
 * `clock/clock.ts`), the route calls {@link runDueSchedules} with the new time;
 * every active schedule whose `nextRunAt` has been passed FIRES, dated at its due
 * instant, by REUSING the v0.7.0 money service:
 *
 *  - `internal_transfer` → `createTransfer` posts BOTH `transfer` legs (nets to
 *    zero) immediately.
 *  - `bill_pay` → `createExternalMovement` writes a PENDING `payment` debit + a
 *    linked ops review item an operator then approves.
 *
 * MONEY DISCIPLINE: every fire is a real ledger entry; nothing edits a balance.
 * The acting principal is always the SCHEDULE OWNER, so the money service's own
 * access + funds checks apply unchanged — a fire can never exceed the owner's
 * access. A fire that fails those checks (e.g. insufficient funds) is recorded as
 * a clearly-labelled "skipped" simulated event + audit and the schedule advances
 * (never throws out of the run, never silently drops). Catch-up is bounded.
 */

export interface SchedulerResult {
  /** Per-schedule summary of what happened this advance. */
  fired: ScheduleFireSummary[];
  /** Ops requests created by fired bill-pays (for the route to broadcast). */
  requests: OperationsRequestDTO[];
  /** Simulated events produced (fired/skipped notices + movement events). */
  events: SimulatedEventDTO[];
}

type ScheduleWithUser = PaymentSchedule & {
  user: { id: string; email: string; displayName: string; role: string };
};

/** Fire every active schedule whose `nextRunAt` is at or before `upTo`. */
export async function runDueSchedules(upTo: Date): Promise<SchedulerResult> {
  const due = (await prisma.paymentSchedule.findMany({
    where: { status: 'active', nextRunAt: { not: null, lte: upTo } },
    include: { user: { select: { id: true, email: true, displayName: true, role: true } } },
    orderBy: { nextRunAt: 'asc' },
  })) as ScheduleWithUser[];

  const result: SchedulerResult = { fired: [], requests: [], events: [] };
  for (const schedule of due) {
    const summary = await fireSchedule(schedule, upTo, result);
    if (summary.runs > 0 || summary.skipped > 0) result.fired.push(summary);
  }
  return result;
}

function ownerOf(schedule: ScheduleWithUser): SessionUser {
  return {
    id: schedule.user.id,
    email: schedule.user.email,
    displayName: schedule.user.displayName,
    role: schedule.user.role as UserRole,
  };
}

/**
 * Fire one schedule's due occurrences (catching up if the clock jumped several
 * periods), bounded by {@link SCHEDULE_LIMITS.maxCatchUpRuns}. Each occurrence is
 * CLAIMED (the schedule's `nextRunAt` is advanced first) before the money moves,
 * so an interruption can never double-fire the same occurrence.
 */
async function fireSchedule(
  schedule: ScheduleWithUser,
  upTo: Date,
  sink: SchedulerResult,
): Promise<ScheduleFireSummary> {
  const owner = ownerOf(schedule);
  const kind = schedule.kind as ScheduleKind;
  const frequency = schedule.frequency as ScheduleFrequency;
  const label = SCHEDULE_KIND_LABELS[kind] ?? kind;

  let nextRunAt: Date | null = schedule.nextRunAt;
  let status: ScheduleStatus = 'active';
  let runs = 0;
  let skipped = 0;
  let postedMinor = 0;
  let queuedMinor = 0;
  let iterations = 0;

  while (nextRunAt && nextRunAt.getTime() <= upTo.getTime() && status === 'active') {
    if (iterations >= SCHEDULE_LIMITS.maxCatchUpRuns) {
      // Backstop (essentially unreachable within the per-advance bound). Skip the
      // remaining due occurrences forward past `upTo` so the schedule is not left
      // perpetually due, and record it honestly — never a silent truncation.
      const before = nextRunAt;
      let guard = 0;
      while (nextRunAt && nextRunAt.getTime() <= upTo.getTime() && guard < 4096) {
        nextRunAt = addInterval(nextRunAt, frequency);
        guard += 1;
      }
      await writeAudit(prisma, {
        actorId: null,
        actorRole: 'system',
        action: 'schedule_catchup_capped',
        entity: 'payment_schedule',
        entityId: schedule.id,
        reason: `Catch-up cap (${SCHEDULE_LIMITS.maxCatchUpRuns}) hit; fast-forwarded past ${upTo.toISOString()} (simulated)`,
        metadata: { fromISO: before.toISOString(), nextISO: nextRunAt ? nextRunAt.toISOString() : null },
      });
      break;
    }

    const occurrenceAt = nextRunAt;
    const following = addInterval(occurrenceAt, frequency); // null for a one-time schedule
    const claimedStatus: ScheduleStatus = following === null ? 'completed' : 'active';

    // CLAIM this occurrence first: advance the schedule before any money moves so
    // a crash can lose at most this occurrence, never double-charge it.
    await prisma.paymentSchedule.update({
      where: { id: schedule.id },
      data: { nextRunAt: following, status: claimedStatus, updatedAt: upTo },
    });
    iterations += 1;

    try {
      if (kind === 'internal_transfer') {
        if (!schedule.toAccountId) {
          throw new MovementError('not_found', 'The destination account is no longer available.');
        }
        await createTransfer(
          owner,
          {
            fromAccountId: schedule.fromAccountId,
            toAccountId: schedule.toAccountId,
            amountMinor: schedule.amountMinor,
            memo: schedule.memo,
          },
          occurrenceAt,
        );
        postedMinor += schedule.amountMinor;
      } else if (kind === 'bill_pay') {
        if (!schedule.counterparty) {
          throw new MovementError('invalid', 'The biller is no longer available.');
        }
        const created = await createExternalMovement(
          owner,
          {
            accountId: schedule.fromAccountId,
            kind: 'bill_pay',
            amountMinor: schedule.amountMinor,
            direction: 'outbound',
            counterparty: schedule.counterparty,
            memo: schedule.memo,
          },
          occurrenceAt,
        );
        sink.requests.push(created.request);
        sink.events.push(...created.events);
        queuedMinor += schedule.amountMinor;
      } else {
        throw new MovementError('invalid', 'Unknown schedule kind.');
      }

      // Success bookkeeping (the money itself already lives in the ledger).
      await prisma.paymentSchedule.update({
        where: { id: schedule.id },
        data: { runCount: { increment: 1 }, lastRunAt: occurrenceAt },
      });
      runs += 1;

      const firedEvent = await recordSimEvent(
        prisma,
        {
          channel: 'email',
          kind: 'schedule_fired',
          status: 'sent',
          summary: `Scheduled ${label.toLowerCase()} — ${formatMinor(schedule.amountMinor)} (simulated)`,
          detail: `Simulated scheduled payment fired on ${occurrenceAt.toISOString()}.`,
          requestId: null,
        },
        occurrenceAt,
      );
      sink.events.push(firedEvent);
    } catch (err) {
      if (!(err instanceof MovementError)) throw err;
      skipped += 1;
      const skipEvent = await recordSimEvent(
        prisma,
        {
          channel: 'email',
          kind: 'schedule_skipped',
          status: 'failed',
          summary: `Scheduled ${label.toLowerCase()} skipped — ${formatMinor(schedule.amountMinor)} (simulated)`,
          detail: `Simulated: ${err.message}`,
          requestId: null,
        },
        occurrenceAt,
      );
      sink.events.push(skipEvent);
      await writeAudit(prisma, {
        actorId: schedule.user.id,
        actorRole: 'system',
        action: 'schedule_payment_skipped',
        entity: 'payment_schedule',
        entityId: schedule.id,
        reason: err.message,
        metadata: { occurrenceISO: occurrenceAt.toISOString(), code: err.code, amountMinor: schedule.amountMinor },
      });
    }

    nextRunAt = following;
    status = claimedStatus;
  }

  return { scheduleId: schedule.id, kind, runs, postedMinor, queuedMinor, skipped, status };
}

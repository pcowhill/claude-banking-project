import type { PaymentSchedule } from '@prisma/client';
import {
  formatMinor,
  isActiveSchedule,
  SCHEDULE_KIND_LABELS,
  scheduleFrequencyLabel,
  type NormalizedCreateSchedule,
  type ScheduleDTO,
  type ScheduleFrequency,
  type ScheduleKind,
  type ScheduleStatus,
  type SessionUser,
} from '@simbank/shared';
import { prisma } from '../db';
import { writeAudit } from '../auth/audit';
import { getAccountRelationship } from '../auth/access';

/**
 * Scheduled-payment service (v0.9.0) — create / list / cancel the INSTRUCTIONS.
 * No money moves here; firing (when the clock passes the due date) lives in
 * `scheduler.ts` and goes through the v0.7.0 money service. Access is checked at
 * creation against the SAME relationships the money service uses, and the firing
 * actor is always the schedule owner, so a schedule can never reach an account
 * its owner could not already touch.
 */

export type ScheduleErrorCode =
  | 'not_found'
  | 'forbidden'
  | 'inactive_account'
  | 'invalid'
  | 'already_inactive';

export class ScheduleError extends Error {
  readonly code: ScheduleErrorCode;
  constructor(code: ScheduleErrorCode, message: string) {
    super(message);
    this.name = 'ScheduleError';
    this.code = code;
  }
}

const MOVABLE_RELATIONSHIPS = new Set(['owner', 'joint', 'authorized']);
const DAY_MS = 24 * 60 * 60 * 1000;

/** Include the from/to account names so the DTO can label them. */
const INCLUDE_ACCOUNTS = {
  fromAccount: { select: { name: true } },
  toAccount: { select: { name: true } },
} as const;

type ScheduleWithAccounts = PaymentSchedule & {
  fromAccount: { name: string } | null;
  toAccount: { name: string } | null;
};

export function toScheduleDTO(row: ScheduleWithAccounts): ScheduleDTO {
  return {
    id: row.id,
    kind: row.kind as ScheduleKind,
    amountMinor: row.amountMinor,
    fromAccountId: row.fromAccountId,
    fromAccountName: row.fromAccount?.name ?? null,
    toAccountId: row.toAccountId,
    toAccountName: row.toAccount?.name ?? null,
    counterparty: row.counterparty,
    memo: row.memo,
    frequency: row.frequency as ScheduleFrequency,
    status: row.status as ScheduleStatus,
    nextRunAt: row.nextRunAt ? row.nextRunAt.toISOString() : null,
    lastRunAt: row.lastRunAt ? row.lastRunAt.toISOString() : null,
    runCount: row.runCount,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Confirm the user may schedule payments on an account (non-viewer, active). */
async function requireSchedulableAccount(userId: string, accountId: string): Promise<void> {
  const account = await prisma.account.findUnique({ where: { id: accountId }, select: { status: true } });
  if (!account) throw new ScheduleError('not_found', 'That account was not found.');
  const relationship = await getAccountRelationship(prisma, userId, accountId);
  if (!relationship || !MOVABLE_RELATIONSHIPS.has(relationship)) {
    throw new ScheduleError('forbidden', 'You cannot schedule payments on that account.');
  }
  if (account.status !== 'active') {
    throw new ScheduleError('inactive_account', 'That account is not active.');
  }
}

/**
 * Create a schedule. `nextRunAt` is the FIRST due date, computed from the
 * simulation "now" + `firstRunInDays`. Access to the source (and, for an internal
 * transfer, the destination) account is checked here; the schedule then waits for
 * the clock to reach `nextRunAt`.
 */
export async function createSchedule(
  user: SessionUser,
  input: NormalizedCreateSchedule,
  now: Date,
): Promise<ScheduleDTO> {
  await requireSchedulableAccount(user.id, input.fromAccountId);
  if (input.kind === 'internal_transfer') {
    if (!input.toAccountId) throw new ScheduleError('invalid', 'A destination account is required.');
    if (input.toAccountId === input.fromAccountId) {
      throw new ScheduleError('invalid', 'Choose two different accounts.');
    }
    await requireSchedulableAccount(user.id, input.toAccountId);
  }

  const nextRunAt = new Date(now.getTime() + input.firstRunInDays * DAY_MS);

  const created = await prisma.paymentSchedule.create({
    data: {
      userId: user.id,
      kind: input.kind,
      fromAccountId: input.fromAccountId,
      toAccountId: input.kind === 'internal_transfer' ? input.toAccountId : null,
      counterparty: input.kind === 'bill_pay' ? input.counterparty : null,
      memo: input.memo,
      amountMinor: input.amountMinor,
      frequency: input.frequency,
      nextRunAt,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    },
    include: INCLUDE_ACCOUNTS,
  });

  await writeAudit(prisma, {
    actorId: user.id,
    actorRole: user.role,
    action: 'schedule_created',
    entity: 'payment_schedule',
    entityId: created.id,
    reason: `Scheduled ${SCHEDULE_KIND_LABELS[input.kind]} ${formatMinor(input.amountMinor)} (${scheduleFrequencyLabel(
      input.frequency,
    )}; first run ${nextRunAt.toISOString()}) (simulated)`,
    metadata: {
      kind: input.kind,
      amountMinor: input.amountMinor,
      frequency: input.frequency,
      fromAccountId: input.fromAccountId,
      toAccountId: input.toAccountId,
      firstRunInDays: input.firstRunInDays,
      actorName: user.displayName,
    },
  });

  return toScheduleDTO(created);
}

/** A user's own schedules (active first, then by next run). */
export async function listSchedulesForUser(userId: string): Promise<ScheduleDTO[]> {
  const rows = await prisma.paymentSchedule.findMany({
    where: { userId },
    include: INCLUDE_ACCOUNTS,
    orderBy: [{ status: 'asc' }, { nextRunAt: 'asc' }, { createdAt: 'desc' }],
  });
  return rows.map(toScheduleDTO);
}

/** Every schedule (operator view). */
export async function listAllSchedules(): Promise<ScheduleDTO[]> {
  const rows = await prisma.paymentSchedule.findMany({
    include: INCLUDE_ACCOUNTS,
    orderBy: [{ status: 'asc' }, { nextRunAt: 'asc' }, { createdAt: 'desc' }],
  });
  return rows.map(toScheduleDTO);
}

/** Cancel an active schedule (owner only). Stops all future fires. */
export async function cancelSchedule(user: SessionUser, scheduleId: string, now: Date): Promise<ScheduleDTO> {
  const existing = await prisma.paymentSchedule.findUnique({ where: { id: scheduleId } });
  if (!existing) throw new ScheduleError('not_found', 'That schedule was not found.');
  if (existing.userId !== user.id) throw new ScheduleError('forbidden', 'That is not your schedule.');
  if (!isActiveSchedule(existing.status as ScheduleStatus)) {
    throw new ScheduleError('already_inactive', 'That schedule is no longer active.');
  }

  const updated = await prisma.paymentSchedule.update({
    where: { id: scheduleId },
    data: { status: 'cancelled', nextRunAt: null, updatedAt: now },
    include: INCLUDE_ACCOUNTS,
  });

  await writeAudit(prisma, {
    actorId: user.id,
    actorRole: user.role,
    action: 'schedule_cancelled',
    entity: 'payment_schedule',
    entityId: scheduleId,
    reason: 'Schedule cancelled by the customer (simulated)',
    metadata: { actorName: user.displayName },
  });

  return toScheduleDTO(updated);
}

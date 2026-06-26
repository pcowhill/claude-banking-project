import type { AuditLog, OperationsRequest, PrismaClient, SimulatedEvent } from '@prisma/client';
import {
  canApplyAction,
  isDecisionAction,
  isTerminalOpsStatus,
  nextStatusForAction,
  type OperationsQueueQuery,
  type OperationsRequestDTO,
  type OperationsRequestDetailDTO,
  type OperatorActionLogDTO,
  type OpsAction,
  type OpsRequestPriority,
  type OpsRequestStatus,
  type OpsRequestType,
  type SessionUser,
  type SimEventChannel,
  type SimEventDirection,
  type SimEventStatus,
  type SimulateEventRequest,
  type SimulatedEventDTO,
} from '@simbank/shared';
import { writeAudit } from '../auth/audit';
import type { DbClient } from '../db';
import {
  onboardingApprovalBlocker,
  provisionApprovedOnboarding,
  rejectOnboardingApplication,
} from './onboarding';

/**
 * Operations-simulator domain service (v0.5.0). The single place that reads and
 * mutates the operations queue + simulated-event feed, so the routes stay thin
 * and the rules live in one tested module.
 *
 * MONEY DISCIPLINE: an operator action changes a request's WORKFLOW STATUS and
 * appends an AuditLog row — it NEVER writes a LedgerEntry. The ledger effects of
 * an approval (a deposit clearing, an ACH posting) arrive with money movement in
 * v0.7.0. Balances therefore remain derived and untouched by this milestone.
 */

/** Audit action prefix for operator actions on a request (e.g. `ops_approve`). */
const AUDIT_ACTION_PREFIX = 'ops_';
const AUDIT_INTAKE_ACTION = 'ops_request_created';
const AUDIT_ENTITY_REQUEST = 'operations_request';
const AUDIT_ENTITY_EVENT = 'simulated_event';

/** Typed failure from {@link applyOperatorAction}, mapped to an HTTP status by the route. */
export type OpsActionErrorCode = 'not_found' | 'already_resolved' | 'invalid_action';

export class OpsActionError extends Error {
  readonly code: OpsActionErrorCode;
  constructor(code: OpsActionErrorCode, message: string) {
    super(message);
    this.name = 'OpsActionError';
    this.code = code;
  }
}

// ---- Mappers ----------------------------------------------------------------

/** Parse a stored JSON string column, tolerating null/garbage. */
function parseJson(value: string | null): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function toOperationsRequestDTO(row: OperationsRequest): OperationsRequestDTO {
  return {
    id: row.id,
    type: row.type as OpsRequestType,
    status: row.status as OpsRequestStatus,
    priority: row.priority as OpsRequestPriority,
    summary: row.summary,
    detail: row.detail,
    subjectName: row.subjectName,
    subjectEmail: row.subjectEmail,
    payload: parseJson(row.payload),
    lastAction: (row.lastAction as OpsAction | null) ?? null,
    lastActorName: row.lastActorName,
    lastActionNote: row.lastActionNote,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
  };
}

export function toSimulatedEventDTO(row: SimulatedEvent): SimulatedEventDTO {
  return {
    id: row.id,
    channel: row.channel as SimEventChannel,
    direction: row.direction as SimEventDirection,
    kind: row.kind,
    status: row.status as SimEventStatus,
    summary: row.summary,
    detail: row.detail,
    requestId: row.requestId,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Strip the `ops_` prefix (and normalize the intake row) for display. */
function auditActionToHistory(action: string): string {
  if (action === AUDIT_INTAKE_ACTION) return 'created';
  return action.startsWith(AUDIT_ACTION_PREFIX) ? action.slice(AUDIT_ACTION_PREFIX.length) : action;
}

function toOperatorActionLogDTO(row: AuditLog): OperatorActionLogDTO {
  const metadata = parseJson(row.metadata);
  const actorName = metadata && typeof metadata.actorName === 'string' ? metadata.actorName : null;
  return {
    id: row.id,
    action: auditActionToHistory(row.action),
    actorName,
    actorRole: row.actorRole,
    note: row.reason,
    createdAt: row.createdAt.toISOString(),
  };
}

// ---- Reads ------------------------------------------------------------------

/** Priority sort weight (high first). */
const PRIORITY_WEIGHT: Record<OpsRequestPriority, number> = { high: 0, normal: 1, low: 2 };

/**
 * The operations queue, filtered by an optional status/type. Ordered so the most
 * pressing work surfaces first: still-actionable items before resolved ones,
 * then by priority (high → low), then newest first.
 */
export async function listOperationsRequests(
  prisma: PrismaClient,
  query: OperationsQueueQuery = {},
): Promise<OperationsRequestDTO[]> {
  const where: { status?: string; type?: string } = {};
  if (query.status) where.status = query.status;
  if (query.type) where.type = query.type;

  const rows = await prisma.operationsRequest.findMany({ where });
  return rows
    .map(toOperationsRequestDTO)
    .sort((a, b) => {
      const resolvedDelta = Number(isTerminalOpsStatus(a.status)) - Number(isTerminalOpsStatus(b.status));
      if (resolvedDelta !== 0) return resolvedDelta;
      const priorityDelta = PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority];
      if (priorityDelta !== 0) return priorityDelta;
      return Date.parse(b.createdAt) - Date.parse(a.createdAt);
    });
}

/**
 * A single request with its operator-action history (from the audit trail) and
 * the simulated events linked to it. Returns null when the id is unknown.
 */
export async function getOperationsRequestDetail(
  prisma: PrismaClient,
  id: string,
): Promise<OperationsRequestDetailDTO | null> {
  const row = await prisma.operationsRequest.findUnique({ where: { id } });
  if (!row) return null;

  const [auditRows, eventRows] = await Promise.all([
    prisma.auditLog.findMany({
      where: { entity: AUDIT_ENTITY_REQUEST, entityId: id },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.simulatedEvent.findMany({ where: { requestId: id }, orderBy: { createdAt: 'desc' } }),
  ]);

  return {
    ...toOperationsRequestDTO(row),
    history: auditRows.map(toOperatorActionLogDTO),
    events: eventRows.map(toSimulatedEventDTO),
  };
}

/** Recent simulated events across all channels, newest-first. */
export async function listSimulatedEvents(
  prisma: PrismaClient,
  limit = 50,
): Promise<SimulatedEventDTO[]> {
  const rows = await prisma.simulatedEvent.findMany({
    orderBy: { createdAt: 'desc' },
    take: Math.min(Math.max(limit, 1), 200),
  });
  return rows.map(toSimulatedEventDTO);
}

// ---- Mutations --------------------------------------------------------------

export interface AppliedAction {
  request: OperationsRequestDTO;
  /** A simulated event auto-generated by the action (e.g. request_info → email), or null. */
  event: SimulatedEventDTO | null;
  /**
   * Additional simulated events produced as a side-effect (e.g. onboarding
   * approval → "account opened" + any joint-invite email). The route broadcasts
   * these to the operators feed alongside the queue change.
   */
  events?: SimulatedEventDTO[];
  /** Set when an onboarding approval provisioned a real user/account (v0.6.0). */
  provisioned?: { userId: string; accountId: string; fundingMinor: number } | null;
}

/**
 * Apply an operator action to a queue item.
 *
 *  - A `note` (v0.6.0) records context in the audit trail WITHOUT changing
 *    status and is allowed at ANY time, including on a resolved request — so an
 *    operator can annotate a decision after the fact.
 *  - The four decisions validate the transition, persist the new status +
 *    last-action bookkeeping, and write an audit row. `request_info` also
 *    auto-generates a simulated outbound email.
 *  - Approving an `onboarding` request additionally PROVISIONS the user +
 *    account + initial funding (v0.6.0), atomically, with funding entering via a
 *    bank-originated ledger event (see `provisionApprovedOnboarding`). Rejecting
 *    one marks the application rejected.
 *
 * Throws {@link OpsActionError} for an unknown id, a resolved request (decision),
 * an empty note, or a blocked onboarding approval. A non-onboarding action never
 * touches the ledger.
 */
export async function applyOperatorAction(
  prisma: PrismaClient,
  input: { id: string; action: OpsAction; note?: string | null; actor: SessionUser },
  now: Date = new Date(),
): Promise<AppliedAction> {
  const existing = await prisma.operationsRequest.findUnique({ where: { id: input.id } });
  if (!existing) {
    throw new OpsActionError('not_found', 'That operations request does not exist.');
  }
  const currentStatus = existing.status as OpsRequestStatus;
  const note = input.note?.trim() ? input.note.trim() : null;

  // Build the audit input for an action (shared across the branches below).
  const auditFor = (toStatus: OpsRequestStatus | null) => ({
    actorId: input.actor.id,
    actorRole: input.actor.role,
    action: `${AUDIT_ACTION_PREFIX}${input.action}`,
    entity: AUDIT_ENTITY_REQUEST,
    entityId: input.id,
    reason: note,
    metadata: {
      action: input.action,
      actorName: input.actor.displayName,
      fromStatus: currentStatus,
      toStatus: toStatus ?? currentStatus,
    },
  });

  // ---- Note: annotate at any time; no status change; never the ledger. ------
  if (!isDecisionAction(input.action)) {
    if (!note) {
      throw new OpsActionError('invalid_action', 'A note is required to add a note.');
    }
    // Touch updatedAt so every open console re-syncs (and the detail panel
    // refreshes its history); status + decision bookkeeping are left untouched.
    const updated = await prisma.operationsRequest.update({
      where: { id: input.id },
      data: { updatedAt: now },
    });
    await writeAudit(prisma, auditFor(null));
    return { request: toOperationsRequestDTO(updated), event: null };
  }

  // ---- Decisions: must be applied to a non-terminal request. ----------------
  if (!canApplyAction(currentStatus, input.action)) {
    throw new OpsActionError(
      'already_resolved',
      'That request has already been resolved and cannot be actioned again.',
    );
  }
  const nextStatus = nextStatusForAction(input.action) as OpsRequestStatus; // non-null for decisions
  const decisionData = {
    status: nextStatus,
    lastAction: input.action,
    lastActorId: input.actor.id,
    lastActorRole: input.actor.role,
    lastActorName: input.actor.displayName,
    lastActionNote: note,
    resolvedAt: isTerminalOpsStatus(nextStatus) ? now : null,
    updatedAt: now,
  };
  const isOnboarding = existing.type === 'onboarding';

  // ---- Onboarding APPROVE → provision the user/account/funding atomically. --
  if (isOnboarding && input.action === 'approve') {
    const blocker = await onboardingApprovalBlocker(existing);
    if (blocker) throw new OpsActionError('invalid_action', blocker);
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.operationsRequest.update({ where: { id: input.id }, data: decisionData });
      await writeAudit(tx, auditFor(nextStatus));
      const provision = await provisionApprovedOnboarding(tx, input.id, input.actor, now);
      return { updated, provision };
    });
    return {
      request: toOperationsRequestDTO(result.updated),
      event: null,
      events: result.provision?.events ?? [],
      provisioned: result.provision
        ? {
            userId: result.provision.userId,
            accountId: result.provision.accountId,
            fundingMinor: result.provision.fundingMinor,
          }
        : null,
    };
  }

  // ---- Onboarding REJECT → mark the application rejected + decline email. ----
  if (isOnboarding && input.action === 'reject') {
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.operationsRequest.update({ where: { id: input.id }, data: decisionData });
      await writeAudit(tx, auditFor(nextStatus));
      const email = await rejectOnboardingApplication(tx, input.id, now);
      return { updated, email };
    });
    return { request: toOperationsRequestDTO(result.updated), event: result.email };
  }

  // ---- All other decisions (unchanged workflow-only behavior). --------------
  const updated = await prisma.operationsRequest.update({ where: { id: input.id }, data: decisionData });
  await writeAudit(prisma, auditFor(nextStatus));

  let event: SimulatedEventDTO | null = null;
  if (input.action === 'request_info') {
    event = await createSimulatedEvent(
      prisma,
      {
        channel: 'email',
        kind: 'notification',
        outcome: 'sent',
        requestId: input.id,
        summary: `Information request sent${existing.subjectName ? ` to ${existing.subjectName}` : ''} (simulated)`,
      },
      input.actor,
      now,
    );
  }

  return { request: toOperationsRequestDTO(updated), event };
}

/** Default simulated outcome per channel when the caller does not specify one. */
const DEFAULT_OUTCOME: Record<SimEventChannel, SimEventStatus> = {
  sms: 'delivered',
  email: 'sent',
  mfa: 'pending',
  identity: 'pending',
};

const DEFAULT_DIRECTION: Record<SimEventChannel, SimEventDirection> = {
  sms: 'outbound',
  email: 'outbound',
  mfa: 'outbound',
  identity: 'outbound',
};

/**
 * Record a SIMULATED external event (SMS / email / MFA / identity). This NEVER
 * contacts a real provider — it only writes a clearly-labelled fake event the
 * console can display. Audited like other operator-initiated actions.
 */
export async function createSimulatedEvent(
  prisma: DbClient,
  input: SimulateEventRequest,
  actor: SessionUser,
  now: Date = new Date(),
): Promise<SimulatedEventDTO> {
  const status = input.outcome ?? DEFAULT_OUTCOME[input.channel];
  const direction = input.direction ?? DEFAULT_DIRECTION[input.channel];
  const summary = input.summary?.trim()
    ? input.summary.trim()
    : `Simulated ${input.channel.toUpperCase()} ${input.kind ?? 'message'}`;

  // Only attach to a request that actually exists (keeps the FK clean).
  let requestId: string | null = null;
  if (input.requestId) {
    const exists = await prisma.operationsRequest.findUnique({
      where: { id: input.requestId },
      select: { id: true },
    });
    requestId = exists ? exists.id : null;
  }

  const created = await prisma.simulatedEvent.create({
    data: {
      channel: input.channel,
      direction,
      kind: input.kind ?? null,
      status,
      summary,
      detail: 'SIMULATION — no real message was sent to any provider.',
      requestId,
      createdAt: now,
    },
  });

  await writeAudit(prisma, {
    actorId: actor.id,
    actorRole: actor.role,
    action: 'ops_simulate_event',
    entity: AUDIT_ENTITY_EVENT,
    entityId: created.id,
    reason: summary,
    metadata: { channel: input.channel, status, requestId, actorName: actor.displayName },
  });

  return toSimulatedEventDTO(created);
}

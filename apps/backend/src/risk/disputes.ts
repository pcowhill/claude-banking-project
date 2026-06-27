import type { OperationsRequest } from '@prisma/client';
import {
  asDisputePayload,
  DISPUTE_REASON_LABELS,
  formatMinor,
  type DisputePayload,
  type NormalizedDispute,
  type OperationsRequestDTO,
  type SessionUser,
  type SimulatedEventDTO,
} from '@simbank/shared';
import { prisma, type DbClient } from '../db';
import { writeAudit } from '../auth/audit';
import { getAccountRelationship } from '../auth/access';
import { toOperationsRequestDTO } from '../ops/requests';
import { recordSimEvent, reverseLedgerEntries } from '../money/movements';

/**
 * Transaction-dispute service (v0.8.0). A customer disputes a POSTED
 * transaction; this flags the entry `disputed` (still counts as posted, shown
 * flagged) and opens a `dispute` operations-queue item. An operator RESOLVES it:
 *  - APPROVE = uphold → reverse the disputed entry (`disputed`→`reversed`,
 *    reason + audit) — the charge is refunded as a ledger STATUS change.
 *  - REJECT  = deny   → the entry returns `disputed`→`posted` (the charge stands).
 *
 * MONEY DISCIPLINE: every effect is a ledger status change, never a balance edit;
 * balances stay DERIVED. SIMULATION: no real card network / chargeback rail.
 */

export type DisputeErrorCode = 'not_found' | 'forbidden' | 'invalid_state';

export class DisputeError extends Error {
  readonly code: DisputeErrorCode;
  constructor(code: DisputeErrorCode, message: string) {
    super(message);
    this.name = 'DisputeError';
    this.code = code;
  }
}

const CUSTOMER_RELATIONSHIPS = new Set(['owner', 'joint', 'authorized']);

/** The dispute payload of a request, or null if it is not a (linked) dispute. */
export function disputePayloadOf(row: Pick<OperationsRequest, 'type' | 'payload'>): DisputePayload | null {
  if (row.type !== 'dispute') return null;
  let parsed: unknown = null;
  try {
    parsed = row.payload ? JSON.parse(row.payload) : null;
  } catch {
    parsed = null;
  }
  return asDisputePayload(parsed);
}

export interface CreatedDispute {
  request: OperationsRequestDTO;
  events: SimulatedEventDTO[];
}

/**
 * File a dispute against a posted transaction. Flags the entry `disputed` and
 * creates the linked `dispute` ops item (carrying the entry id) atomically.
 */
export async function createDispute(
  user: SessionUser,
  input: NormalizedDispute,
  now: Date = new Date(),
): Promise<CreatedDispute> {
  const entry = await prisma.ledgerEntry.findUnique({
    where: { id: input.ledgerEntryId },
    include: { account: { select: { id: true } } },
  });
  if (!entry) throw new DisputeError('not_found', 'That transaction was not found.');

  const relationship = await getAccountRelationship(prisma, user.id, entry.accountId);
  if (!relationship || !CUSTOMER_RELATIONSHIPS.has(relationship)) {
    throw new DisputeError('forbidden', 'You cannot dispute that transaction.');
  }
  if (entry.status !== 'posted') {
    throw new DisputeError(
      'invalid_state',
      'Only a posted transaction can be disputed.',
    );
  }
  // An internal transfer posts BOTH legs and must net to zero; reversing a single
  // leg would unbalance it. Disputes are for external/merchant activity, so a
  // `transfer` leg is not disputable (security review v0.8.0, finding #4).
  if (entry.origin === 'transfer') {
    throw new DisputeError('invalid_state', 'An internal transfer cannot be disputed.');
  }

  const reasonLabel = DISPUTE_REASON_LABELS[input.reason];
  const amount = formatMinor(entry.amountMinor);
  const summary = `Disputed transaction — ${entry.description} (${amount})`;
  const detail = `Customer disputes "${entry.description}" (${amount}): ${reasonLabel}.${input.details ? ` Notes: ${input.details}` : ''} Resolving APPROVE reverses the charge; REJECT lets it stand (simulated).`;

  const payload: DisputePayload = {
    ledgerEntryId: entry.id,
    accountId: entry.accountId,
    amountMinor: entry.amountMinor,
    reason: input.reason,
    details: input.details,
    description: entry.description,
  };

  const { request, events } = await prisma.$transaction(async (tx) => {
    // Flag the entry as disputed (still posted for balance purposes, shown flagged).
    await tx.ledgerEntry.update({ where: { id: entry.id }, data: { status: 'disputed' } });

    const created = await tx.operationsRequest.create({
      data: {
        type: 'dispute',
        status: 'pending',
        priority: 'normal',
        summary,
        detail,
        subjectName: user.displayName,
        subjectEmail: user.email,
        payload: JSON.stringify(payload),
        createdAt: now,
        updatedAt: now,
      },
    });

    await writeAudit(tx, {
      actorId: user.id,
      actorRole: user.role,
      action: 'ops_request_created',
      entity: 'operations_request',
      entityId: created.id,
      reason: `${summary} — filed by ${user.displayName} (simulated)`,
      metadata: { ledgerEntryId: entry.id, reason: input.reason },
    });

    const event = await recordSimEvent(
      tx,
      {
        channel: 'email',
        kind: 'dispute_received',
        status: 'sent',
        summary: 'Dispute received — under review (simulated)',
        detail: `Simulated confirmation that a dispute for ${amount} was received and is under review.`,
        requestId: created.id,
      },
      now,
    );

    return { request: created, events: [event] };
  });

  return { request: toOperationsRequestDTO(request), events };
}

export interface ResolvedDispute {
  request: OperationsRequest;
  events: SimulatedEventDTO[];
}

/**
 * Uphold a dispute (operator APPROVE): reverse the disputed entry
 * (`disputed`→`reversed`) and mark the request `resolution: 'upheld'`,
 * `reversed: true`. Runs inside the ops approve transaction; audited.
 */
export async function upholdDispute(
  tx: DbClient,
  request: OperationsRequest,
  actor: SessionUser,
  now: Date,
): Promise<ResolvedDispute> {
  const payload = disputePayloadOf(request);
  if (!payload) {
    // Not a linked dispute (e.g. a seeded item without an entry) — workflow only.
    return { request, events: [] };
  }

  const reversedCount = await reverseLedgerEntries(tx, [payload.ledgerEntryId]);
  const newPayload: DisputePayload = { ...payload, resolution: 'upheld', reversed: reversedCount > 0 };
  const updated = await tx.operationsRequest.update({
    where: { id: request.id },
    data: { payload: JSON.stringify(newPayload), updatedAt: now },
  });

  await writeAudit(tx, {
    actorId: actor.id,
    actorRole: actor.role,
    action: 'dispute_upheld',
    entity: 'ledger_entry',
    entityId: payload.ledgerEntryId,
    reason: `Dispute upheld — reversed ${formatMinor(payload.amountMinor)} (simulated)`,
    metadata: { ...payload, reversedCount, actorName: actor.displayName },
  });

  const event = await recordSimEvent(
    tx,
    {
      channel: 'email',
      kind: 'dispute_upheld',
      status: 'sent',
      summary: `Dispute upheld — ${formatMinor(payload.amountMinor)} refunded (simulated)`,
      requestId: request.id,
    },
    now,
  );

  return { request: updated, events: [event] };
}

/**
 * Deny a dispute (operator REJECT): return the disputed entry to `posted` (the
 * charge stands) and mark the request `resolution: 'denied'`. Audited.
 */
export async function denyDispute(
  tx: DbClient,
  request: OperationsRequest,
  actor: SessionUser,
  now: Date,
): Promise<ResolvedDispute> {
  const payload = disputePayloadOf(request);
  if (!payload) return { request, events: [] };

  await tx.ledgerEntry.updateMany({
    where: { id: payload.ledgerEntryId, status: 'disputed' },
    data: { status: 'posted' },
  });
  const newPayload: DisputePayload = { ...payload, resolution: 'denied', reversed: false };
  const updated = await tx.operationsRequest.update({
    where: { id: request.id },
    data: { payload: JSON.stringify(newPayload), updatedAt: now },
  });

  await writeAudit(tx, {
    actorId: actor.id,
    actorRole: actor.role,
    action: 'dispute_denied',
    entity: 'ledger_entry',
    entityId: payload.ledgerEntryId,
    reason: `Dispute denied — charge stands ${formatMinor(payload.amountMinor)} (simulated)`,
    metadata: { ...payload, actorName: actor.displayName },
  });

  const event = await recordSimEvent(
    tx,
    {
      channel: 'email',
      kind: 'dispute_denied',
      status: 'sent',
      summary: `Dispute denied — charge stands ${formatMinor(payload.amountMinor)} (simulated)`,
      requestId: request.id,
    },
    now,
  );

  return { request: updated, events: [event] };
}

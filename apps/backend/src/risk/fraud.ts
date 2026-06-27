import type { OperationsRequest } from '@prisma/client';
import {
  asFraudPayload,
  formatMinor,
  FRAUD_RESPONSE_LABELS,
  type FraudAlertSummary,
  type FraudPayload,
  type FraudResponse,
  type OperationsRequestDTO,
  type SessionUser,
  type SimulatedEventDTO,
} from '@simbank/shared';
import { prisma, type DbClient } from '../db';
import { writeAudit } from '../auth/audit';
import { toOperationsRequestDTO } from '../ops/requests';
import { recordSimEvent, reverseLedgerEntries } from '../money/movements';
import { freezeCardById } from '../cards/cards';

/**
 * Fraud-alert service (v0.8.0). The bank flags a suspicious transaction as a
 * `fraud_alert` operations item; the CUSTOMER confirms it was them or reports it
 * as fraud (recorded on the payload, never resolving the item); an OPERATOR then
 * acts:
 *  - APPROVE = confirm fraud → reverse the suspicious entry (if linked) + freeze
 *    the linked card (if any). `resolution: 'confirmed_fraud'`.
 *  - REJECT  = dismiss as legitimate (no money effect). `resolution: 'dismissed'`.
 *
 * MONEY DISCIPLINE: a confirmed fraud reverses via a ledger STATUS change, never
 * a balance edit. SIMULATION: no real fraud network or processor.
 */

export type FraudErrorCode = 'not_found' | 'forbidden' | 'invalid_state';

export class FraudError extends Error {
  readonly code: FraudErrorCode;
  constructor(code: FraudErrorCode, message: string) {
    super(message);
    this.name = 'FraudError';
    this.code = code;
  }
}

function fraudPayloadOf(row: Pick<OperationsRequest, 'payload'>): FraudPayload {
  let parsed: unknown = null;
  try {
    parsed = row.payload ? JSON.parse(row.payload) : null;
  } catch {
    parsed = null;
  }
  return asFraudPayload(parsed);
}

// ---- Customer reads + response ----------------------------------------------

/**
 * The PENDING fraud alerts that concern this customer (matched by subject email).
 * SIMULATION: scoping by the subject email the alert was raised against.
 */
export async function listFraudAlertsForUser(user: SessionUser): Promise<FraudAlertSummary[]> {
  const rows = await prisma.operationsRequest.findMany({
    where: { type: 'fraud_alert', status: 'pending', subjectEmail: user.email },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map((row) => {
    const payload = fraudPayloadOf(row);
    return {
      id: row.id,
      summary: row.summary,
      detail: row.detail,
      merchant: payload.merchant ?? null,
      amountMinor: typeof payload.amountMinor === 'number' ? payload.amountMinor : null,
      customerResponse: payload.customerResponse ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  });
}

export interface FraudResponseResult {
  request: OperationsRequestDTO;
  events: SimulatedEventDTO[];
}

/**
 * Record the customer's confirm/deny on a fraud alert. Writes the response into
 * the payload + an audit row + an INBOUND simulated event; it does NOT resolve
 * the item (an operator still decides). RBAC: the alert must be raised against
 * this customer (subject email).
 */
export async function respondToFraudAlert(
  user: SessionUser,
  requestId: string,
  response: FraudResponse,
  now: Date = new Date(),
): Promise<FraudResponseResult> {
  const request = await prisma.operationsRequest.findUnique({ where: { id: requestId } });
  if (!request || request.type !== 'fraud_alert') {
    throw new FraudError('not_found', 'That fraud alert was not found.');
  }
  if ((request.subjectEmail ?? '').toLowerCase() !== user.email.toLowerCase()) {
    throw new FraudError('forbidden', 'That fraud alert does not belong to you.');
  }
  if (request.status !== 'pending') {
    throw new FraudError('invalid_state', 'That fraud alert has already been resolved.');
  }

  const payload = fraudPayloadOf(request);
  const newPayload: FraudPayload = { ...payload, customerResponse: response };

  const { updated, events } = await prisma.$transaction(async (tx) => {
    const row = await tx.operationsRequest.update({
      where: { id: requestId },
      data: { payload: JSON.stringify(newPayload), updatedAt: now },
    });
    await writeAudit(tx, {
      actorId: user.id,
      actorRole: user.role,
      action: 'fraud_customer_response',
      entity: 'operations_request',
      entityId: requestId,
      reason: `Customer response: ${FRAUD_RESPONSE_LABELS[response]} (simulated)`,
      metadata: { response, actorName: user.displayName },
    });
    const event = await recordSimEvent(
      tx,
      {
        channel: 'sms',
        kind: 'fraud_response',
        status: 'delivered',
        direction: 'inbound',
        summary: `Customer responded: ${FRAUD_RESPONSE_LABELS[response]} (simulated)`,
        requestId,
      },
      now,
    );
    return { updated: row, events: [event] };
  });

  return { request: toOperationsRequestDTO(updated), events };
}

// ---- Operator resolution (from applyOperatorAction) -------------------------

export interface ResolvedFraud {
  request: OperationsRequest;
  events: SimulatedEventDTO[];
}

/**
 * Confirm fraud (operator APPROVE): reverse the suspicious entry (if linked) and
 * freeze the linked card (if any). Marks the request `resolution: 'confirmed_fraud'`
 * and `reversed` when an entry was reversed. Audited.
 */
export async function confirmFraud(
  tx: DbClient,
  request: OperationsRequest,
  actor: SessionUser,
  now: Date,
): Promise<ResolvedFraud> {
  const payload = fraudPayloadOf(request);

  let reversedCount = 0;
  if (payload.ledgerEntryId) {
    reversedCount = await reverseLedgerEntries(tx, [payload.ledgerEntryId]);
  }
  let cardFrozen = false;
  if (payload.cardId) {
    cardFrozen = await freezeCardById(tx, payload.cardId, now);
  }

  const newPayload: FraudPayload = { ...payload, resolution: 'confirmed_fraud', reversed: reversedCount > 0 };
  const updated = await tx.operationsRequest.update({
    where: { id: request.id },
    data: { payload: JSON.stringify(newPayload), updatedAt: now },
  });

  await writeAudit(tx, {
    actorId: actor.id,
    actorRole: actor.role,
    action: 'fraud_confirmed',
    entity: 'operations_request',
    entityId: request.id,
    reason: `Fraud confirmed${payload.amountMinor ? ` — reversed ${formatMinor(payload.amountMinor)}` : ''}${cardFrozen ? ' + card frozen' : ''} (simulated)`,
    metadata: { ...payload, reversedCount, cardFrozen, actorName: actor.displayName },
  });

  const event = await recordSimEvent(
    tx,
    {
      channel: 'sms',
      kind: 'fraud_confirmed',
      status: 'delivered',
      summary: `Fraud confirmed — card protected${reversedCount > 0 ? ' and charge reversed' : ''} (simulated)`,
      requestId: request.id,
    },
    now,
  );

  return { request: updated, events: [event] };
}

/** Dismiss a fraud alert as legitimate (operator REJECT): no money effect. Audited. */
export async function dismissFraud(
  tx: DbClient,
  request: OperationsRequest,
  actor: SessionUser,
  now: Date,
): Promise<ResolvedFraud> {
  const payload = fraudPayloadOf(request);
  const newPayload: FraudPayload = { ...payload, resolution: 'dismissed', reversed: false };
  const updated = await tx.operationsRequest.update({
    where: { id: request.id },
    data: { payload: JSON.stringify(newPayload), updatedAt: now },
  });

  await writeAudit(tx, {
    actorId: actor.id,
    actorRole: actor.role,
    action: 'fraud_dismissed',
    entity: 'operations_request',
    entityId: request.id,
    reason: 'Fraud alert dismissed as legitimate activity (simulated)',
    metadata: { ...payload, actorName: actor.displayName },
  });

  const event = await recordSimEvent(
    tx,
    {
      channel: 'email',
      kind: 'fraud_dismissed',
      status: 'sent',
      summary: 'Fraud alert dismissed — activity confirmed legitimate (simulated)',
      requestId: request.id,
    },
    now,
  );

  return { request: updated, events: [event] };
}

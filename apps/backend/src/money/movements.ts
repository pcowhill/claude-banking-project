import { randomBytes } from 'node:crypto';
import type { OperationsRequest } from '@prisma/client';
import {
  asMovementPayload,
  deriveBalances,
  formatMinor,
  MOVEMENT_KIND_LABELS,
  MOVEMENT_REFERENCE_PREFIX,
  movementLedgerOrigin,
  movementOpsType,
  type AccountSummary,
  type LedgerDirection,
  type LedgerStatus,
  type MovementPayload,
  type NormalizedExternalMovement,
  type NormalizedTransfer,
  type OperationsRequestDTO,
  type SessionUser,
  type SimulatedEventDTO,
} from '@simbank/shared';
import { prisma, type DbClient } from '../db';
import { writeAudit } from '../auth/audit';
import { getAccountRelationship } from '../auth/access';
import { toOperationsRequestDTO, toSimulatedEventDTO } from '../ops/requests';

/**
 * Money-movement domain service (v0.7.0) — the place where money actually moves,
 * always by appending ledger entries and never by editing a balance.
 *
 *  - `createTransfer` (IMMEDIATE): between a customer's OWN accounts. Posts BOTH
 *    legs (a `transfer` debit + credit) in one transaction, so the movement nets
 *    to zero. Validated for ownership + sufficient available funds.
 *  - `createExternalMovement` (REVIEWABLE): writes a PENDING ledger entry (a
 *    bank-originated `deposit` credit for inbound, a `payment` debit for outbound)
 *    and a linked `OperationsRequest`, so it waits in the ops queue. The pending
 *    debit immediately reserves the customer's available balance.
 *  - `postApprovedMovement` / `failMovement` run from the ops APPROVE / REJECT
 *    path (see `applyOperatorAction`): approve flips the pending entry to
 *    `posted`, reject flips it to `failed`. `reverseMovement` flips a settled
 *    entry to `reversed` (reason + audit).
 *
 * Balances stay DERIVED throughout; the system-wide settled total only ever moves
 * by a bank-originated credit (a posted deposit) or a posted debit (money leaving).
 */

export type MovementErrorCode =
  | 'not_found'
  | 'forbidden'
  | 'insufficient_funds'
  | 'inactive_account'
  | 'invalid'
  | 'not_a_movement'
  | 'nothing_to_reverse';

export class MovementError extends Error {
  readonly code: MovementErrorCode;
  constructor(code: MovementErrorCode, message: string) {
    super(message);
    this.name = 'MovementError';
    this.code = code;
  }
}

const MOVABLE_RELATIONSHIPS = new Set(['owner', 'joint', 'authorized']);

/** A short, human-friendly movement reference (SIMULATION code). */
export function generateMovementReference(): string {
  return `${MOVEMENT_REFERENCE_PREFIX}${randomBytes(3).toString('hex').toUpperCase()}`;
}

interface AccountForMovement {
  id: string;
  name: string;
  status: string;
  ledgerEntries: { amountMinor: number; direction: string; status: string }[];
}

function availableMinor(account: AccountForMovement): number {
  return deriveBalances(
    account.ledgerEntries.map((e) => ({
      amountMinor: e.amountMinor,
      direction: e.direction as LedgerDirection,
      status: e.status as LedgerStatus,
    })),
  ).availableMinor;
}

/** Re-derive an account's summary (used in the transfer response). */
async function summarize(db: DbClient, accountId: string, relationship: string): Promise<AccountSummary> {
  const account = await db.account.findUniqueOrThrow({
    where: { id: accountId },
    include: { ledgerEntries: true },
  });
  return {
    id: account.id,
    name: account.name,
    type: account.type as AccountSummary['type'],
    status: account.status as AccountSummary['status'],
    currency: account.currency,
    relationship: relationship as AccountSummary['relationship'],
    balances: deriveBalances(
      account.ledgerEntries.map((e) => ({
        amountMinor: e.amountMinor,
        direction: e.direction as LedgerDirection,
        status: e.status as LedgerStatus,
      })),
    ),
  };
}

/** Confirm the user may MOVE money on an account (non-viewer access to an active account). */
async function requireMovableAccount(
  userId: string,
  accountId: string,
): Promise<{ relationship: string; account: AccountForMovement }> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { id: true, name: true, status: true, ledgerEntries: { select: { amountMinor: true, direction: true, status: true } } },
  });
  if (!account) throw new MovementError('not_found', 'That account was not found.');
  const relationship = await getAccountRelationship(prisma, userId, accountId);
  if (!relationship || !MOVABLE_RELATIONSHIPS.has(relationship)) {
    throw new MovementError('forbidden', 'You cannot move money on that account.');
  }
  if (account.status !== 'active') {
    throw new MovementError('inactive_account', 'That account is not active.');
  }
  return { relationship, account };
}

/** Create a clearly-labelled SIMULATED event row and return its DTO. */
export async function recordSimEvent(
  db: DbClient,
  input: {
    channel: SimulatedEventDTO['channel'];
    kind: string;
    status: SimulatedEventDTO['status'];
    summary: string;
    detail?: string;
    direction?: SimulatedEventDTO['direction'];
    requestId: string | null;
  },
  now: Date,
): Promise<SimulatedEventDTO> {
  const created = await db.simulatedEvent.create({
    data: {
      channel: input.channel,
      direction: input.direction ?? 'outbound',
      kind: input.kind,
      status: input.status,
      summary: input.summary,
      detail: input.detail ?? 'SIMULATION — no real money network or provider was contacted.',
      requestId: input.requestId,
      createdAt: now,
    },
  });
  return toSimulatedEventDTO(created);
}

// ---- Internal transfer (immediate; both legs) -------------------------------

export interface TransferResult {
  amountMinor: number;
  accounts: AccountSummary[];
}

/**
 * Move money between two of the caller's own accounts. Posts a `transfer` DEBIT
 * on the source and a `transfer` CREDIT on the destination — same amount, same
 * instant — so the pair nets to zero. Atomic; audited; balances stay derived.
 */
export async function createTransfer(
  user: SessionUser,
  input: NormalizedTransfer,
  now: Date = new Date(),
): Promise<TransferResult> {
  const from = await requireMovableAccount(user.id, input.fromAccountId);
  const to = await requireMovableAccount(user.id, input.toAccountId);

  if (availableMinor(from.account) < input.amountMinor) {
    throw new MovementError('insufficient_funds', 'That transfer exceeds the available balance.');
  }

  const memoSuffix = input.memo ? ` — ${input.memo}` : '';

  await prisma.$transaction(async (tx) => {
    await tx.ledgerEntry.create({
      data: {
        accountId: from.account.id,
        amountMinor: input.amountMinor,
        direction: 'debit',
        status: 'posted',
        origin: 'transfer',
        description: `Transfer to ${to.account.name}${memoSuffix}`,
        postedAt: now,
        createdAt: now,
      },
    });
    await tx.ledgerEntry.create({
      data: {
        accountId: to.account.id,
        amountMinor: input.amountMinor,
        direction: 'credit',
        status: 'posted',
        origin: 'transfer',
        description: `Transfer from ${from.account.name}${memoSuffix}`,
        postedAt: now,
        createdAt: now,
      },
    });
    await writeAudit(tx, {
      actorId: user.id,
      actorRole: user.role,
      action: 'money_transfer',
      entity: 'account',
      entityId: from.account.id,
      reason: `Transfer ${formatMinor(input.amountMinor)} to ${to.account.name} (simulated)`,
      metadata: {
        amountMinor: input.amountMinor,
        fromAccountId: from.account.id,
        toAccountId: to.account.id,
        actorName: user.displayName,
      },
    });
  });

  return {
    amountMinor: input.amountMinor,
    accounts: [
      await summarize(prisma, from.account.id, from.relationship),
      await summarize(prisma, to.account.id, to.relationship),
    ],
  };
}

// ---- External reviewable movement (pending → operator review) ----------------

function describeMovement(input: NormalizedExternalMovement): { summary: string; description: string; detail: string } {
  const label = MOVEMENT_KIND_LABELS[input.kind];
  const amount = formatMinor(input.amountMinor);
  const who = input.counterparty ? ` — ${input.counterparty}` : '';
  const summary = `${label}${who} (${amount})`;
  const directionWord = input.direction === 'inbound' ? 'into' : 'from';
  const detail = `A ${label.toLowerCase()} of ${amount} ${directionWord} the customer's account is awaiting operator review (simulated). Approving posts it to the ledger; rejecting marks it failed.`;

  let description: string;
  switch (input.kind) {
    case 'mobile_check_deposit':
      description = `Mobile check deposit${who}`;
      break;
    case 'external_ach':
      description = input.direction === 'inbound' ? `ACH deposit from ${input.counterparty}` : `ACH payment to ${input.counterparty}`;
      break;
    case 'wire':
      description = `Wire transfer to ${input.counterparty}`;
      break;
    case 'bill_pay':
      description = `Bill payment — ${input.counterparty}`;
      break;
  }
  return { summary, description, detail };
}

export interface CreatedMovement {
  reference: string;
  request: OperationsRequestDTO;
  events: SimulatedEventDTO[];
}

/**
 * Queue a reviewable external movement: write the PENDING ledger entry (a
 * bank-originated `deposit` credit for inbound money, a `payment` debit for
 * outbound money) and a linked `OperationsRequest` whose payload carries the
 * `ledgerEntryIds`. An outbound movement first checks available funds (the
 * pending debit reserves them). Nothing posts until an operator approves.
 */
export async function createExternalMovement(
  user: SessionUser,
  input: NormalizedExternalMovement,
  now: Date = new Date(),
): Promise<CreatedMovement> {
  const { account } = await requireMovableAccount(user.id, input.accountId);

  const direction = input.direction;
  const ledgerDirection: LedgerDirection = direction === 'inbound' ? 'credit' : 'debit';
  if (direction === 'outbound' && availableMinor(account) < input.amountMinor) {
    throw new MovementError('insufficient_funds', 'That movement exceeds the available balance.');
  }

  const reference = generateMovementReference();
  const { summary, description, detail } = describeMovement(input);
  const origin = movementLedgerOrigin(input.kind, direction);

  const { request, events } = await prisma.$transaction(async (tx) => {
    // 1) The PENDING ledger entry — money does not move yet (pending credit is
    //    not counted into available; a pending debit reserves available).
    const entry = await tx.ledgerEntry.create({
      data: {
        accountId: account.id,
        amountMinor: input.amountMinor,
        direction: ledgerDirection,
        status: 'pending',
        origin,
        description,
        postedAt: null,
        createdAt: now,
      },
    });

    // 2) The linked ops request carrying the movement context + the soft link.
    const payload: MovementPayload = {
      kind: input.kind,
      amountMinor: input.amountMinor,
      direction,
      accountId: account.id,
      counterparty: input.counterparty,
      memo: input.memo,
      ledgerEntryIds: [entry.id],
      reference,
    };
    const created = await tx.operationsRequest.create({
      data: {
        type: movementOpsType(input.kind),
        status: 'pending',
        priority: input.kind === 'wire' ? 'high' : 'normal',
        summary,
        detail,
        subjectName: user.displayName,
        subjectEmail: user.email,
        payload: JSON.stringify(payload),
        createdAt: now,
        updatedAt: now,
      },
    });

    // 3) Intake audit row (so the request-detail history reads "created → …").
    await writeAudit(tx, {
      actorId: user.id,
      actorRole: user.role,
      action: 'ops_request_created',
      entity: 'operations_request',
      entityId: created.id,
      reason: `${summary} — submitted by ${user.displayName} (simulated)`,
      metadata: { reference, kind: input.kind, ledgerEntryId: entry.id },
    });

    // 4) A clearly-labelled "received — under review" simulated event.
    const event = await recordSimEvent(
      tx,
      {
        channel: 'email',
        kind: 'movement_received',
        status: 'sent',
        summary: `${MOVEMENT_KIND_LABELS[input.kind]} received — under review (simulated)`,
        detail: `Simulated confirmation that ${reference} (${formatMinor(input.amountMinor)}) was received and is awaiting operator review.`,
        requestId: created.id,
      },
      now,
    );

    return { request: created, events: [event] };
  });

  return { reference, request: toOperationsRequestDTO(request), events };
}

// ---- Generalized ledger reversal (shared by movements, disputes, fraud) ------

/**
 * Flip a set of SETTLED ledger entries (`posted` or `disputed`) to `reversed`,
 * removing their balance effect — NEVER editing a balance. The single, shared
 * primitive behind a reversed money movement (v0.7.0), an upheld dispute, and a
 * confirmed fraud (v0.8.0). Pure ledger mechanics: the CALLER writes the
 * domain-specific audit row (and any simulated event) so the trail stays
 * meaningful. Returns the number of entries actually reversed.
 */
export async function reverseLedgerEntries(tx: DbClient, entryIds: string[]): Promise<number> {
  if (entryIds.length === 0) return 0;
  const result = await tx.ledgerEntry.updateMany({
    where: { id: { in: entryIds }, status: { in: ['posted', 'disputed'] } },
    data: { status: 'reversed' },
  });
  return result.count;
}

// ---- Approve / reject / reverse (the ledger effects of an operator action) ---

/** Movement ops request types whose approval has a ledger effect. */
const MOVEMENT_REQUEST_TYPES = new Set(['deposit', 'ach', 'wire', 'bill_pay']);

function parseJson(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/** The movement payload of a request, or null if it is not a (linked) money movement. */
export function movementPayloadOf(row: Pick<OperationsRequest, 'type' | 'payload'>): MovementPayload | null {
  if (!MOVEMENT_REQUEST_TYPES.has(row.type)) return null;
  const payload = asMovementPayload(parseJson(row.payload));
  if (!payload || payload.ledgerEntryIds.length === 0) return null;
  return payload;
}

export interface MovementLedgerResult {
  amountMinor: number;
  kind: MovementPayload['kind'];
  events: SimulatedEventDTO[];
}

/**
 * Post an approved movement: flip its linked PENDING ledger entries to `posted`
 * (settling the money). Runs inside the ops approve transaction. No-ops (returns
 * null) for a request with no linked movement (a plain workflow approval).
 */
export async function postApprovedMovement(
  tx: DbClient,
  request: Pick<OperationsRequest, 'id' | 'type' | 'payload'>,
  actor: SessionUser,
  now: Date,
): Promise<MovementLedgerResult | null> {
  const payload = movementPayloadOf(request);
  if (!payload) return null;

  const result = await tx.ledgerEntry.updateMany({
    where: { id: { in: payload.ledgerEntryIds }, status: 'pending' },
    data: { status: 'posted', postedAt: now },
  });

  await writeAudit(tx, {
    actorId: actor.id,
    actorRole: actor.role,
    action: 'movement_posted',
    entity: 'ledger_entry',
    entityId: payload.ledgerEntryIds[0] ?? request.id,
    reason: `Posted ${MOVEMENT_KIND_LABELS[payload.kind]} ${formatMinor(payload.amountMinor)} (simulated)`,
    metadata: { ...payload, posted: result.count, actorName: actor.displayName },
  });

  const event = await recordSimEvent(
    tx,
    {
      channel: 'email',
      kind: 'movement_posted',
      status: 'sent',
      summary: `${MOVEMENT_KIND_LABELS[payload.kind]} posted — ${formatMinor(payload.amountMinor)} (simulated)`,
      requestId: request.id,
    },
    now,
  );

  return { amountMinor: payload.amountMinor, kind: payload.kind, events: [event] };
}

/**
 * Fail a rejected movement: flip its linked PENDING ledger entries to `failed`
 * (no balance effect; a reserved outbound is released). No-ops for a non-movement.
 */
export async function failMovement(
  tx: DbClient,
  request: Pick<OperationsRequest, 'id' | 'type' | 'payload'>,
  now: Date,
): Promise<SimulatedEventDTO | null> {
  const payload = movementPayloadOf(request);
  if (!payload) return null;

  await tx.ledgerEntry.updateMany({
    where: { id: { in: payload.ledgerEntryIds }, status: 'pending' },
    data: { status: 'failed' },
  });

  return recordSimEvent(
    tx,
    {
      channel: 'email',
      kind: 'movement_failed',
      status: 'sent',
      summary: `${MOVEMENT_KIND_LABELS[payload.kind]} failed — ${formatMinor(payload.amountMinor)} (simulated)`,
      requestId: request.id,
    },
    now,
  );
}

export interface ReversedMovement {
  request: OperationsRequestDTO;
  events: SimulatedEventDTO[];
}

/**
 * Reverse a settled movement: flip its linked POSTED ledger entries to
 * `reversed` (removing their balance effect — never editing a balance). Requires
 * a reason and writes an audit row, mirroring the admin-adjustment discipline.
 */
export async function reverseMovement(
  requestId: string,
  actor: SessionUser,
  reason: string,
  now: Date = new Date(),
): Promise<ReversedMovement> {
  const request = await prisma.operationsRequest.findUnique({ where: { id: requestId } });
  if (!request) throw new MovementError('not_found', 'That operations request does not exist.');

  const payload = movementPayloadOf(request);
  if (!payload) throw new MovementError('not_a_movement', 'That request is not a money movement.');

  const result = await prisma.$transaction(async (tx) => {
    const reversedCount = await reverseLedgerEntries(tx, payload.ledgerEntryIds);
    if (reversedCount === 0) {
      throw new MovementError('nothing_to_reverse', 'There is no posted movement to reverse.');
    }

    const newPayload: MovementPayload = { ...payload, reversed: true };
    const req = await tx.operationsRequest.update({
      where: { id: requestId },
      data: { payload: JSON.stringify(newPayload), updatedAt: now },
    });

    await writeAudit(tx, {
      actorId: actor.id,
      actorRole: actor.role,
      action: 'movement_reversed',
      entity: 'ledger_entry',
      entityId: payload.ledgerEntryIds[0] ?? requestId,
      reason,
      metadata: { ...payload, reversedCount, actorName: actor.displayName },
    });

    const event = await recordSimEvent(
      tx,
      {
        channel: 'email',
        kind: 'movement_reversed',
        status: 'sent',
        summary: `${MOVEMENT_KIND_LABELS[payload.kind]} reversed — ${formatMinor(payload.amountMinor)} (simulated)`,
        detail: `Simulated reversal: ${reason}`,
        requestId,
      },
      now,
    );

    return { request: req, events: [event] };
  });

  return { request: toOperationsRequestDTO(result.request), events: result.events };
}

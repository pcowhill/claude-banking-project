import { randomInt } from 'node:crypto';
import type { Card, CardTravelNotice } from '@prisma/client';
import {
  canAddTravelNotice,
  canFreezeCard,
  canReportCard,
  canUnfreezeCard,
  CARD_NETWORK_LABELS,
  CARD_TYPE_LABELS,
  cardStatusLabel,
  type CardDTO,
  type CardNetwork,
  type CardReportReason,
  type CardStatus,
  type CardType,
  type NormalizedIssueCard,
  type NormalizedTravelNotice,
  type SessionUser,
  type TravelNoticeDTO,
} from '@simbank/shared';
import { prisma, type DbClient } from '../db';
import { writeAudit } from '../auth/audit';
import { getAccountRelationship } from '../auth/access';

/**
 * Card lifecycle service (v0.8.0). Issue / freeze / unfreeze / report
 * lost-stolen (→ replacement) / travel notices.
 *
 * MONEY DISCIPLINE: NONE of this touches the ledger. Card SPEND is modelled
 * elsewhere as `card`-origin LedgerEntry rows; the lifecycle here is workflow +
 * audit only, so balances stay DERIVED and untouched. SIMULATION: `last4` is
 * fake; there is never a real PAN, network, or issuer.
 */

export type CardErrorCode = 'not_found' | 'forbidden' | 'inactive_account' | 'invalid_state';

export class CardError extends Error {
  readonly code: CardErrorCode;
  constructor(code: CardErrorCode, message: string) {
    super(message);
    this.name = 'CardError';
    this.code = code;
  }
}

/** Relationships allowed to hold + manage a card (not a read-only viewer). */
const CARD_RELATIONSHIPS = new Set(['owner', 'joint', 'authorized']);

// ---- Mappers ----------------------------------------------------------------

type CardWithRelations = Card & {
  account: { name: string };
  user: { displayName: string };
  travelNotices: CardTravelNotice[];
};

function toTravelNoticeDTO(row: CardTravelNotice): TravelNoticeDTO {
  return {
    id: row.id,
    cardId: row.cardId,
    destination: row.destination,
    startsOn: row.startsOn.toISOString(),
    endsOn: row.endsOn.toISOString(),
    note: row.note,
    status: row.status as TravelNoticeDTO['status'],
    createdAt: row.createdAt.toISOString(),
  };
}

export function toCardDTO(row: CardWithRelations): CardDTO {
  return {
    id: row.id,
    accountId: row.accountId,
    accountName: row.account.name,
    cardholderName: row.user.displayName,
    cardType: row.cardType as CardType,
    network: row.network as CardNetwork,
    last4: row.last4,
    expMonth: row.expMonth,
    expYear: row.expYear,
    status: row.status as CardStatus,
    replacesCardId: row.replacesCardId,
    travelNotices: row.travelNotices
      .filter((t) => t.status === 'active')
      .sort((a, b) => a.startsOn.getTime() - b.startsOn.getTime())
      .map(toTravelNoticeDTO),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const CARD_INCLUDE = {
  account: { select: { name: true } },
  user: { select: { displayName: true } },
  travelNotices: true,
} as const;

// ---- Helpers ----------------------------------------------------------------

/** A simulated last-four (always four digits, may start with 0). */
function simulatedLast4(): string {
  return String(randomInt(0, 10000)).padStart(4, '0');
}

/** A simulated expiry four years out from `now`. */
function simulatedExpiry(now: Date): { expMonth: number; expYear: number } {
  return { expMonth: now.getMonth() + 1, expYear: now.getFullYear() + 4 };
}

/** Confirm the user may MANAGE cards on an account (non-viewer access, active account). */
async function requireCardAccount(userId: string, accountId: string): Promise<void> {
  const account = await prisma.account.findUnique({ where: { id: accountId }, select: { status: true } });
  if (!account) throw new CardError('not_found', 'That account was not found.');
  const relationship = await getAccountRelationship(prisma, userId, accountId);
  if (!relationship || !CARD_RELATIONSHIPS.has(relationship)) {
    throw new CardError('forbidden', 'You cannot manage cards on that account.');
  }
  if (account.status !== 'active') {
    throw new CardError('inactive_account', 'That account is not active.');
  }
}

/** Load a card the user may manage (by access to its account), or throw. */
async function requireOwnedCard(userId: string, cardId: string): Promise<CardWithRelations> {
  const card = await prisma.card.findUnique({ where: { id: cardId }, include: CARD_INCLUDE });
  if (!card) throw new CardError('not_found', 'That card was not found.');
  const relationship = await getAccountRelationship(prisma, userId, card.accountId);
  if (!relationship || !CARD_RELATIONSHIPS.has(relationship)) {
    throw new CardError('forbidden', 'You cannot manage that card.');
  }
  return card;
}

// ---- Reads ------------------------------------------------------------------

/** Every card on accounts the user can access, newest-first. */
export async function listCards(user: SessionUser): Promise<CardDTO[]> {
  const grants = await prisma.accountAccess.findMany({ where: { userId: user.id }, select: { accountId: true } });
  const owned = await prisma.account.findMany({ where: { userId: user.id }, select: { id: true } });
  const accountIds = [...new Set([...grants.map((g) => g.accountId), ...owned.map((a) => a.id)])];

  const cards = await prisma.card.findMany({
    where: { accountId: { in: accountIds } },
    include: CARD_INCLUDE,
    orderBy: { createdAt: 'desc' },
  });
  return cards.map(toCardDTO);
}

/** Cards on a single account the user can access. */
export async function listAccountCards(user: SessionUser, accountId: string): Promise<CardDTO[]> {
  await requireCardAccount(user.id, accountId);
  const cards = await prisma.card.findMany({
    where: { accountId },
    include: CARD_INCLUDE,
    orderBy: { createdAt: 'desc' },
  });
  return cards.map(toCardDTO);
}

// ---- Mutations --------------------------------------------------------------

/** Issue a new (simulated) card on an account. Audited; writes no ledger. */
export async function issueCard(
  user: SessionUser,
  accountId: string,
  input: NormalizedIssueCard,
  now: Date = new Date(),
): Promise<CardDTO> {
  await requireCardAccount(user.id, accountId);
  const { expMonth, expYear } = simulatedExpiry(now);
  const last4 = simulatedLast4();

  const created = await prisma.card.create({
    data: {
      accountId,
      userId: user.id,
      cardType: input.cardType,
      network: input.network,
      last4,
      expMonth,
      expYear,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    },
    include: CARD_INCLUDE,
  });

  await writeAudit(prisma, {
    actorId: user.id,
    actorRole: user.role,
    action: 'card_issued',
    entity: 'card',
    entityId: created.id,
    reason: `Issued ${CARD_NETWORK_LABELS[input.network]} ${CARD_TYPE_LABELS[input.cardType].toLowerCase()} ••${last4} (simulated)`,
    metadata: { accountId, cardType: input.cardType, network: input.network, last4, actorName: user.displayName },
  });

  return toCardDTO(created);
}

async function setCardStatus(
  user: SessionUser,
  cardId: string,
  next: CardStatus,
  guard: (status: CardStatus) => boolean,
  guardMessage: string,
  auditAction: string,
  now: Date,
): Promise<CardDTO> {
  const card = await requireOwnedCard(user.id, cardId);
  if (!guard(card.status as CardStatus)) {
    throw new CardError('invalid_state', guardMessage);
  }
  const updated = await prisma.card.update({
    where: { id: cardId },
    data: { status: next, updatedAt: now },
    include: CARD_INCLUDE,
  });
  await writeAudit(prisma, {
    actorId: user.id,
    actorRole: user.role,
    action: auditAction,
    entity: 'card',
    entityId: cardId,
    reason: `Card ••${card.last4} → ${cardStatusLabel(next)} (simulated)`,
    metadata: { from: card.status, to: next, actorName: user.displayName },
  });
  return toCardDTO(updated);
}

export function freezeCard(user: SessionUser, cardId: string, now: Date = new Date()): Promise<CardDTO> {
  return setCardStatus(user, cardId, 'frozen', canFreezeCard, 'Only an active card can be frozen.', 'card_frozen', now);
}

export function unfreezeCard(user: SessionUser, cardId: string, now: Date = new Date()): Promise<CardDTO> {
  return setCardStatus(user, cardId, 'active', canUnfreezeCard, 'Only a frozen card can be unfrozen.', 'card_unfrozen', now);
}

export interface ReplaceCardResult {
  card: CardDTO; // the replacement
  replaced: CardDTO; // the old card, now terminal
}

/**
 * Report a card lost/stolen: mark it terminal (`lost`/`stolen`) and ISSUE A
 * REPLACEMENT with a new last-four (linked via `replacesCardId`). Atomic; audited.
 * Cancels the old card's active travel notices. Writes no ledger.
 */
export async function reportCard(
  user: SessionUser,
  cardId: string,
  reason: CardReportReason,
  now: Date = new Date(),
): Promise<ReplaceCardResult> {
  const card = await requireOwnedCard(user.id, cardId);
  if (!canReportCard(card.status as CardStatus)) {
    throw new CardError('invalid_state', 'That card can no longer be reported lost or stolen.');
  }
  const { expMonth, expYear } = simulatedExpiry(now);
  const last4 = simulatedLast4();

  const result = await prisma.$transaction(async (tx) => {
    const replaced = await tx.card.update({
      where: { id: cardId },
      data: { status: reason, updatedAt: now },
      include: CARD_INCLUDE,
    });
    await tx.cardTravelNotice.updateMany({
      where: { cardId, status: 'active' },
      data: { status: 'cancelled' },
    });
    const replacement = await tx.card.create({
      data: {
        accountId: card.accountId,
        userId: card.userId,
        cardType: card.cardType,
        network: card.network,
        last4,
        expMonth,
        expYear,
        status: 'active',
        replacesCardId: cardId,
        createdAt: now,
        updatedAt: now,
      },
      include: CARD_INCLUDE,
    });
    await writeAudit(tx, {
      actorId: user.id,
      actorRole: user.role,
      action: 'card_reported',
      entity: 'card',
      entityId: cardId,
      reason: `Card ••${card.last4} reported ${reason}; replacement ••${last4} issued (simulated)`,
      metadata: { reason, replacedCardId: cardId, replacementCardId: replacement.id, actorName: user.displayName },
    });
    return { replaced, replacement };
  });

  return { card: toCardDTO(result.replacement), replaced: toCardDTO(result.replaced) };
}

// ---- Travel notices ---------------------------------------------------------

export async function addTravelNotice(
  user: SessionUser,
  cardId: string,
  input: NormalizedTravelNotice,
  now: Date = new Date(),
): Promise<CardDTO> {
  const card = await requireOwnedCard(user.id, cardId);
  if (!canAddTravelNotice(card.status as CardStatus)) {
    throw new CardError('invalid_state', 'You can only add a travel notice to an active or frozen card.');
  }
  await prisma.cardTravelNotice.create({
    data: {
      cardId,
      destination: input.destination,
      startsOn: new Date(input.startsOn),
      endsOn: new Date(input.endsOn),
      note: input.note,
      status: 'active',
      createdAt: now,
    },
  });
  await writeAudit(prisma, {
    actorId: user.id,
    actorRole: user.role,
    action: 'card_travel_notice_added',
    entity: 'card',
    entityId: cardId,
    reason: `Travel notice for ••${card.last4}: ${input.destination} (${input.startsOn} → ${input.endsOn}) (simulated)`,
    metadata: { destination: input.destination, startsOn: input.startsOn, endsOn: input.endsOn, actorName: user.displayName },
  });
  const fresh = await prisma.card.findUniqueOrThrow({ where: { id: cardId }, include: CARD_INCLUDE });
  return toCardDTO(fresh);
}

export async function cancelTravelNotice(
  user: SessionUser,
  cardId: string,
  noticeId: string,
): Promise<CardDTO> {
  const card = await requireOwnedCard(user.id, cardId);
  const notice = await prisma.cardTravelNotice.findUnique({ where: { id: noticeId } });
  if (!notice || notice.cardId !== cardId) {
    throw new CardError('not_found', 'That travel notice was not found.');
  }
  await prisma.cardTravelNotice.update({ where: { id: noticeId }, data: { status: 'cancelled' } });
  await writeAudit(prisma, {
    actorId: user.id,
    actorRole: user.role,
    action: 'card_travel_notice_cancelled',
    entity: 'card',
    entityId: cardId,
    reason: `Travel notice cancelled for ••${card.last4} (simulated)`,
    metadata: { noticeId, actorName: user.displayName },
  });
  const fresh = await prisma.card.findUniqueOrThrow({ where: { id: cardId }, include: CARD_INCLUDE });
  return toCardDTO(fresh);
}

// Re-export for use elsewhere (the fraud flow freezes a card by id directly).
export { CARD_INCLUDE };

/**
 * Freeze a card by id WITHOUT an access check (used by the operator fraud flow,
 * which is already role-gated). No-ops if the card is missing or already terminal.
 */
export async function freezeCardById(tx: DbClient, cardId: string, now: Date): Promise<boolean> {
  const card = await tx.card.findUnique({ where: { id: cardId }, select: { status: true } });
  if (!card || !canFreezeCard(card.status as CardStatus)) return false;
  await tx.card.update({ where: { id: cardId }, data: { status: 'frozen', updatedAt: now } });
  return true;
}

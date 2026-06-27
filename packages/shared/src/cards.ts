/**
 * Card contracts (v0.8.0).
 *
 * Dependency-free and shared by the backend AND the customer app so the card
 * lifecycle shapes + their field-level VALIDATION are defined in exactly one
 * place. A card has a LIFECYCLE — issue, freeze/unfreeze, report lost/stolen
 * (which issues a replacement), and travel notices — but it MOVES NO MONEY: card
 * spend already exists as `card`-origin `LedgerEntry` rows, and the lifecycle
 * here is workflow + audit only, never a balance edit (money discipline intact).
 *
 * SIMULATION: a "card" is fake plastic — a masked last-four, a simulated network
 * and expiry. No real card network, PAN, or issuer is ever involved.
 */
import type { ValidationResult } from './onboarding';

// ---- Enums ------------------------------------------------------------------

/** Debit or credit (display + behaviour are the same in the simulation). */
export const CARD_TYPES = ['debit', 'credit'] as const;
export type CardType = (typeof CARD_TYPES)[number];

/** Card network (DISPLAY ONLY; never a real network — SIMULATION). */
export const CARD_NETWORKS = ['visa', 'mastercard'] as const;
export type CardNetwork = (typeof CARD_NETWORKS)[number];

/**
 * Card lifecycle status:
 *  - `active`    usable.
 *  - `frozen`    temporarily locked by the customer (reversible → active).
 *  - `lost`      reported lost — TERMINAL; a replacement is issued.
 *  - `stolen`    reported stolen — TERMINAL; a replacement is issued.
 *  - `replaced`  superseded by a replacement card — TERMINAL.
 *  - `cancelled` closed — TERMINAL.
 */
export const CARD_STATUSES = ['active', 'frozen', 'lost', 'stolen', 'replaced', 'cancelled'] as const;
export type CardStatus = (typeof CARD_STATUSES)[number];

/** A reported-card reason (lost vs stolen) — both trigger a replacement. */
export const CARD_REPORT_REASONS = ['lost', 'stolen'] as const;
export type CardReportReason = (typeof CARD_REPORT_REASONS)[number];

export const TRAVEL_NOTICE_STATUSES = ['active', 'cancelled'] as const;
export type TravelNoticeStatus = (typeof TRAVEL_NOTICE_STATUSES)[number];

// ---- Status helpers ---------------------------------------------------------

/** Terminal statuses accept no further lifecycle action (already lost/stolen/replaced/cancelled). */
export const TERMINAL_CARD_STATUSES: readonly CardStatus[] = ['lost', 'stolen', 'replaced', 'cancelled'];

export function isTerminalCardStatus(status: CardStatus): boolean {
  return TERMINAL_CARD_STATUSES.includes(status);
}

/** A card can be frozen only when active. */
export function canFreezeCard(status: CardStatus): boolean {
  return status === 'active';
}

/** A card can be unfrozen only when frozen. */
export function canUnfreezeCard(status: CardStatus): boolean {
  return status === 'frozen';
}

/** A card can be reported lost/stolen while it is still in service (active or frozen). */
export function canReportCard(status: CardStatus): boolean {
  return status === 'active' || status === 'frozen';
}

/** Travel notices may be added only to an in-service card. */
export function canAddTravelNotice(status: CardStatus): boolean {
  return status === 'active' || status === 'frozen';
}

// ---- Labels -----------------------------------------------------------------

export const CARD_TYPE_LABELS: Record<CardType, string> = {
  debit: 'Debit card',
  credit: 'Credit card',
};

export const CARD_NETWORK_LABELS: Record<CardNetwork, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
};

export const CARD_STATUS_LABELS: Record<CardStatus, string> = {
  active: 'Active',
  frozen: 'Frozen',
  lost: 'Lost',
  stolen: 'Stolen',
  replaced: 'Replaced',
  cancelled: 'Cancelled',
};

export const CARD_REPORT_REASON_LABELS: Record<CardReportReason, string> = {
  lost: 'Lost',
  stolen: 'Stolen',
};

export function cardTypeLabel(type: CardType): string {
  return CARD_TYPE_LABELS[type] ?? type;
}
export function cardNetworkLabel(network: CardNetwork): string {
  return CARD_NETWORK_LABELS[network] ?? network;
}
export function cardStatusLabel(status: CardStatus): string {
  return CARD_STATUS_LABELS[status] ?? status;
}

/** A masked card display string, e.g. `•••• •••• •••• 1234` (SIMULATION). */
export function maskedCardNumber(last4: string): string {
  return `•••• •••• •••• ${last4}`;
}

/** A 0-padded `MM/YY` expiry for display. */
export function formatCardExpiry(month: number, year: number): string {
  const mm = String(month).padStart(2, '0');
  const yy = String(year % 100).padStart(2, '0');
  return `${mm}/${yy}`;
}

export function isCardType(value: unknown): value is CardType {
  return typeof value === 'string' && (CARD_TYPES as readonly string[]).includes(value);
}
export function isCardNetwork(value: unknown): value is CardNetwork {
  return typeof value === 'string' && (CARD_NETWORKS as readonly string[]).includes(value);
}
export function isCardReportReason(value: unknown): value is CardReportReason {
  return typeof value === 'string' && (CARD_REPORT_REASONS as readonly string[]).includes(value);
}

// ---- DTOs -------------------------------------------------------------------

/** A card as exposed to the customer app (never any sensitive PAN — only last4). */
export interface CardDTO {
  id: string;
  accountId: string;
  accountName: string;
  cardholderName: string;
  cardType: CardType;
  network: CardNetwork;
  last4: string;
  expMonth: number;
  expYear: number;
  status: CardStatus;
  /** The id of the card this one replaced, if it is a replacement. */
  replacesCardId: string | null;
  travelNotices: TravelNoticeDTO[];
  createdAt: string;
  updatedAt: string;
}

export interface TravelNoticeDTO {
  id: string;
  cardId: string;
  destination: string;
  startsOn: string;
  endsOn: string;
  note: string | null;
  status: TravelNoticeStatus;
  createdAt: string;
}

// ---- Request DTOs + validation ----------------------------------------------

export const CARD_TEXT = { destinationMaxLength: 80, noteMaxLength: 200 } as const;

/** POST /api/accounts/:id/cards body. */
export interface IssueCardRequest {
  cardType: CardType | string;
  network?: CardNetwork | string;
}

export interface NormalizedIssueCard {
  cardType: CardType;
  network: CardNetwork;
}

export function validateIssueCard(
  input: Partial<IssueCardRequest>,
): ValidationResult<NormalizedIssueCard, 'cardType' | 'network'> {
  const errors: Partial<Record<'cardType' | 'network', string>> = {};

  if (!isCardType(input.cardType)) errors.cardType = 'Choose a debit or credit card.';
  // Network is optional; default to visa when not (validly) provided.
  let network: CardNetwork = 'visa';
  if (input.network !== undefined && input.network !== null && input.network !== '') {
    if (isCardNetwork(input.network)) network = input.network;
    else errors.network = 'Choose a valid card network.';
  }

  const ok = Object.keys(errors).length === 0;
  return {
    ok,
    errors,
    value: ok ? { cardType: input.cardType as CardType, network } : undefined,
  };
}

/** POST /api/cards/:id/report body. */
export interface ReportCardRequest {
  reason: CardReportReason | string;
}

export function validateReportCard(
  input: Partial<ReportCardRequest>,
): ValidationResult<{ reason: CardReportReason }, 'reason'> {
  const errors: Partial<Record<'reason', string>> = {};
  if (!isCardReportReason(input.reason)) errors.reason = 'Choose whether the card was lost or stolen.';
  const ok = Object.keys(errors).length === 0;
  return { ok, errors, value: ok ? { reason: input.reason as CardReportReason } : undefined };
}

/** POST /api/cards/:id/travel-notices body. */
export interface TravelNoticeRequest {
  destination: string;
  startsOn: string; // ISO date (YYYY-MM-DD)
  endsOn: string; // ISO date (YYYY-MM-DD)
  note?: string | null;
}

export interface NormalizedTravelNotice {
  destination: string;
  startsOn: string;
  endsOn: string;
  note: string | null;
}

export type TravelNoticeField = 'destination' | 'startsOn' | 'endsOn' | 'note';

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

export function validateTravelNotice(
  input: Partial<TravelNoticeRequest>,
): ValidationResult<NormalizedTravelNotice, TravelNoticeField> {
  const errors: Partial<Record<TravelNoticeField, string>> = {};

  const destination = typeof input.destination === 'string' ? input.destination.trim() : '';
  if (!destination) errors.destination = 'Enter a destination.';

  if (!isIsoDate(input.startsOn)) errors.startsOn = 'Enter a start date.';
  if (!isIsoDate(input.endsOn)) errors.endsOn = 'Enter an end date.';
  if (isIsoDate(input.startsOn) && isIsoDate(input.endsOn) && Date.parse(input.endsOn) < Date.parse(input.startsOn)) {
    errors.endsOn = 'The end date must be on or after the start date.';
  }

  const note = typeof input.note === 'string' && input.note.trim() ? input.note.trim().slice(0, CARD_TEXT.noteMaxLength) : null;

  const ok = Object.keys(errors).length === 0;
  return {
    ok,
    errors,
    value: ok
      ? {
          destination: destination.slice(0, CARD_TEXT.destinationMaxLength),
          startsOn: input.startsOn as string,
          endsOn: input.endsOn as string,
          note,
        }
      : undefined,
  };
}

// ---- Response DTOs ----------------------------------------------------------

export interface CardListResponse {
  cards: CardDTO[];
}

export interface CardResponse {
  card: CardDTO;
}

/** Reporting a card lost/stolen returns the now-terminal old card + its replacement. */
export interface ReplaceCardResponse {
  card: CardDTO; // the new (replacement) card
  replaced: CardDTO; // the old card, now lost/stolen
}

export interface TravelNoticeResponse {
  card: CardDTO;
}

/**
 * Fraud + dispute contracts (v0.8.0).
 *
 * Dependency-free and shared by the backend AND the customer app. Fraud alerts
 * and transaction disputes both ride the v0.5.0 operations queue (an
 * `OperationsRequest` of type `fraud_alert` / `dispute`) — their context lives in
 * the request `payload`, defined here so the customer form, the backend service,
 * and the operator console all agree on its shape.
 *
 * MONEY DISCIPLINE: a money EFFECT here is always a ledger STATUS change, never a
 * balance edit. Filing a dispute flags the entry `disputed` (still counts as
 * posted, shown flagged). Resolving may flip it `disputed`→`reversed` (uphold /
 * confirmed fraud — reason + audit) or `disputed`→`posted` (denied). Confirming
 * fraud may also reverse the suspicious entry and freeze the linked card.
 * SIMULATION: no real fraud network or card processor is ever contacted.
 */
import type { ValidationResult } from './onboarding';

// ---- Fraud ------------------------------------------------------------------

/** A customer's response to a fraud alert. */
export const FRAUD_RESPONSES = ['confirm_legit', 'report_fraud'] as const;
export type FraudResponse = (typeof FRAUD_RESPONSES)[number];

export const FRAUD_RESPONSE_LABELS: Record<FraudResponse, string> = {
  confirm_legit: 'Confirmed — it was me',
  report_fraud: 'Reported as fraud',
};

export function isFraudResponse(value: unknown): value is FraudResponse {
  return typeof value === 'string' && (FRAUD_RESPONSES as readonly string[]).includes(value);
}

/** POST /api/fraud-alerts/:id/respond body. */
export interface FraudResponseRequest {
  response: FraudResponse | string;
}

/**
 * Context stored on a `fraud_alert` request's `payload`. `ledgerEntryId` / `cardId`
 * are soft links the operator's APPROVE (confirm fraud) uses to reverse the
 * suspicious entry and freeze the card. `customerResponse` records the customer's
 * confirm/deny; `reversed` is set true once the entry has been reversed.
 */
export interface FraudPayload {
  merchant?: string | null;
  amountMinor?: number;
  ledgerEntryId?: string | null;
  cardId?: string | null;
  customerResponse?: FraudResponse | null;
  resolution?: 'confirmed_fraud' | 'dismissed' | null;
  reversed?: boolean;
}

/** Narrow an opaque parsed payload to a {@link FraudPayload}. Tolerant — all fields optional. */
export function asFraudPayload(payload: unknown): FraudPayload {
  if (!payload || typeof payload !== 'object') return {};
  const p = payload as Record<string, unknown>;
  return {
    merchant: typeof p.merchant === 'string' ? p.merchant : null,
    amountMinor: typeof p.amountMinor === 'number' ? p.amountMinor : undefined,
    ledgerEntryId: typeof p.ledgerEntryId === 'string' ? p.ledgerEntryId : null,
    cardId: typeof p.cardId === 'string' ? p.cardId : null,
    customerResponse: isFraudResponse(p.customerResponse) ? p.customerResponse : null,
    resolution:
      p.resolution === 'confirmed_fraud' || p.resolution === 'dismissed' ? p.resolution : null,
    reversed: p.reversed === true,
  };
}

// ---- Disputes ---------------------------------------------------------------

/** Why a customer disputes a posted transaction. */
export const DISPUTE_REASONS = [
  'not_recognized',
  'incorrect_amount',
  'duplicate_charge',
  'not_received',
  'other',
] as const;
export type DisputeReason = (typeof DISPUTE_REASONS)[number];

export const DISPUTE_REASON_LABELS: Record<DisputeReason, string> = {
  not_recognized: "I don't recognize this charge",
  incorrect_amount: 'The amount is incorrect',
  duplicate_charge: 'This is a duplicate charge',
  not_received: "I didn't receive the goods or service",
  other: 'Other',
};

export function isDisputeReason(value: unknown): value is DisputeReason {
  return typeof value === 'string' && (DISPUTE_REASONS as readonly string[]).includes(value);
}

export const DISPUTE_TEXT = { detailsMaxLength: 280 } as const;

/** POST /api/disputes body. */
export interface DisputeRequest {
  ledgerEntryId: string;
  reason: DisputeReason | string;
  details?: string | null;
}

export interface NormalizedDispute {
  ledgerEntryId: string;
  reason: DisputeReason;
  details: string | null;
}

export type DisputeField = 'ledgerEntryId' | 'reason' | 'details';

export function validateDispute(
  input: Partial<DisputeRequest>,
): ValidationResult<NormalizedDispute, DisputeField> {
  const errors: Partial<Record<DisputeField, string>> = {};

  const ledgerEntryId = typeof input.ledgerEntryId === 'string' ? input.ledgerEntryId.trim() : '';
  if (!ledgerEntryId) errors.ledgerEntryId = 'Choose the transaction to dispute.';

  if (!isDisputeReason(input.reason)) errors.reason = 'Choose a reason for the dispute.';

  const details =
    typeof input.details === 'string' && input.details.trim()
      ? input.details.trim().slice(0, DISPUTE_TEXT.detailsMaxLength)
      : null;

  const ok = Object.keys(errors).length === 0;
  return {
    ok,
    errors,
    value: ok ? { ledgerEntryId, reason: input.reason as DisputeReason, details } : undefined,
  };
}

/**
 * Context stored on a `dispute` request's `payload`. `ledgerEntryId` is the
 * disputed entry; resolving APPROVE reverses it (`disputed`→`reversed`) and sets
 * `reversed`/`resolution`, REJECT denies it (`disputed`→`posted`).
 */
export interface DisputePayload {
  ledgerEntryId: string;
  accountId: string;
  amountMinor: number;
  reason: DisputeReason;
  details?: string | null;
  description?: string | null;
  resolution?: 'upheld' | 'denied' | null;
  reversed?: boolean;
}

export function asDisputePayload(payload: unknown): DisputePayload | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;
  if (typeof p.ledgerEntryId !== 'string' || !p.ledgerEntryId) return null;
  return {
    ledgerEntryId: p.ledgerEntryId,
    accountId: typeof p.accountId === 'string' ? p.accountId : '',
    amountMinor: typeof p.amountMinor === 'number' ? p.amountMinor : 0,
    reason: isDisputeReason(p.reason) ? p.reason : 'other',
    details: typeof p.details === 'string' ? p.details : null,
    description: typeof p.description === 'string' ? p.description : null,
    resolution: p.resolution === 'upheld' || p.resolution === 'denied' ? p.resolution : null,
    reversed: p.reversed === true,
  };
}

// ---- Response DTOs ----------------------------------------------------------

/** GET /api/fraud-alerts success payload (the customer's pending fraud alerts). */
export interface FraudAlertSummary {
  id: string;
  summary: string;
  detail: string | null;
  merchant: string | null;
  amountMinor: number | null;
  customerResponse: FraudResponse | null;
  createdAt: string;
}

export interface FraudAlertListResponse {
  alerts: FraudAlertSummary[];
}

export interface DisputeResponse {
  ok: true;
  message: string;
  requestId: string;
}

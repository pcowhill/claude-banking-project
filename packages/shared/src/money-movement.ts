/**
 * Money-movement contracts (v0.7.0).
 *
 * Dependency-free and shared by the backend AND the customer app so the
 * transfer / deposit / bill-pay shapes and their field-level VALIDATION are
 * defined in exactly one place (the same validator runs in the customer form
 * and again on the server).
 *
 * MONEY DISCIPLINE — the whole point of this milestone:
 *  - Money moves ONLY by appending `LedgerEntry` rows; a balance is NEVER stored
 *    or edited (it stays DERIVED — see `ledger.ts`).
 *  - An **internal transfer** posts BOTH legs (a `transfer` debit + credit) so it
 *    NETS TO ZERO — moving funds creates nothing.
 *  - External value ENTERS only via a bank-originated, posted `deposit` credit and
 *    LEAVES only via a posted `payment` debit.
 *  - A reviewable movement is first written as a **pending** entry; an operator
 *    APPROVAL posts it (pending → posted), a REJECTION fails it (pending →
 *    `failed`), and a REVERSAL flips a settled entry to `reversed` (reason +
 *    audit). None of these ever edit a balance.
 *  - SIMULATION: no real ACH/wire/check/biller network is ever contacted.
 */
import type { ValidationResult } from './onboarding';
import type { LedgerOrigin } from './ledger';
import type { OpsRequestType } from './types';

// ---- Movement kinds & direction --------------------------------------------

/**
 * The ways money can move in the simulation. `internal_transfer` is IMMEDIATE
 * (between a customer's own accounts, posts both legs at once); every other kind
 * is REVIEWABLE — it queues a pending ledger entry that an operator must approve
 * before it posts.
 */
export const MOVEMENT_KINDS = [
  'internal_transfer',
  'external_ach',
  'wire',
  'mobile_check_deposit',
  'bill_pay',
] as const;
export type MovementKind = (typeof MOVEMENT_KINDS)[number];

/** Reviewable movement kinds = every kind except the immediate internal transfer. */
export type ReviewableMovementKind = Exclude<MovementKind, 'internal_transfer'>;

/** Direction of value relative to the customer's account: in = credit, out = debit. */
export const MOVEMENT_DIRECTIONS = ['inbound', 'outbound'] as const;
export type MovementDirection = (typeof MOVEMENT_DIRECTIONS)[number];

export function isMovementKind(value: unknown): value is MovementKind {
  return typeof value === 'string' && (MOVEMENT_KINDS as readonly string[]).includes(value);
}

/** True for kinds that require operator review before they post (all but internal transfer). */
export function isReviewableMovement(kind: MovementKind): kind is ReviewableMovementKind {
  return kind !== 'internal_transfer';
}

/**
 * The fixed direction of a kind, or `null` when the customer chooses it. A wire
 * and a bill payment always send money OUT; a mobile check deposit always brings
 * money IN; an external ACH can go either way.
 */
export const MOVEMENT_FIXED_DIRECTION: Record<MovementKind, MovementDirection | null> = {
  internal_transfer: null, // both legs; not a single direction
  external_ach: null, // customer chooses inbound/outbound
  wire: 'outbound',
  mobile_check_deposit: 'inbound',
  bill_pay: 'outbound',
};

/** Map a reviewable movement kind to the ops-queue request type it raises. */
export const REVIEWABLE_MOVEMENT_OPS_TYPE: Record<ReviewableMovementKind, OpsRequestType> = {
  external_ach: 'ach',
  wire: 'wire',
  mobile_check_deposit: 'deposit',
  bill_pay: 'bill_pay',
};

/** The ops request type a reviewable movement queues (throws for internal transfers). */
export function movementOpsType(kind: ReviewableMovementKind): OpsRequestType {
  return REVIEWABLE_MOVEMENT_OPS_TYPE[kind];
}

/**
 * The ledger origin for a movement leg: an internal transfer is `transfer`,
 * money coming IN is a bank-originated `deposit`, money going OUT is a `payment`.
 * This is what keeps the conservation invariants honest (only `transfer` legs
 * net to zero; inbound credits are bank-originated).
 */
export function movementLedgerOrigin(kind: MovementKind, direction: MovementDirection): LedgerOrigin {
  if (kind === 'internal_transfer') return 'transfer';
  return direction === 'inbound' ? 'deposit' : 'payment';
}

// ---- Policy bounds (SIMULATION) --------------------------------------------

/** Per-movement amount bounds, in integer minor units. */
export const MOVEMENT_LIMITS = {
  minMinor: 1, // $0.01
  maxMinor: 50_000_00, // $50,000.00 (simulated cap)
} as const;

/** Free-text length caps for movement fields. */
export const MOVEMENT_TEXT = { counterpartyMaxLength: 80, memoMaxLength: 140, reasonMaxLength: 280 } as const;

// ---- Labels -----------------------------------------------------------------

export const MOVEMENT_KIND_LABELS: Record<MovementKind, string> = {
  internal_transfer: 'Transfer between your accounts',
  external_ach: 'External ACH transfer',
  wire: 'Wire transfer',
  mobile_check_deposit: 'Mobile check deposit',
  bill_pay: 'Bill payment',
};

export const MOVEMENT_DIRECTION_LABELS: Record<MovementDirection, string> = {
  inbound: 'Incoming (credit)',
  outbound: 'Outgoing (debit)',
};

export function movementKindLabel(kind: MovementKind): string {
  return MOVEMENT_KIND_LABELS[kind] ?? kind;
}

// ---- Customer request DTOs --------------------------------------------------

/** POST /api/transfers body — an immediate transfer between the user's own accounts. */
export interface TransferRequest {
  fromAccountId: string;
  toAccountId: string;
  amountMinor: number;
  memo?: string | null;
}

export interface NormalizedTransfer {
  fromAccountId: string;
  toAccountId: string;
  amountMinor: number;
  memo: string | null;
}

export type TransferField = 'fromAccountId' | 'toAccountId' | 'amountMinor' | 'memo';

/** POST /api/movements body — a reviewable external movement (deposit/ACH/wire/bill pay). */
export interface ExternalMovementRequest {
  accountId: string;
  kind: MovementKind | string;
  amountMinor: number;
  /** Required for `external_ach`; ignored for fixed-direction kinds. */
  direction?: MovementDirection | string;
  /** Biller / payee / external account label (display only; SIMULATION). */
  counterparty?: string | null;
  memo?: string | null;
}

export interface NormalizedExternalMovement {
  accountId: string;
  kind: ReviewableMovementKind;
  amountMinor: number;
  direction: MovementDirection;
  counterparty: string | null;
  memo: string | null;
}

export type ExternalMovementField =
  | 'accountId'
  | 'kind'
  | 'amountMinor'
  | 'direction'
  | 'counterparty'
  | 'memo';

// ---- Validation -------------------------------------------------------------

function validAmount(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= MOVEMENT_LIMITS.minMinor &&
    value <= MOVEMENT_LIMITS.maxMinor
  );
}

const AMOUNT_ERROR = 'Enter an amount between $0.01 and $50,000 (simulated).';

function normalizeText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

/**
 * Validate + normalize an internal transfer. Pure: the customer form and the
 * backend both call this. It can only check the SHAPE (ids present + distinct,
 * amount in range, memo length) — ownership and sufficient-funds checks require
 * the database and live in the backend service.
 */
export function validateTransfer(
  input: Partial<TransferRequest>,
): ValidationResult<NormalizedTransfer, TransferField> {
  const errors: Partial<Record<TransferField, string>> = {};

  const fromAccountId = typeof input.fromAccountId === 'string' ? input.fromAccountId.trim() : '';
  if (!fromAccountId) errors.fromAccountId = 'Choose the account to transfer from.';

  const toAccountId = typeof input.toAccountId === 'string' ? input.toAccountId.trim() : '';
  if (!toAccountId) errors.toAccountId = 'Choose the account to transfer to.';
  else if (toAccountId === fromAccountId) errors.toAccountId = 'Choose two different accounts.';

  if (!validAmount(input.amountMinor)) errors.amountMinor = AMOUNT_ERROR;

  const memo = normalizeText(input.memo, MOVEMENT_TEXT.memoMaxLength);

  const ok = Object.keys(errors).length === 0;
  return {
    ok,
    errors,
    value: ok
      ? { fromAccountId, toAccountId, amountMinor: input.amountMinor as number, memo }
      : undefined,
  };
}

/**
 * Validate + normalize a reviewable external movement. Resolves the direction
 * (fixed per kind, or chosen for an external ACH) and requires a counterparty
 * for the kinds that need one (a bill payment needs a biller; a wire / external
 * ACH needs a destination or source label; a mobile check deposit does not).
 * Pure — reused by the customer form and the backend.
 */
export function validateExternalMovement(
  input: Partial<ExternalMovementRequest>,
): ValidationResult<NormalizedExternalMovement, ExternalMovementField> {
  const errors: Partial<Record<ExternalMovementField, string>> = {};

  const accountId = typeof input.accountId === 'string' ? input.accountId.trim() : '';
  if (!accountId) errors.accountId = 'Choose the account for this movement.';

  const kind = input.kind;
  const isReviewable = isMovementKind(kind) && isReviewableMovement(kind);
  if (!isReviewable) errors.kind = 'Choose a valid movement type.';

  if (!validAmount(input.amountMinor)) errors.amountMinor = AMOUNT_ERROR;

  // Resolve the direction: fixed kinds dictate it; an external ACH must declare one.
  let direction: MovementDirection | null = null;
  if (isReviewable) {
    const fixed = MOVEMENT_FIXED_DIRECTION[kind as MovementKind];
    if (fixed) {
      direction = fixed;
    } else if (input.direction === 'inbound' || input.direction === 'outbound') {
      direction = input.direction;
    } else {
      errors.direction = 'Choose whether the money comes in or goes out.';
    }
  }

  // Counterparty: required for everything except a mobile check deposit.
  const counterparty = normalizeText(input.counterparty, MOVEMENT_TEXT.counterpartyMaxLength);
  if (isReviewable && kind !== 'mobile_check_deposit' && !counterparty) {
    errors.counterparty =
      kind === 'bill_pay' ? 'Enter the biller’s name.' : 'Enter the other account or recipient.';
  }

  const memo = normalizeText(input.memo, MOVEMENT_TEXT.memoMaxLength);

  const ok = Object.keys(errors).length === 0;
  return {
    ok,
    errors,
    value:
      ok && isReviewable && direction
        ? {
            accountId,
            kind: kind as ReviewableMovementKind,
            amountMinor: input.amountMinor as number,
            direction,
            counterparty,
            memo,
          }
        : undefined,
  };
}

// ---- Stored movement context (OperationsRequest.payload JSON) ----------------

/**
 * The movement context persisted on the linked `OperationsRequest.payload`. The
 * `ledgerEntryIds` are the SOFT link the approval/rejection/reversal use to find
 * the pending ledger entry to post / fail / reverse (the request itself carries
 * no FK to the ledger). Never includes a balance — balances stay derived.
 */
export interface MovementPayload {
  kind: MovementKind;
  amountMinor: number;
  direction: MovementDirection;
  accountId: string;
  counterparty: string | null;
  memo: string | null;
  /** Ledger entries created for this movement (1 for an external movement). */
  ledgerEntryIds: string[];
  /** Set true once an operator has reversed a posted movement. */
  reversed?: boolean;
  reference?: string;
}

/** Narrow an opaque parsed payload to a {@link MovementPayload}, or null. */
export function asMovementPayload(payload: unknown): MovementPayload | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;
  if (!isMovementKind(p.kind)) return null;
  if (typeof p.amountMinor !== 'number') return null;
  if (p.direction !== 'inbound' && p.direction !== 'outbound') return null;
  const ledgerEntryIds = Array.isArray(p.ledgerEntryIds)
    ? p.ledgerEntryIds.filter((x): x is string => typeof x === 'string')
    : [];
  return {
    kind: p.kind,
    amountMinor: p.amountMinor,
    direction: p.direction,
    accountId: typeof p.accountId === 'string' ? p.accountId : '',
    counterparty: typeof p.counterparty === 'string' ? p.counterparty : null,
    memo: typeof p.memo === 'string' ? p.memo : null,
    ledgerEntryIds,
    reversed: p.reversed === true,
    reference: typeof p.reference === 'string' ? p.reference : undefined,
  };
}

// ---- Response DTOs ----------------------------------------------------------

/** POST /api/transfers success payload. Returns the two affected accounts with DERIVED balances. */
export interface TransferResponse {
  ok: true;
  message: string;
  amountMinor: number;
  /** The source + destination accounts, re-derived after both legs posted. */
  accounts: import('./auth').AccountSummary[];
}

/** POST /api/movements success payload — the movement is queued for operator review. */
export interface ExternalMovementResponse {
  reference: string;
  kind: MovementKind;
  status: 'pending_review';
  amountMinor: number;
  direction: MovementDirection;
  message: string;
}

/** POST /api/ops/movements/:requestId/reverse body. */
export interface ReverseMovementRequest {
  reason: string;
}

/** A short, human-friendly movement reference (SIMULATION code). */
export const MOVEMENT_REFERENCE_PREFIX = 'MOV-';

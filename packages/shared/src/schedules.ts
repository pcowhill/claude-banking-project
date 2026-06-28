/**
 * Recurring / scheduled-payment contracts (v0.9.0).
 *
 * Dependency-free and shared by the backend AND the customer app so the schedule
 * shape and its field-level VALIDATION live in one place (the same validator runs
 * in the customer form and again on the server).
 *
 * MONEY DISCIPLINE — a scheduled payment moves money ONLY when it FIRES, and only
 * by appending `LedgerEntry` rows (never by editing a balance). A schedule of kind
 * `internal_transfer` posts BOTH `transfer` legs at the due date (nets to zero); a
 * `bill_pay` writes a PENDING `payment` debit + a linked operations item an
 * operator approves — exactly the v0.7.0 money-movement flows, reused. The clock
 * (see `clock.ts`) decides when "now" has passed a due date. SIMULATION: no real
 * biller or money network is ever contacted.
 */
import type { ValidationResult } from './onboarding';
import { MOVEMENT_LIMITS, MOVEMENT_TEXT } from './money-movement';
import type { SimulationClockDTO } from './clock';

// ---- Kinds, frequencies & statuses -----------------------------------------

/** The two payment kinds a customer can schedule (a subset of the movement kinds). */
export const SCHEDULE_KINDS = ['internal_transfer', 'bill_pay'] as const;
export type ScheduleKind = (typeof SCHEDULE_KINDS)[number];

/** How often a schedule fires. `once` runs a single future-dated payment. */
export const SCHEDULE_FREQUENCIES = ['once', 'weekly', 'monthly'] as const;
export type ScheduleFrequency = (typeof SCHEDULE_FREQUENCIES)[number];

/** Lifecycle of a schedule. Terminal once `completed` (ran out) or `cancelled`. */
export const SCHEDULE_STATUSES = ['active', 'completed', 'cancelled'] as const;
export type ScheduleStatus = (typeof SCHEDULE_STATUSES)[number];

export function isScheduleKind(value: unknown): value is ScheduleKind {
  return typeof value === 'string' && (SCHEDULE_KINDS as readonly string[]).includes(value);
}
export function isScheduleFrequency(value: unknown): value is ScheduleFrequency {
  return typeof value === 'string' && (SCHEDULE_FREQUENCIES as readonly string[]).includes(value);
}
export function isScheduleStatus(value: unknown): value is ScheduleStatus {
  return typeof value === 'string' && (SCHEDULE_STATUSES as readonly string[]).includes(value);
}

/** True while a schedule can still fire / be cancelled. */
export function isActiveSchedule(status: ScheduleStatus): boolean {
  return status === 'active';
}

// ---- Policy bounds ----------------------------------------------------------

export const SCHEDULE_LIMITS = {
  /** Reuse the money-movement amount bounds so a scheduled payment can never
   * move more than a manual one. */
  minMinor: MOVEMENT_LIMITS.minMinor,
  maxMinor: MOVEMENT_LIMITS.maxMinor,
  /** How far ahead the FIRST run may be placed, in days. */
  maxFirstRunInDays: 365,
  /** Max occurrences a single schedule may fire in ONE clock advance (catch-up cap). */
  maxCatchUpRuns: 60,
} as const;

// ---- Labels -----------------------------------------------------------------

export const SCHEDULE_KIND_LABELS: Record<ScheduleKind, string> = {
  internal_transfer: 'Transfer between your accounts',
  bill_pay: 'Bill payment',
};
export const SCHEDULE_FREQUENCY_LABELS: Record<ScheduleFrequency, string> = {
  once: 'One time',
  weekly: 'Weekly',
  monthly: 'Monthly',
};
export const SCHEDULE_STATUS_LABELS: Record<ScheduleStatus, string> = {
  active: 'Active',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export function scheduleKindLabel(kind: ScheduleKind): string {
  return SCHEDULE_KIND_LABELS[kind] ?? kind;
}
export function scheduleFrequencyLabel(freq: ScheduleFrequency): string {
  return SCHEDULE_FREQUENCY_LABELS[freq] ?? freq;
}
export function scheduleStatusLabel(status: ScheduleStatus): string {
  return SCHEDULE_STATUS_LABELS[status] ?? status;
}

// ---- Cadence arithmetic (pure, UTC, calendar-safe) --------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Add one calendar month to a date, clamping the day-of-month so e.g. Jan 31 +
 * 1 month → Feb 28/29 (never rolling into March). Uses UTC fields so the result
 * is deterministic regardless of the host time zone.
 */
function addOneMonthClamped(date: Date): Date {
  const day = date.getUTCDate();
  const d = new Date(date.getTime());
  d.setUTCDate(1); // avoid overflow while moving the month
  d.setUTCMonth(d.getUTCMonth() + 1);
  const lastDayOfTargetMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDayOfTargetMonth));
  return d;
}

/**
 * The next occurrence after `from` for a frequency. For `once` there is no next
 * occurrence — the caller marks the schedule `completed` instead. Pure.
 */
export function addInterval(from: Date, frequency: ScheduleFrequency): Date | null {
  switch (frequency) {
    case 'once':
      return null;
    case 'weekly':
      return new Date(from.getTime() + 7 * DAY_MS);
    case 'monthly':
      return addOneMonthClamped(from);
  }
}

// ---- DTOs -------------------------------------------------------------------

/** A scheduled / recurring payment as exposed to clients. Never carries a balance. */
export interface ScheduleDTO {
  id: string;
  kind: ScheduleKind;
  amountMinor: number;
  fromAccountId: string;
  fromAccountName: string | null;
  /** Destination (own account) for an internal transfer; null for a bill pay. */
  toAccountId: string | null;
  toAccountName: string | null;
  /** Biller / payee label for a bill pay (display only; SIMULATION). */
  counterparty: string | null;
  memo: string | null;
  frequency: ScheduleFrequency;
  status: ScheduleStatus;
  /** Next due date (ISO); null once completed/cancelled. */
  nextRunAt: string | null;
  /** When it last fired (ISO), or null if it never has. */
  lastRunAt: string | null;
  /** How many times it has fired. */
  runCount: number;
  createdAt: string;
}

/** POST /api/schedules body. */
export interface CreateScheduleRequest {
  kind: ScheduleKind | string;
  fromAccountId: string;
  /** Required for `internal_transfer` (an own account, distinct from `from`). */
  toAccountId?: string | null;
  /** Required for `bill_pay` (the biller). */
  counterparty?: string | null;
  memo?: string | null;
  amountMinor: number;
  frequency: ScheduleFrequency | string;
  /** Days from "now" (simulation time) until the first run; 0 = due immediately. */
  firstRunInDays?: number;
}

export interface NormalizedCreateSchedule {
  kind: ScheduleKind;
  fromAccountId: string;
  toAccountId: string | null;
  counterparty: string | null;
  memo: string | null;
  amountMinor: number;
  frequency: ScheduleFrequency;
  firstRunInDays: number;
}

export type ScheduleField =
  | 'kind'
  | 'fromAccountId'
  | 'toAccountId'
  | 'counterparty'
  | 'memo'
  | 'amountMinor'
  | 'frequency'
  | 'firstRunInDays';

function validAmount(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= SCHEDULE_LIMITS.minMinor &&
    value <= SCHEDULE_LIMITS.maxMinor
  );
}

function normalizeText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

/**
 * Validate + normalize a new schedule. Pure (the customer form and the backend
 * both call this). It checks SHAPE only — account ownership and sufficient-funds
 * checks need the database and live in the backend service.
 */
export function validateCreateSchedule(
  input: Partial<CreateScheduleRequest>,
): ValidationResult<NormalizedCreateSchedule, ScheduleField> {
  const errors: Partial<Record<ScheduleField, string>> = {};

  const kind = input.kind;
  if (!isScheduleKind(kind)) errors.kind = 'Choose what to schedule.';

  const fromAccountId = typeof input.fromAccountId === 'string' ? input.fromAccountId.trim() : '';
  if (!fromAccountId) errors.fromAccountId = 'Choose the account to pay from.';

  // Destination rules depend on the kind.
  let toAccountId: string | null = null;
  let counterparty: string | null = null;
  if (kind === 'internal_transfer') {
    toAccountId = typeof input.toAccountId === 'string' ? input.toAccountId.trim() : '';
    if (!toAccountId) errors.toAccountId = 'Choose the account to transfer to.';
    else if (toAccountId === fromAccountId) errors.toAccountId = 'Choose two different accounts.';
  } else if (kind === 'bill_pay') {
    counterparty = normalizeText(input.counterparty, MOVEMENT_TEXT.counterpartyMaxLength);
    if (!counterparty) errors.counterparty = 'Enter the biller’s name.';
  }

  if (!validAmount(input.amountMinor)) {
    errors.amountMinor = 'Enter an amount between $0.01 and $50,000 (simulated).';
  }

  if (!isScheduleFrequency(input.frequency)) errors.frequency = 'Choose how often it should run.';

  // firstRunInDays defaults to 0 (due immediately); must be a whole number in range.
  let firstRunInDays = 0;
  if (input.firstRunInDays !== undefined && input.firstRunInDays !== null) {
    if (
      typeof input.firstRunInDays !== 'number' ||
      !Number.isInteger(input.firstRunInDays) ||
      input.firstRunInDays < 0 ||
      input.firstRunInDays > SCHEDULE_LIMITS.maxFirstRunInDays
    ) {
      errors.firstRunInDays = `Choose a first run between 0 and ${SCHEDULE_LIMITS.maxFirstRunInDays} days away.`;
    } else {
      firstRunInDays = input.firstRunInDays;
    }
  }

  const memo = normalizeText(input.memo, MOVEMENT_TEXT.memoMaxLength);

  const ok = Object.keys(errors).length === 0;
  return {
    ok,
    errors,
    value:
      ok && isScheduleKind(kind) && isScheduleFrequency(input.frequency)
        ? {
            kind,
            fromAccountId,
            toAccountId: kind === 'internal_transfer' ? toAccountId : null,
            counterparty: kind === 'bill_pay' ? counterparty : null,
            memo,
            amountMinor: input.amountMinor as number,
            frequency: input.frequency,
            firstRunInDays,
          }
        : undefined,
  };
}

// ---- Response DTOs ----------------------------------------------------------

export interface ScheduleListResponse {
  schedules: ScheduleDTO[];
}
export interface CreateScheduleResponse {
  schedule: ScheduleDTO;
  message: string;
}
export interface CancelScheduleResponse {
  schedule: ScheduleDTO;
}

/**
 * What ONE schedule did across a single clock advance (operator-facing). A
 * recurring schedule may fire several occurrences if the clock jumped far ahead.
 */
export interface ScheduleFireSummary {
  scheduleId: string;
  kind: ScheduleKind;
  /** Occurrences fired this advance. */
  runs: number;
  /** Total money SETTLED this advance (internal transfers post immediately). */
  postedMinor: number;
  /** Total money QUEUED for operator review this advance (bill pays). */
  queuedMinor: number;
  /** Occurrences skipped (e.g. insufficient funds) — recorded, never silently dropped. */
  skipped: number;
  /** The schedule's status after the advance. */
  status: ScheduleStatus;
}

/** POST /api/ops/clock/advance success payload — the new clock + what fired. */
export interface AdvanceClockResponse {
  clock: SimulationClockDTO;
  fired: ScheduleFireSummary[];
}

/**
 * Simulation-clock contracts (v0.9.0).
 *
 * Dependency-free and shared by the backend AND both frontend apps so the
 * controllable simulation clock — the authoritative "now" for money dating and
 * for scheduled-payment processing — has one definition.
 *
 * SIMULATION: time here is a fake, operator-controlled clock. It only ever moves
 * FORWARD (you cannot rewind the append-only ledger into an inconsistent state),
 * it is advanced by an operator/admin action (there is no wall-clock background
 * timer in v0.9.0), and every advance is audited. The `speed` column exists for a
 * possible future auto-advance and is informational for now.
 */
import type { ValidationResult } from './onboarding';

/** The simulation clock as exposed to clients. */
export interface SimulationClockDTO {
  /** The current SIMULATED time (ISO string). All money dating reads from this. */
  currentTime: string;
  /** Simulated speed multiplier (informational in v0.9.0; advancing is manual). */
  speed: number;
}

/** Bounds on a single forward advance (keeps the scheduler catch-up loop bounded). */
export const ADVANCE_CLOCK_LIMITS = {
  /** Must move strictly forward. */
  minMinutes: 1,
  /** At most one (leap) year per advance. */
  maxMinutes: 366 * 24 * 60,
} as const;

const MS_PER_MINUTE = 60_000;

/**
 * POST /api/ops/clock/advance body. The operator chooses any combination of
 * days/hours/minutes; the server sums them (each defaulting to 0) and validates a
 * single forward step.
 */
export interface AdvanceClockRequest {
  minutes?: number;
  hours?: number;
  days?: number;
}

export type AdvanceClockField = 'amount';

export interface NormalizedAdvance {
  /** Whole minutes to advance the clock forward. */
  minutes: number;
}

/** Total whole minutes requested (days*1440 + hours*60 + minutes), truncated. */
export function advanceRequestMinutes(input: Partial<AdvanceClockRequest>): number {
  const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : 0);
  return num(input.days) * 24 * 60 + num(input.hours) * 60 + num(input.minutes);
}

/**
 * Validate + normalize a forward-only advance within the per-advance bound. Pure:
 * the operator console and the backend both call this.
 */
export function validateAdvance(
  input: Partial<AdvanceClockRequest>,
): ValidationResult<NormalizedAdvance, AdvanceClockField> {
  const minutes = advanceRequestMinutes(input);
  const errors: Partial<Record<AdvanceClockField, string>> = {};
  if (!Number.isInteger(minutes) || minutes < ADVANCE_CLOCK_LIMITS.minMinutes) {
    errors.amount = 'Advance the clock forward by at least one minute (the simulation clock cannot rewind).';
  } else if (minutes > ADVANCE_CLOCK_LIMITS.maxMinutes) {
    errors.amount = 'You can advance the clock by at most one year at a time (simulated).';
  }
  const ok = Object.keys(errors).length === 0;
  return { ok, errors, value: ok ? { minutes } : undefined };
}

/** Apply a forward advance (whole minutes) to a date, returning the new Date. Pure. */
export function advanceBy(now: Date, minutes: number): Date {
  return new Date(now.getTime() + minutes * MS_PER_MINUTE);
}

/** GET /api/clock success payload (any authenticated user — display only). */
export interface ClockResponse {
  clock: SimulationClockDTO;
}

/**
 * Payload of the `sim:heartbeat` socket event. v0.9.0 adds `simulationTime` so a
 * live console can show the simulated date; it is OPTIONAL so older servers (and
 * the type's backward compatibility) are preserved.
 */
export interface SimHeartbeatPayload {
  serverTime: string;
  /** The current simulation-clock time (ISO), if the server is reporting it. */
  simulationTime?: string;
}

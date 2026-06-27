import { advanceBy, type SessionUser, type SimulationClockDTO } from '@simbank/shared';
import type { DbClient } from '../db';
import { writeAudit } from '../auth/audit';

/**
 * Simulation-clock service (v0.9.0).
 *
 * The clock is a single, operator-controlled "now" for the simulation. It is the
 * authoritative time for MONEY DATING (transfer legs, movement pending/posted,
 * scheduled fires — see ADR-0002) and for the scheduler. It only ever moves
 * FORWARD (the append-only ledger must never be back-dated into an inconsistent
 * state), it advances by an explicit operator/admin action, and every advance is
 * audited. There is no wall-clock background timer in v0.9.0.
 */

export type ClockErrorCode = 'invalid_advance';

export class ClockError extends Error {
  readonly code: ClockErrorCode;
  constructor(code: ClockErrorCode, message: string) {
    super(message);
    this.name = 'ClockError';
    this.code = code;
  }
}

const SINGLETON_ID = 'singleton';

interface ClockRow {
  currentTime: Date;
  speed: number;
}

/** Read the clock singleton, creating it (at `fallbackNow`) if it is missing. */
async function getClockRow(db: DbClient, fallbackNow: Date = new Date()): Promise<ClockRow> {
  const row = await db.simulationClock.upsert({
    where: { id: SINGLETON_ID },
    update: {},
    create: { id: SINGLETON_ID, currentTime: fallbackNow },
  });
  return { currentTime: row.currentTime, speed: row.speed };
}

function toClockDTO(row: ClockRow): SimulationClockDTO {
  return { currentTime: row.currentTime.toISOString(), speed: row.speed };
}

/** The current clock as a DTO (for `GET /api/clock` and the advance response). */
export async function getClockState(db: DbClient): Promise<SimulationClockDTO> {
  return toClockDTO(await getClockRow(db));
}

/**
 * The authoritative simulation "now". Every place that DATES ledger money reads
 * this instead of `new Date()` so advancing the clock moves money dating with it.
 */
export async function simulationNow(db: DbClient): Promise<Date> {
  const row = await getClockRow(db);
  return row.currentTime;
}

/**
 * Advance the clock FORWARD by `minutes` (must be a positive integer). Audited.
 * Returns the new clock DTO plus the `from`/`to` instants so the caller can run
 * the scheduler over the `(from, to]` window that just elapsed.
 */
export async function advanceClock(
  db: DbClient,
  minutes: number,
  actor: SessionUser,
): Promise<{ clock: SimulationClockDTO; from: Date; to: Date }> {
  if (!Number.isInteger(minutes) || minutes <= 0) {
    throw new ClockError('invalid_advance', 'The simulation clock can only move forward.');
  }
  const current = await getClockRow(db);
  const to = advanceBy(current.currentTime, minutes);

  const updated = await db.simulationClock.update({
    where: { id: SINGLETON_ID },
    data: { currentTime: to },
  });

  await writeAudit(db, {
    actorId: actor.id,
    actorRole: actor.role,
    action: 'clock_advanced',
    entity: 'simulation_clock',
    entityId: SINGLETON_ID,
    reason: `Advanced the simulation clock by ${minutes} minute(s) to ${to.toISOString()} (simulated)`,
    metadata: {
      fromISO: current.currentTime.toISOString(),
      toISO: to.toISOString(),
      minutes,
      actorName: actor.displayName,
    },
  });

  return {
    clock: toClockDTO({ currentTime: updated.currentTime, speed: updated.speed }),
    from: current.currentTime,
    to,
  };
}

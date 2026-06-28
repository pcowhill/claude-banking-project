import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  formatMinor,
  scheduleFrequencyLabel,
  scheduleKindLabel,
  validateAdvance,
  type AdvanceClockRequest,
  type ScheduleDTO,
  type ScheduleFireSummary,
} from '@simbank/shared';
import { ApiError } from '../lib/api';
import { advanceClock, fetchClock, fetchSchedules } from '../lib/opsApi';
import { useOpsData } from '../lib/ops-data-context';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { ScheduleStatusBadge } from '../components/badges';

/**
 * Simulation clock console (v0.9.0). An operator can watch the live SIMULATED
 * date, step it forward (firing every scheduled payment that becomes due), and
 * review every customer's payment schedules.
 *
 * SIMULATION: the clock is a fake, operator-controlled "now" — it only moves
 * forward (the append-only ledger cannot be rewound) and there is no wall-clock
 * background timer. Each fire is a real SIMULATED ledger entry: internal
 * transfers POST immediately; bill pays QUEUE a review in the request queues.
 */

/** Render an ISO instant as a readable absolute date + time (the simulated clock). */
function formatSimDate(iso: string | null): string {
  if (!iso) return '—';
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return '—';
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(new Date(ms));
}

/** Shorter date-only label for schedule run dates. */
function formatRunDate(iso: string | null): string {
  if (!iso) return '—';
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return '—';
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(ms),
  );
}

/** The fast-forward presets. `30 days` stands in for "one month". */
const PRESETS: { label: string; body: AdvanceClockRequest }[] = [
  { label: '+1 hour', body: { hours: 1 } },
  { label: '+1 day', body: { days: 1 } },
  { label: '+1 week', body: { days: 7 } },
  { label: '+1 month', body: { days: 30 } },
];

export function SimulationClock() {
  // Prefer the live clock from the shared data context (kept fresh by the socket
  // heartbeat ~every 10s). We mirror it locally so an advance can show the new
  // time immediately, before the next heartbeat echoes it back.
  const { simulationTime, refresh } = useOpsData();
  const [displayTime, setDisplayTime] = useState<string | null>(simulationTime);

  // Keep the local mirror in step with the heartbeat-driven context value.
  useEffect(() => {
    if (simulationTime) setDisplayTime(simulationTime);
  }, [simulationTime]);

  // Fallback: if the context hasn't reported a time yet (e.g. heartbeat not seen
  // and the one-shot fetch is still in flight), fetch the clock once on mount.
  useEffect(() => {
    if (simulationTime) return;
    let cancelled = false;
    fetchClock()
      .then(({ clock }) => {
        if (!cancelled) setDisplayTime((prev) => prev ?? clock.currentTime);
      })
      .catch(() => {
        /* the heartbeat will fill it in; surfaced as "—" until then */
      });
    return () => {
      cancelled = true;
    };
  }, [simulationTime]);

  // ---- Fast-forward state ---------------------------------------------------
  const [advancing, setAdvancing] = useState(false);
  const [advanceError, setAdvanceError] = useState<string | null>(null);
  const [lastFired, setLastFired] = useState<ScheduleFireSummary[] | null>(null);
  // Custom advance form (days + hours).
  const [days, setDays] = useState('');
  const [hours, setHours] = useState('');

  // ---- Schedules list state -------------------------------------------------
  const [schedules, setSchedules] = useState<ScheduleDTO[] | null>(null);
  const [schedulesError, setSchedulesError] = useState<string | null>(null);
  const [schedulesLoading, setSchedulesLoading] = useState(true);

  const loadSchedules = useCallback(async () => {
    setSchedulesLoading(true);
    try {
      const { schedules: list } = await fetchSchedules();
      setSchedules(list);
      setSchedulesError(null);
    } catch (err) {
      setSchedulesError(
        err instanceof ApiError ? err.message : 'Could not load customer payment schedules.',
      );
    } finally {
      setSchedulesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSchedules();
  }, [loadSchedules]);

  /**
   * Step the clock forward by `body`. Validates client-side first, then on
   * success updates the displayed time, shows what fired, refreshes the live
   * queue (so newly-queued bill-pay reviews appear) and re-fetches schedules.
   */
  const runAdvance = useCallback(
    async (body: AdvanceClockRequest) => {
      const check = validateAdvance(body);
      if (!check.ok) {
        setAdvanceError(check.errors.amount ?? 'Enter a valid forward amount.');
        return;
      }
      setAdvancing(true);
      setAdvanceError(null);
      try {
        const { clock, fired } = await advanceClock(body);
        setDisplayTime(clock.currentTime);
        setLastFired(fired);
        // Pull the queue + schedules forward so the fired reviews / run counts show.
        await Promise.all([refresh(), loadSchedules()]);
      } catch (err) {
        setAdvanceError(
          err instanceof ApiError ? err.message : 'Could not advance the simulation clock.',
        );
      } finally {
        setAdvancing(false);
      }
    },
    [loadSchedules, refresh],
  );

  /** Submit the custom days+hours form. */
  function submitCustom(event: React.FormEvent) {
    event.preventDefault();
    const body: AdvanceClockRequest = {
      days: days ? Number(days) : 0,
      hours: hours ? Number(hours) : 0,
    };
    void runAdvance(body).then(() => {
      // Clear the inputs only when the values were accepted (no lingering error).
      setDays('');
      setHours('');
    });
  }

  // Live, client-side validity of the custom form for the submit button + hint.
  const customCheck = useMemo(
    () => validateAdvance({ days: days ? Number(days) : 0, hours: hours ? Number(hours) : 0 }),
    [days, hours],
  );
  const customDirty = days !== '' || hours !== '';

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-white">Simulation clock</h1>
        <p className="mt-1 text-sm text-slate-400">
          Drive the platform&rsquo;s <span className="font-semibold text-slate-200">simulated</span>{' '}
          date forward. This is a fake, operator-controlled clock&nbsp;&mdash; not the wall clock.
          Advancing it fires every scheduled payment that has come due.
        </p>
      </div>

      {/* Current simulated date */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
          Current simulated date
        </h2>
        <Card className="mt-3">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-slate-500">Simulated now</div>
              <div className="mt-1 text-2xl font-bold tabular-nums text-white">
                {formatSimDate(displayTime)}
              </div>
            </div>
            <p className="max-w-md text-xs text-slate-500">
              Updates live from the simulation heartbeat. All money dating in the simulation reads
              from this clock, not from your device&rsquo;s time.
            </p>
          </div>
        </Card>
      </section>

      {/* Fast-forward controls */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
          Fast-forward
        </h2>
        <Card className="mt-3 space-y-4">
          <div>
            <div className="text-xs font-medium text-slate-400">Jump ahead</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {PRESETS.map((preset) => (
                <Button
                  key={preset.label}
                  variant="primary"
                  size="sm"
                  disabled={advancing}
                  onClick={() => void runAdvance(preset.body)}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Custom days + hours */}
          <form className="flex flex-wrap items-end gap-3" onSubmit={submitCustom}>
            <div className="flex flex-col gap-1">
              <label htmlFor="ff-days" className="text-xs font-medium text-slate-400">
                Days
              </label>
              <input
                id="ff-days"
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={days}
                disabled={advancing}
                onChange={(e) => setDays(e.target.value)}
                className="h-9 w-24 rounded-md border border-white/10 bg-white/5 px-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal disabled:opacity-40"
                placeholder="0"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="ff-hours" className="text-xs font-medium text-slate-400">
                Hours
              </label>
              <input
                id="ff-hours"
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={hours}
                disabled={advancing}
                onChange={(e) => setHours(e.target.value)}
                className="h-9 w-24 rounded-md border border-white/10 bg-white/5 px-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal disabled:opacity-40"
                placeholder="0"
              />
            </div>
            <Button
              type="submit"
              variant="ghost"
              size="md"
              disabled={advancing || !customCheck.ok}
            >
              {advancing ? 'Advancing…' : 'Advance clock'}
            </Button>
            {customDirty && !customCheck.ok && (
              <span className="text-xs text-rose-300/90">{customCheck.errors.amount}</span>
            )}
          </form>

          <p className="text-xs text-slate-500">
            The clock only moves forward, by at most one year per step. Every fire is a real{' '}
            <span className="font-semibold text-slate-300">simulated</span> ledger entry: internal
            transfers post immediately; bill pays queue a review in the{' '}
            <span className="font-semibold text-slate-300">request queues</span>.
          </p>

          {advanceError && <p className="text-sm text-rose-300/90">{advanceError}</p>}

          {/* Summary of the most recent advance */}
          {lastFired && (
            <div className="rounded-lg border border-white/10 bg-black/20 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Last advance
              </div>
              {lastFired.length === 0 ? (
                <p className="mt-2 text-sm text-slate-400">
                  Nothing was due&nbsp;&mdash; no schedules fired.
                </p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {lastFired.map((summary) => (
                    <li
                      key={summary.scheduleId}
                      className="flex flex-wrap items-center justify-between gap-2 text-sm"
                    >
                      <span className="text-slate-200">
                        {scheduleKindLabel(summary.kind)}
                        <span className="ml-2 text-xs text-slate-500">
                          {summary.runs} {summary.runs === 1 ? 'run' : 'runs'}
                        </span>
                      </span>
                      <span className="flex flex-wrap items-center gap-3 text-xs tabular-nums text-slate-400">
                        <span className="text-emerald-200">
                          Posted {formatMinor(summary.postedMinor)}
                        </span>
                        <span className="text-amber-200">
                          Queued {formatMinor(summary.queuedMinor)}
                        </span>
                        {summary.skipped > 0 && (
                          <span className="text-rose-200">Skipped {summary.skipped}</span>
                        )}
                        <ScheduleStatusBadge status={summary.status} />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </Card>
      </section>

      {/* All customer schedules */}
      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
            Customer payment schedules
          </h2>
          <button
            type="button"
            onClick={() => void loadSchedules()}
            disabled={schedulesLoading}
            className="text-xs font-semibold text-brand-teal hover:underline disabled:opacity-40"
          >
            Refresh
          </button>
        </div>
        <Card className="mt-3">
          {schedulesLoading && schedules === null ? (
            <p className="text-sm text-slate-500">Loading schedules…</p>
          ) : schedulesError ? (
            <p className="text-sm text-rose-300/90">{schedulesError}</p>
          ) : !schedules || schedules.length === 0 ? (
            <p className="text-sm text-slate-500">
              No customer has scheduled a payment yet (simulated).
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-left text-[11px] uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-3 font-medium">Type</th>
                    <th className="py-2 pr-3 font-medium">Amount</th>
                    <th className="py-2 pr-3 font-medium">From → To</th>
                    <th className="py-2 pr-3 font-medium">Frequency</th>
                    <th className="py-2 pr-3 font-medium">Status</th>
                    <th className="py-2 pr-3 font-medium">Next run</th>
                    <th className="py-2 pr-0 text-right font-medium">Runs</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {schedules.map((schedule) => {
                    const destination =
                      schedule.kind === 'bill_pay'
                        ? (schedule.counterparty ?? 'Biller')
                        : (schedule.toAccountName ?? 'Account');
                    const source = schedule.fromAccountName ?? 'Account';
                    return (
                      <tr key={schedule.id} className="text-slate-200">
                        <td className="py-2 pr-3">{scheduleKindLabel(schedule.kind)}</td>
                        <td className="py-2 pr-3 tabular-nums">
                          {formatMinor(schedule.amountMinor)}
                        </td>
                        <td className="py-2 pr-3 text-slate-300">
                          <span className="text-slate-400">{source}</span>
                          <span className="mx-1 text-slate-600">→</span>
                          <span>{destination}</span>
                        </td>
                        <td className="py-2 pr-3 text-slate-400">
                          {scheduleFrequencyLabel(schedule.frequency)}
                        </td>
                        <td className="py-2 pr-3">
                          <ScheduleStatusBadge status={schedule.status} />
                        </td>
                        <td className="py-2 pr-3 text-slate-400">
                          {formatRunDate(schedule.nextRunAt)}
                        </td>
                        <td className="py-2 pr-0 text-right tabular-nums text-slate-300">
                          {schedule.runCount}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </section>

      <p className="text-xs text-slate-600">
        Simulation only&nbsp;&mdash; no real biller, payment network, or clock is ever contacted. The
        simulated date and every fired payment exist solely in this local demo.
      </p>
    </div>
  );
}

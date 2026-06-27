import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  formatMinor,
  isActiveSchedule,
  scheduleFrequencyLabel,
  scheduleKindLabel,
  scheduleStatusLabel,
  toMinor,
  validateCreateSchedule,
  SCHEDULE_FREQUENCIES,
  type AccountSummary,
  type ScheduleDTO,
  type ScheduleFrequency,
  type ScheduleKind,
  type ScheduleStatus,
  type SimulationClockDTO,
} from '@simbank/shared';
import { Card, CardDescription, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { BackendStatusPill } from '../components/BackendStatusPill';
import { cn } from '../lib/cn';
import { accountTypeLabel } from '../lib/account-display';
import { fetchAccounts } from '../lib/auth';
import { cancelSchedule, createSchedule, fetchClock, fetchSchedules } from '../lib/schedules';

/**
 * "Scheduled payments" — the customer recurring/scheduled-payment surface
 * (v0.9.0). One page that:
 *
 *  - shows the current SIMULATED date (GET /api/clock) so the customer knows
 *    what "now" the scheduler reads;
 *  - creates a schedule (POST /api/schedules) — a transfer between the user's
 *    own accounts, or a bill payment to a biller;
 *  - lists the caller's own schedules (GET /api/schedules) with a status badge,
 *    next-run date, and run history;
 *  - cancels an active schedule (POST /api/schedules/:id/cancel).
 *
 * The shared `validateCreateSchedule` drives inline per-field errors BEFORE
 * submit so the client and server agree; the server's `fields` map is merged in
 * afterwards. Loading / empty / offline states keep the page honest when the
 * backend is down.
 *
 * SIMULATION: no real money, billers, or payment networks are ever involved. A
 * scheduled payment fires ONLY when an operator advances the simulation clock.
 */

// ---- Shared async state -----------------------------------------------------

interface AsyncData<T> {
  loading: boolean;
  /** null = request failed (offline / unauthorized). */
  data: T | null;
}

/** Only accounts that can move money (active, not view-only). */
function movableAccounts(accounts: AccountSummary[]): AccountSummary[] {
  return accounts.filter((a) => a.status === 'active' && a.relationship !== 'viewer');
}

/** A one-line "Name · Type — Available $X" description for a selector option. */
function accountOptionLabel(account: AccountSummary): string {
  return `${account.name} · ${accountTypeLabel(account.type)} — ${formatMinor(
    account.balances.availableMinor,
    account.currency,
  )} available`;
}

/** Format an ISO timestamp as a date, tolerating a bad/empty value. */
function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Format the simulation clock as a long, human date+time. */
function formatSimulatedDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short' });
}

const inputClasses =
  'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal disabled:cursor-not-allowed disabled:bg-slate-50';

// ---- Small form primitives (mirroring MoveMoney) ----------------------------

/** A labeled field wrapper with an optional inline error message. */
function Field({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1 text-xs font-medium text-rose-600">
          {error}
        </p>
      )}
    </div>
  );
}

/** A native account `<select>` over the user's movable accounts. */
function AccountSelect({
  id,
  label,
  value,
  accounts,
  exclude,
  placeholder,
  error,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  accounts: AccountSummary[];
  exclude?: string;
  placeholder: string;
  error?: string;
  disabled?: boolean;
  onChange: (id: string) => void;
}) {
  const options = exclude ? accounts.filter((a) => a.id !== exclude) : accounts;
  return (
    <Field id={id} label={label} error={error}>
      <select
        id={id}
        value={value}
        disabled={disabled}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(e) => onChange(e.target.value)}
        className={inputClasses}
      >
        <option value="">{placeholder}</option>
        {options.map((a) => (
          <option key={a.id} value={a.id}>
            {accountOptionLabel(a)}
          </option>
        ))}
      </select>
    </Field>
  );
}

/**
 * A dollar amount input. Holds the raw string the user typed (so an empty / mid-
 * edit value doesn't snap), and reports the parsed minor-unit value to the parent
 * via `toMinor` (which already rounds, guarding against float drift).
 */
function AmountInput({
  id,
  value,
  error,
  disabled,
  onChange,
}: {
  id: string;
  value: string;
  error?: string;
  disabled?: boolean;
  onChange: (raw: string) => void;
}) {
  return (
    <Field id={id} label="Amount (USD)" error={error} hint="Simulated cap: $0.01 – $50,000.">
      <div className="relative mt-1">
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-slate-400">
          $
        </span>
        <input
          id={id}
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0.01"
          max="50000"
          value={value}
          disabled={disabled}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0.00"
          className={cn(inputClasses, 'mt-0 pl-7')}
        />
      </div>
    </Field>
  );
}

/** A counterparty / memo text input. */
function TextInput({
  id,
  label,
  value,
  placeholder,
  maxLength,
  error,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  placeholder?: string;
  maxLength?: number;
  error?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <Field id={id} label={label} error={error}>
      <input
        id={id}
        type="text"
        value={value}
        maxLength={maxLength}
        disabled={disabled}
        autoComplete="off"
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={inputClasses}
      />
    </Field>
  );
}

/** A top-of-form error banner for a server/network failure (not field-level). */
function FormErrorBanner({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
    >
      {message}
    </p>
  );
}

/**
 * Parse the raw dollar string to minor units, or null when it isn't a usable
 * number. The shared validator does the real range check; this only converts.
 */
function parseAmountMinor(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const major = Number(trimmed);
  if (!Number.isFinite(major)) return null;
  return toMinor(major);
}

// ---- Create form ------------------------------------------------------------

const KIND_OPTIONS: { id: ScheduleKind; label: string }[] = [
  { id: 'internal_transfer', label: 'Transfer between your accounts' },
  { id: 'bill_pay', label: 'Pay a bill' },
];

/**
 * The create-a-schedule form. A kind toggle picks transfer vs. bill pay; the rest
 * of the fields (amount, frequency, first run, memo) are shared. On success it
 * hands the created schedule back to the page (which prepends it to the list).
 */
function CreateScheduleForm({
  accounts,
  onCreated,
}: {
  accounts: AccountSummary[];
  onCreated: (schedule: ScheduleDTO, message: string) => void;
}) {
  const [kind, setKind] = useState<ScheduleKind>('internal_transfer');
  const [fromAccountId, setFromAccountId] = useState('');
  const [toAccountId, setToAccountId] = useState('');
  const [counterparty, setCounterparty] = useState('');
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState<ScheduleFrequency | ''>('');
  const [firstRunInDays, setFirstRunInDays] = useState('0');
  const [memo, setMemo] = useState('');
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // A transfer needs two distinct accounts; bill pay can use just one.
  const isTransfer = kind === 'internal_transfer';
  const enoughAccounts = isTransfer ? accounts.length >= 2 : accounts.length >= 1;

  function reset() {
    setFromAccountId('');
    setToAccountId('');
    setCounterparty('');
    setAmount('');
    setFrequency('');
    setFirstRunInDays('0');
    setMemo('');
    setErrors({});
    setBanner(null);
  }

  /** Switch payment kind, clearing kind-specific fields + their errors. */
  function selectKind(next: ScheduleKind) {
    if (next === kind) return;
    setKind(next);
    setToAccountId('');
    setCounterparty('');
    setErrors((e) => ({ ...e, toAccountId: undefined, counterparty: undefined, kind: undefined }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setBanner(null);

    const amountMinor = parseAmountMinor(amount);
    // firstRunInDays is optional; treat an empty string as the default (0).
    const trimmedDays = firstRunInDays.trim();
    const daysValue = trimmedDays === '' ? 0 : Number(trimmedDays);

    const check = validateCreateSchedule({
      kind,
      fromAccountId,
      toAccountId: isTransfer ? toAccountId : undefined,
      counterparty: isTransfer ? undefined : counterparty,
      amountMinor: amountMinor ?? Number.NaN,
      frequency: frequency || undefined,
      firstRunInDays: Number.isFinite(daysValue) ? daysValue : Number.NaN,
      memo,
    });
    if (!check.ok || !check.value) {
      setErrors(check.errors);
      return;
    }
    setErrors({});
    setSubmitting(true);
    const result = await createSchedule(check.value);
    setSubmitting(false);
    if (result.ok) {
      reset();
      onCreated(result.data.schedule, result.data.message);
      return;
    }
    setErrors(result.fields ?? {});
    setBanner(result.message);
  }

  if (!enoughAccounts) {
    return (
      <Card className="border-dashed">
        <CardTitle>{isTransfer ? 'Need two accounts' : 'Need an account'}</CardTitle>
        <CardDescription>
          {isTransfer
            ? 'A scheduled transfer moves money between two of your own accounts, so you need at least two active accounts. Switch to a bill payment, or open another account first.'
            : 'You need an active account to schedule a payment from.'}
        </CardDescription>
        {/* Still allow switching kinds even when one path is blocked. */}
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2" role="group" aria-label="What to schedule">
          {KIND_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={kind === option.id}
              onClick={() => selectKind(option.id)}
              className={cn(
                'rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                kind === option.id
                  ? 'border-brand-teal bg-brand-teal/10 text-brand-teal-dark'
                  : 'border-slate-300 text-slate-600 hover:border-slate-400',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <CardTitle>Schedule a payment</CardTitle>
      <CardDescription>
        Set up a one-time or recurring payment. It runs the next time the simulation clock passes its
        due date.
      </CardDescription>
      <form onSubmit={handleSubmit} className="mt-5 space-y-4" noValidate>
        {banner && <FormErrorBanner message={banner} />}

        {/* Kind toggle: transfer vs. bill pay */}
        <Field id="schedule-kind" label="What to schedule" error={errors.kind}>
          <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-2" role="group" aria-label="What to schedule">
            {KIND_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={kind === option.id}
                disabled={submitting}
                onClick={() => selectKind(option.id)}
                className={cn(
                  'rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50',
                  kind === option.id
                    ? 'border-brand-teal bg-brand-teal/10 text-brand-teal-dark'
                    : 'border-slate-300 text-slate-600 hover:border-slate-400',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </Field>

        <AccountSelect
          id="schedule-from"
          label={isTransfer ? 'From' : 'Pay from'}
          value={fromAccountId}
          accounts={accounts}
          exclude={isTransfer ? toAccountId : undefined}
          placeholder="Choose an account"
          error={errors.fromAccountId}
          disabled={submitting}
          onChange={setFromAccountId}
        />

        {isTransfer ? (
          <AccountSelect
            id="schedule-to"
            label="To"
            value={toAccountId}
            accounts={accounts}
            exclude={fromAccountId}
            placeholder="Choose an account"
            error={errors.toAccountId}
            disabled={submitting}
            onChange={setToAccountId}
          />
        ) : (
          <TextInput
            id="schedule-biller"
            label="Biller"
            value={counterparty}
            placeholder="e.g. City Power & Light"
            maxLength={80}
            error={errors.counterparty}
            disabled={submitting}
            onChange={setCounterparty}
          />
        )}

        <AmountInput
          id="schedule-amount"
          value={amount}
          error={errors.amountMinor}
          disabled={submitting}
          onChange={setAmount}
        />

        <Field id="schedule-frequency" label="How often" error={errors.frequency}>
          <select
            id="schedule-frequency"
            value={frequency}
            disabled={submitting}
            aria-invalid={!!errors.frequency}
            aria-describedby={errors.frequency ? 'schedule-frequency-error' : undefined}
            onChange={(e) => setFrequency(e.target.value as ScheduleFrequency | '')}
            className={inputClasses}
          >
            <option value="">Choose a frequency</option>
            {SCHEDULE_FREQUENCIES.map((f) => (
              <option key={f} value={f}>
                {scheduleFrequencyLabel(f)}
              </option>
            ))}
          </select>
        </Field>

        <Field
          id="schedule-first-run"
          label="First run in (days)"
          error={errors.firstRunInDays}
          hint="0 = the next time the clock passes today. Up to 365 days ahead (simulated)."
        >
          <input
            id="schedule-first-run"
            type="number"
            inputMode="numeric"
            step="1"
            min="0"
            max="365"
            value={firstRunInDays}
            disabled={submitting}
            aria-invalid={!!errors.firstRunInDays}
            aria-describedby={errors.firstRunInDays ? 'schedule-first-run-error' : undefined}
            onChange={(e) => setFirstRunInDays(e.target.value)}
            placeholder="0"
            className={inputClasses}
          />
        </Field>

        <TextInput
          id="schedule-memo"
          label="Memo (optional)"
          value={memo}
          placeholder={isTransfer ? 'e.g. Monthly savings' : 'e.g. Account #12345'}
          maxLength={140}
          error={errors.memo}
          disabled={submitting}
          onChange={setMemo}
        />

        <Button type="submit" disabled={submitting}>
          {submitting ? 'Scheduling…' : 'Schedule payment'}
        </Button>
      </form>
    </Card>
  );
}

// ---- Schedules list ---------------------------------------------------------

/** Status badge colours mirroring the wallet/account conventions. */
const SCHEDULE_STATUS_CLASS: Record<ScheduleStatus, string> = {
  active: 'bg-emerald-50 text-emerald-700',
  completed: 'bg-slate-100 text-slate-500',
  cancelled: 'bg-slate-100 text-slate-500',
};

function ScheduleStatusBadge({ status }: { status: ScheduleStatus }) {
  return (
    <span
      className={cn(
        'rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
        SCHEDULE_STATUS_CLASS[status],
      )}
    >
      {scheduleStatusLabel(status)}
    </span>
  );
}

/** A "from → to" (transfer) or biller (bill pay) one-liner for a schedule. */
function scheduleTarget(schedule: ScheduleDTO): string {
  if (schedule.kind === 'internal_transfer') {
    const from = schedule.fromAccountName ?? 'An account';
    const to = schedule.toAccountName ?? 'an account';
    return `${from} → ${to}`;
  }
  const from = schedule.fromAccountName ?? 'An account';
  const biller = schedule.counterparty ?? 'a biller';
  return `${from} → ${biller}`;
}

/** One schedule row, with a Cancel button while it is active. */
function ScheduleItem({
  schedule,
  onCancelled,
}: {
  schedule: ScheduleDTO;
  onCancelled: (updated: ScheduleDTO) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = isActiveSchedule(schedule.status);

  async function cancel() {
    if (busy) return;
    setError(null);
    setBusy(true);
    const result = await cancelSchedule(schedule.id);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    onCancelled(result.data.schedule);
  }

  return (
    <li>
      <Card className={cn(!active && 'opacity-75')}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <CardTitle>{scheduleKindLabel(schedule.kind)}</CardTitle>
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                {scheduleFrequencyLabel(schedule.frequency)}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-600">{scheduleTarget(schedule)}</p>
            {schedule.memo && <p className="mt-0.5 text-xs text-slate-400">{schedule.memo}</p>}
          </div>
          <div className="text-right">
            <div className="text-lg font-semibold text-brand-navy tabular-nums">
              {formatMinor(schedule.amountMinor)}
            </div>
            <div className="mt-1">
              <ScheduleStatusBadge status={schedule.status} />
            </div>
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Next run</dt>
            <dd className="text-slate-700">{active ? formatDate(schedule.nextRunAt) : '—'}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Last run</dt>
            <dd className="text-slate-700">{formatDate(schedule.lastRunAt)}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Times run</dt>
            <dd className="text-slate-700 tabular-nums">{schedule.runCount}</dd>
          </div>
        </dl>

        {error && (
          <p
            role="alert"
            className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700"
          >
            {error}
          </p>
        )}

        {active && (
          <div className="mt-4">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => void cancel()}
            >
              {busy ? 'Cancelling…' : 'Cancel schedule'}
            </Button>
          </div>
        )}
      </Card>
    </li>
  );
}

/** Loading / offline / empty / list wrapper for the caller's schedules. */
function SchedulesList({
  state,
  onCancelled,
}: {
  state: AsyncData<ScheduleDTO[]>;
  onCancelled: (updated: ScheduleDTO) => void;
}) {
  if (state.loading) {
    return (
      <Card className="mt-6 animate-pulse" aria-busy="true">
        <div className="h-4 w-40 rounded bg-slate-100" />
        <div className="mt-4 h-6 w-56 rounded bg-slate-100" />
        <div className="mt-3 h-4 w-40 rounded bg-slate-100" />
      </Card>
    );
  }
  if (state.data === null) {
    return (
      <Card className="mt-6 border-rose-200 bg-rose-50">
        <CardTitle className="text-rose-700">Scheduled payments unavailable</CardTitle>
        <CardDescription className="text-rose-600">
          We could not load your scheduled payments. The backend may be offline — start it with{' '}
          <code className="font-mono">npm run dev</code> and refresh.
        </CardDescription>
      </Card>
    );
  }
  if (state.data.length === 0) {
    return (
      <Card className="mt-6 border-dashed">
        <CardTitle>No scheduled payments yet</CardTitle>
        <CardDescription>
          You don’t have any scheduled or recurring payments yet. Create one above to get started.
        </CardDescription>
      </Card>
    );
  }
  return (
    <ul className="mt-6 space-y-4">
      {state.data.map((schedule) => (
        <ScheduleItem key={schedule.id} schedule={schedule} onCancelled={onCancelled} />
      ))}
    </ul>
  );
}

// ---- Simulated-clock banner -------------------------------------------------

/** Prominent "current simulated date" panel with the fire-on-advance explanation. */
function SimulatedClockPanel({ clock }: { clock: SimulationClockDTO | null }) {
  return (
    <Card className="mt-6 border-brand-teal/30 bg-brand-teal/5">
      <div className="text-xs font-semibold uppercase tracking-wide text-brand-teal-dark">
        Current simulated date
      </div>
      <div className="mt-1 text-xl font-bold text-brand-navy">
        {clock ? formatSimulatedDate(clock.currentTime) : 'Simulation clock unavailable'}
      </div>
      <p className="mt-2 text-sm text-slate-600">
        {clock
          ? 'Scheduled payments fire when an operator advances this simulation clock past their due date — there is no real-world timer.'
          : 'We could not read the simulation clock. Schedules still fire when an operator advances it.'}
      </p>
    </Card>
  );
}

// ---- Page -------------------------------------------------------------------

export function ScheduledPayments() {
  const [accounts, setAccounts] = useState<AsyncData<AccountSummary[]>>({
    loading: true,
    data: null,
  });
  const [clock, setClock] = useState<SimulationClockDTO | null>(null);
  const [schedules, setSchedules] = useState<AsyncData<ScheduleDTO[]>>({
    loading: true,
    data: null,
  });
  const [confirmation, setConfirmation] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void fetchAccounts().then((data) => {
      if (active) setAccounts({ loading: false, data });
    });
    void fetchClock().then((result) => {
      if (active) setClock(result.ok ? result.data.clock : null);
    });
    void fetchSchedules().then((result) => {
      if (active) setSchedules({ loading: false, data: result.ok ? result.data.schedules : null });
    });
    return () => {
      active = false;
    };
  }, []);

  /** Prepend a newly-created schedule and surface its confirmation message. */
  function handleCreated(schedule: ScheduleDTO, message: string) {
    setSchedules((s) => ({ loading: false, data: [schedule, ...(s.data ?? [])] }));
    setConfirmation(message);
  }

  /** Replace a single schedule (by id) after a cancel. */
  function handleCancelled(updated: ScheduleDTO) {
    setSchedules((s) => ({
      loading: false,
      data: (s.data ?? []).map((sch) => (sch.id === updated.id ? updated : sch)),
    }));
  }

  const movable = accounts.data ? movableAccounts(accounts.data) : [];

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-1 text-sm font-medium text-brand-teal-dark hover:underline"
          >
            <span aria-hidden="true">←</span> Back to dashboard
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-brand-navy">Scheduled payments</h1>
          <p className="text-sm text-slate-600">
            Set up one-time and recurring transfers and bill payments.
          </p>
        </div>
        <BackendStatusPill />
      </div>

      <div className="mt-5 rounded-lg border border-brand-gold/40 bg-brand-gold/10 px-4 py-2 text-xs text-brand-ink">
        <strong>SIMULATION</strong> — no real money; scheduled payments fire only when the simulation
        clock advances. Internal transfers post immediately on the due date; bill pays are queued for
        operator review. Balances stay DERIVED from an append-only ledger.
      </div>

      <SimulatedClockPanel clock={clock} />

      {confirmation && (
        <p
          role="status"
          className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
        >
          {confirmation}
        </p>
      )}

      <section className="mt-6">
        {accounts.loading ? (
          <Card className="animate-pulse" aria-busy="true">
            <div className="h-4 w-40 rounded bg-slate-100" />
            <div className="mt-6 h-10 w-full rounded bg-slate-100" />
            <div className="mt-3 h-10 w-full rounded bg-slate-100" />
            <div className="mt-3 h-10 w-2/3 rounded bg-slate-100" />
          </Card>
        ) : accounts.data === null ? (
          <Card className="border-rose-200 bg-rose-50">
            <CardTitle className="text-rose-700">Scheduling is unavailable</CardTitle>
            <CardDescription className="text-rose-600">
              We could not load your accounts, so scheduling is paused. The backend may be offline —
              start it with <code className="font-mono">npm run dev</code> and refresh.
            </CardDescription>
          </Card>
        ) : movable.length === 0 ? (
          <Card className="border-dashed">
            <CardTitle>No accounts available</CardTitle>
            <CardDescription>
              You don’t have an active account that can move money yet.{' '}
              <Link to="/dashboard" className="font-medium text-brand-teal-dark hover:underline">
                Return to your dashboard
              </Link>
              .
            </CardDescription>
          </Card>
        ) : (
          <CreateScheduleForm accounts={movable} onCreated={handleCreated} />
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-brand-navy">Your scheduled payments</h2>
        <SchedulesList state={schedules} onCancelled={handleCancelled} />
      </section>

      <p className="mt-8 rounded-lg border border-brand-gold/40 bg-brand-gold/10 px-4 py-2 text-xs text-brand-ink">
        Scheduled payments move money only by appending ledger entries when they fire — balances are
        never edited directly. This is a simulation: no real money, billers, or payment networks are
        involved.
      </p>
    </div>
  );
}

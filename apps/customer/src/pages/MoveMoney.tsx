import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  formatMinor,
  movementKindLabel,
  toMinor,
  validateExternalMovement,
  validateTransfer,
  MOVEMENT_DIRECTION_LABELS,
  type AccountSummary,
  type ExternalMovementResponse,
  type MovementDirection,
  type MovementKind,
  type TransferResponse,
} from '@simbank/shared';
import { Card, CardDescription, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { BackendStatusPill } from '../components/BackendStatusPill';
import { cn } from '../lib/cn';
import { accountTypeLabel } from '../lib/account-display';
import { fetchAccounts } from '../lib/auth';
import { createMovement, createTransfer } from '../lib/money';

/**
 * "Move money" — the customer money-movement surface (v0.7.0, task M-05). One
 * tabbed page with four flows, all sharing the user's own accounts (fetched
 * once):
 *
 *  - Transfer        immediate internal transfer  -> POST /api/transfers
 *  - Deposit a check mobile check deposit (inbound) -> POST /api/movements
 *  - Send money      external ACH / wire           -> POST /api/movements
 *  - Pay a bill      bill payment (outbound)       -> POST /api/movements
 *
 * The three external flows are REVIEWABLE: they only queue a pending movement;
 * an operator must approve it before it posts. The shared validators
 * (`validateTransfer` / `validateExternalMovement`) drive inline per-field
 * errors BEFORE submit so the client and server agree; the server's `fields`
 * map is merged in afterwards.
 *
 * SIMULATION: no real money, accounts, or payment networks are ever involved.
 */

// ---- Tabs -------------------------------------------------------------------

type TabId = 'transfer' | 'deposit' | 'send' | 'bill';

const TABS: { id: TabId; label: string }[] = [
  { id: 'transfer', label: 'Transfer' },
  { id: 'deposit', label: 'Deposit a check' },
  { id: 'send', label: 'Send money' },
  { id: 'bill', label: 'Pay a bill' },
];

/** Map a `?tab=` query value (or router state) to a known tab, defaulting to transfer. */
function resolveInitialTab(search: string, stateTab: unknown): TabId {
  const fromState = typeof stateTab === 'string' ? stateTab : null;
  const fromQuery = new URLSearchParams(search).get('tab');
  const candidate = fromState ?? fromQuery;
  return TABS.some((t) => t.id === candidate) ? (candidate as TabId) : 'transfer';
}

// ---- Shared async state for the accounts the flows operate on ----------------

interface AccountsState {
  loading: boolean;
  /** null = request failed (offline / unauthorized). */
  data: AccountSummary[] | null;
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

// ---- Small form primitives (shared by every flow) ---------------------------

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

const inputClasses =
  'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal disabled:cursor-not-allowed disabled:bg-slate-50';

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
 * edit value doesn't snap), and reports the parsed minor-unit value to the
 * parent via `toMinor` (which already rounds, guarding against float drift).
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

/**
 * Merge the server's per-field `fields` map into the inline errors. Server keys
 * mirror the shared validator field names, so this is a straight overlay.
 */
function withServerFields<K extends string>(
  inline: Partial<Record<K, string>>,
  serverFields: Record<string, string> | undefined,
): Partial<Record<K, string>> {
  if (!serverFields) return inline;
  return { ...inline, ...(serverFields as Partial<Record<K, string>>) };
}

// ---- Confirmation panels ----------------------------------------------------

/** "Start another" / "Back to dashboard" actions shared by both confirmations. */
function ConfirmationActions({ onReset }: { onReset: () => void }) {
  return (
    <div className="mt-5 flex flex-wrap gap-3">
      <Button type="button" variant="secondary" onClick={onReset}>
        Make another
      </Button>
      <Link to="/dashboard">
        <Button type="button" variant="ghost">
          Back to dashboard
        </Button>
      </Link>
    </div>
  );
}

/** Success panel after an immediate internal transfer — shows updated balances. */
function TransferDone({ result, onReset }: { result: TransferResponse; onReset: () => void }) {
  return (
    <Card className="border-emerald-200 bg-emerald-50/60">
      <CardTitle className="text-emerald-800">Transfer complete</CardTitle>
      <CardDescription className="text-emerald-700">
        {result.message} You moved {formatMinor(result.amountMinor)} between your accounts.
      </CardDescription>
      <dl className="mt-4 space-y-2">
        {result.accounts.map((account) => (
          <div
            key={account.id}
            className="flex items-center justify-between rounded-lg border border-emerald-200 bg-white px-3 py-2"
          >
            <dt className="text-sm font-medium text-slate-700">{account.name}</dt>
            <dd className="text-sm font-semibold text-brand-navy tabular-nums">
              {formatMinor(account.balances.availableMinor, account.currency)}{' '}
              <span className="text-xs font-normal text-slate-500">available</span>
            </dd>
          </div>
        ))}
      </dl>
      <ConfirmationActions onReset={onReset} />
    </Card>
  );
}

/** Success panel after a reviewable movement — explains the pending-review flow. */
function MovementDone({
  result,
  onReset,
}: {
  result: ExternalMovementResponse;
  onReset: () => void;
}) {
  return (
    <Card className="border-amber-200 bg-amber-50/60">
      <CardTitle className="text-amber-900">Submitted for review</CardTitle>
      <CardDescription className="text-amber-800">{result.message}</CardDescription>
      <div className="mt-4 rounded-lg border border-amber-200 bg-white px-4 py-3 text-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="text-slate-500">Reference</span>
          <span className="font-mono font-semibold text-brand-navy">{result.reference}</span>
        </div>
        <div className="mt-2 flex items-center justify-between gap-3">
          <span className="text-slate-500">{movementKindLabel(result.kind)}</span>
          <span className="font-semibold text-brand-navy tabular-nums">
            {formatMinor(result.amountMinor)}
          </span>
        </div>
      </div>
      <p className="mt-4 text-sm text-amber-800">
        It will appear as <strong>Pending</strong> on your account until an operator posts it. In
        this simulation, an operator must approve every external movement before it affects your
        balance — nothing leaves or enters your account until then.
      </p>
      <ConfirmationActions onReset={onReset} />
    </Card>
  );
}

// ---- Flow: internal transfer ------------------------------------------------

function TransferFlow({ accounts }: { accounts: AccountSummary[] }) {
  const [fromAccountId, setFromAccountId] = useState('');
  const [toAccountId, setToAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<TransferResponse | null>(null);

  function reset() {
    setFromAccountId('');
    setToAccountId('');
    setAmount('');
    setMemo('');
    setErrors({});
    setBanner(null);
    setDone(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setBanner(null);

    const amountMinor = parseAmountMinor(amount);
    const check = validateTransfer({
      fromAccountId,
      toAccountId,
      amountMinor: amountMinor ?? Number.NaN,
      memo,
    });
    if (!check.ok || !check.value) {
      setErrors(check.errors);
      return;
    }
    setErrors({});
    setSubmitting(true);
    const result = await createTransfer(check.value);
    setSubmitting(false);
    if (result.ok) {
      setDone(result.data);
      return;
    }
    setErrors(withServerFields({}, result.fields));
    setBanner(result.message);
  }

  if (done) return <TransferDone result={done} onReset={reset} />;

  if (accounts.length < 2) {
    return (
      <Card className="border-dashed">
        <CardTitle>Need two accounts</CardTitle>
        <CardDescription>
          A transfer moves money between two of your own accounts, so you need at least two active
          accounts to use it. Try a deposit or open another account first.
        </CardDescription>
      </Card>
    );
  }

  return (
    <Card>
      <CardTitle>Transfer between your accounts</CardTitle>
      <CardDescription>
        Move money instantly between two accounts you hold. Both sides post right away.
      </CardDescription>
      <form onSubmit={handleSubmit} className="mt-5 space-y-4" noValidate>
        {banner && <FormErrorBanner message={banner} />}
        <AccountSelect
          id="transfer-from"
          label="From"
          value={fromAccountId}
          accounts={accounts}
          exclude={toAccountId}
          placeholder="Choose an account"
          error={errors.fromAccountId}
          disabled={submitting}
          onChange={setFromAccountId}
        />
        <AccountSelect
          id="transfer-to"
          label="To"
          value={toAccountId}
          accounts={accounts}
          exclude={fromAccountId}
          placeholder="Choose an account"
          error={errors.toAccountId}
          disabled={submitting}
          onChange={setToAccountId}
        />
        <AmountInput
          id="transfer-amount"
          value={amount}
          error={errors.amountMinor}
          disabled={submitting}
          onChange={setAmount}
        />
        <TextInput
          id="transfer-memo"
          label="Memo (optional)"
          value={memo}
          placeholder="e.g. Move to savings"
          maxLength={140}
          error={errors.memo}
          disabled={submitting}
          onChange={setMemo}
        />
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Transferring…' : 'Transfer now'}
        </Button>
      </form>
    </Card>
  );
}

// ---- Flow: mobile check deposit (inbound, no counterparty) -------------------

function DepositFlow({ accounts }: { accounts: AccountSummary[] }) {
  const [accountId, setAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<ExternalMovementResponse | null>(null);

  function reset() {
    setAccountId('');
    setAmount('');
    setMemo('');
    setErrors({});
    setBanner(null);
    setDone(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setBanner(null);

    const amountMinor = parseAmountMinor(amount);
    const check = validateExternalMovement({
      accountId,
      kind: 'mobile_check_deposit',
      amountMinor: amountMinor ?? Number.NaN,
      memo,
    });
    if (!check.ok || !check.value) {
      setErrors(check.errors);
      return;
    }
    setErrors({});
    setSubmitting(true);
    const result = await createMovement(check.value);
    setSubmitting(false);
    if (result.ok) {
      setDone(result.data);
      return;
    }
    setErrors(withServerFields({}, result.fields));
    setBanner(result.message);
  }

  if (done) return <MovementDone result={done} onReset={reset} />;

  return (
    <Card>
      <CardTitle>Deposit a check</CardTitle>
      <CardDescription>
        Simulate depositing a check into one of your accounts. It is queued for review and posts as a
        deposit once an operator approves it.
      </CardDescription>
      <form onSubmit={handleSubmit} className="mt-5 space-y-4" noValidate>
        {banner && <FormErrorBanner message={banner} />}
        <AccountSelect
          id="deposit-account"
          label="Deposit into"
          value={accountId}
          accounts={accounts}
          placeholder="Choose an account"
          error={errors.accountId}
          disabled={submitting}
          onChange={setAccountId}
        />
        <AmountInput
          id="deposit-amount"
          value={amount}
          error={errors.amountMinor}
          disabled={submitting}
          onChange={setAmount}
        />
        <TextInput
          id="deposit-memo"
          label="Memo (optional)"
          value={memo}
          placeholder="e.g. Paycheck"
          maxLength={140}
          error={errors.memo}
          disabled={submitting}
          onChange={setMemo}
        />
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Submitting…' : 'Submit deposit'}
        </Button>
      </form>
    </Card>
  );
}

// ---- Flow: send money (external ACH / wire) ---------------------------------

type SendKind = Extract<MovementKind, 'external_ach' | 'wire'>;

function SendFlow({ accounts }: { accounts: AccountSummary[] }) {
  const [accountId, setAccountId] = useState('');
  const [kind, setKind] = useState<SendKind>('external_ach');
  const [direction, setDirection] = useState<MovementDirection>('outbound');
  const [counterparty, setCounterparty] = useState('');
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<ExternalMovementResponse | null>(null);

  // A wire is always outbound; ACH lets the customer pick the direction.
  const directionChoosable = kind === 'external_ach';
  const effectiveDirection: MovementDirection = directionChoosable ? direction : 'outbound';

  function reset() {
    setAccountId('');
    setKind('external_ach');
    setDirection('outbound');
    setCounterparty('');
    setAmount('');
    setMemo('');
    setErrors({});
    setBanner(null);
    setDone(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setBanner(null);

    const amountMinor = parseAmountMinor(amount);
    const check = validateExternalMovement({
      accountId,
      kind,
      amountMinor: amountMinor ?? Number.NaN,
      // Wire has a fixed direction (the validator ignores what we pass); for ACH
      // we send the chosen direction explicitly.
      direction: directionChoosable ? direction : undefined,
      counterparty,
      memo,
    });
    if (!check.ok || !check.value) {
      setErrors(check.errors);
      return;
    }
    setErrors({});
    setSubmitting(true);
    const result = await createMovement(check.value);
    setSubmitting(false);
    if (result.ok) {
      setDone(result.data);
      return;
    }
    setErrors(withServerFields({}, result.fields));
    setBanner(result.message);
  }

  if (done) return <MovementDone result={done} onReset={reset} />;

  return (
    <Card>
      <CardTitle>Send money externally</CardTitle>
      <CardDescription>
        Send to (or pull from) an external account by ACH, or send a wire. Every external movement is
        queued for operator review before it posts.
      </CardDescription>
      <form onSubmit={handleSubmit} className="mt-5 space-y-4" noValidate>
        {banner && <FormErrorBanner message={banner} />}

        <AccountSelect
          id="send-account"
          label="Your account"
          value={accountId}
          accounts={accounts}
          placeholder="Choose an account"
          error={errors.accountId}
          disabled={submitting}
          onChange={setAccountId}
        />

        {/* Movement type: ACH vs wire */}
        <Field id="send-kind" label="How to send" error={errors.kind}>
          <div className="mt-1 grid grid-cols-2 gap-2" role="group" aria-label="Movement type">
            {(['external_ach', 'wire'] as SendKind[]).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={kind === k}
                disabled={submitting}
                onClick={() => setKind(k)}
                className={cn(
                  'rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50',
                  kind === k
                    ? 'border-brand-teal bg-brand-teal/10 text-brand-teal-dark'
                    : 'border-slate-300 text-slate-600 hover:border-slate-400',
                )}
              >
                {k === 'external_ach' ? 'ACH transfer' : 'Wire transfer'}
              </button>
            ))}
          </div>
        </Field>

        {/* Direction toggle (ACH only; a wire is always outbound) */}
        {directionChoosable ? (
          <Field id="send-direction" label="Direction" error={errors.direction}>
            <div
              className="mt-1 grid grid-cols-2 gap-2"
              role="group"
              aria-label="Transfer direction"
            >
              {(['outbound', 'inbound'] as MovementDirection[]).map((d) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={direction === d}
                  disabled={submitting}
                  onClick={() => setDirection(d)}
                  className={cn(
                    'rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50',
                    direction === d
                      ? 'border-brand-teal bg-brand-teal/10 text-brand-teal-dark'
                      : 'border-slate-300 text-slate-600 hover:border-slate-400',
                  )}
                >
                  {d === 'outbound' ? 'Send out' : 'Bring in'}
                </button>
              ))}
            </div>
          </Field>
        ) : (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
            A wire always sends money out ({MOVEMENT_DIRECTION_LABELS.outbound.toLowerCase()}).
          </p>
        )}

        <TextInput
          id="send-counterparty"
          label={effectiveDirection === 'inbound' ? 'Source account / sender' : 'Recipient'}
          value={counterparty}
          placeholder={
            effectiveDirection === 'inbound' ? 'e.g. External savings' : 'e.g. Jordan Smith'
          }
          maxLength={80}
          error={errors.counterparty}
          disabled={submitting}
          onChange={setCounterparty}
        />
        <AmountInput
          id="send-amount"
          value={amount}
          error={errors.amountMinor}
          disabled={submitting}
          onChange={setAmount}
        />
        <TextInput
          id="send-memo"
          label="Memo (optional)"
          value={memo}
          placeholder="e.g. Rent"
          maxLength={140}
          error={errors.memo}
          disabled={submitting}
          onChange={setMemo}
        />
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Submitting…' : 'Submit for review'}
        </Button>
      </form>
    </Card>
  );
}

// ---- Flow: pay a bill (outbound) --------------------------------------------

function BillPayFlow({ accounts }: { accounts: AccountSummary[] }) {
  const [accountId, setAccountId] = useState('');
  const [counterparty, setCounterparty] = useState('');
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<ExternalMovementResponse | null>(null);

  function reset() {
    setAccountId('');
    setCounterparty('');
    setAmount('');
    setMemo('');
    setErrors({});
    setBanner(null);
    setDone(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setBanner(null);

    const amountMinor = parseAmountMinor(amount);
    const check = validateExternalMovement({
      accountId,
      kind: 'bill_pay',
      amountMinor: amountMinor ?? Number.NaN,
      counterparty,
      memo,
    });
    if (!check.ok || !check.value) {
      setErrors(check.errors);
      return;
    }
    setErrors({});
    setSubmitting(true);
    const result = await createMovement(check.value);
    setSubmitting(false);
    if (result.ok) {
      setDone(result.data);
      return;
    }
    setErrors(withServerFields({}, result.fields));
    setBanner(result.message);
  }

  if (done) return <MovementDone result={done} onReset={reset} />;

  return (
    <Card>
      <CardTitle>Pay a bill</CardTitle>
      <CardDescription>
        Schedule a simulated bill payment from one of your accounts. It is queued for review and
        posts once an operator approves it.
      </CardDescription>
      <form onSubmit={handleSubmit} className="mt-5 space-y-4" noValidate>
        {banner && <FormErrorBanner message={banner} />}
        <AccountSelect
          id="bill-account"
          label="Pay from"
          value={accountId}
          accounts={accounts}
          placeholder="Choose an account"
          error={errors.accountId}
          disabled={submitting}
          onChange={setAccountId}
        />
        <TextInput
          id="bill-counterparty"
          label="Biller"
          value={counterparty}
          placeholder="e.g. City Power & Light"
          maxLength={80}
          error={errors.counterparty}
          disabled={submitting}
          onChange={setCounterparty}
        />
        <AmountInput
          id="bill-amount"
          value={amount}
          error={errors.amountMinor}
          disabled={submitting}
          onChange={setAmount}
        />
        <TextInput
          id="bill-memo"
          label="Memo (optional)"
          value={memo}
          placeholder="e.g. Account #12345"
          maxLength={140}
          error={errors.memo}
          disabled={submitting}
          onChange={setMemo}
        />
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Submitting…' : 'Submit payment'}
        </Button>
      </form>
    </Card>
  );
}

// ---- Page shell -------------------------------------------------------------

/** Loading / offline / empty wrapper that hands movable accounts to a flow. */
function FlowArea({ state, children }: { state: AccountsState; children: (accounts: AccountSummary[]) => ReactNode }) {
  if (state.loading) {
    return (
      <Card className="animate-pulse" aria-busy="true">
        <div className="h-4 w-40 rounded bg-slate-100" />
        <div className="mt-6 h-10 w-full rounded bg-slate-100" />
        <div className="mt-3 h-10 w-full rounded bg-slate-100" />
        <div className="mt-3 h-10 w-2/3 rounded bg-slate-100" />
      </Card>
    );
  }
  if (state.data === null) {
    return (
      <Card className="border-rose-200 bg-rose-50">
        <CardTitle className="text-rose-700">Move money is unavailable</CardTitle>
        <CardDescription className="text-rose-600">
          We could not load your accounts, so money movement is paused. The backend may be offline —
          start it with <code className="font-mono">npm run dev</code> and refresh.
        </CardDescription>
      </Card>
    );
  }
  const movable = movableAccounts(state.data);
  if (movable.length === 0) {
    return (
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
    );
  }
  return <>{children(movable)}</>;
}

export function MoveMoney() {
  const location = useLocation();
  const initialTab = resolveInitialTab(
    location.search,
    (location.state as { tab?: string } | null)?.tab,
  );
  const [tab, setTab] = useState<TabId>(initialTab);
  const [accounts, setAccounts] = useState<AccountsState>({ loading: true, data: null });

  useEffect(() => {
    let active = true;
    void fetchAccounts().then((data) => {
      if (active) setAccounts({ loading: false, data });
    });
    return () => {
      active = false;
    };
  }, []);

  // An optional account to pre-select, passed via router state from AccountDetail.
  const preselectAccountId = useMemo(
    () => (location.state as { accountId?: string } | null)?.accountId,
    [location.state],
  );

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
          <h1 className="mt-2 text-2xl font-bold text-brand-navy">Move money</h1>
          <p className="text-sm text-slate-600">
            Transfer between your accounts, deposit a check, send money, or pay a bill.
          </p>
        </div>
        <BackendStatusPill />
      </div>

      <div className="mt-5 rounded-lg border border-brand-gold/40 bg-brand-gold/10 px-4 py-2 text-xs text-brand-ink">
        <strong>SIMULATION</strong> — no real money, accounts, or payment networks. Internal
        transfers post immediately; external movements are queued for operator review before they
        post. Balances stay DERIVED from an append-only ledger.
      </div>

      {/* Tabs */}
      <div className="mt-6 border-b border-slate-200">
        <div role="tablist" aria-label="Move money options" className="-mb-px flex flex-wrap gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              type="button"
              id={`tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`panel-${t.id}`}
              onClick={() => setTab(t.id)}
              className={cn(
                'rounded-t-lg border-b-2 px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal',
                tab === t.id
                  ? 'border-brand-teal text-brand-navy'
                  : 'border-transparent text-slate-500 hover:text-slate-700',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div
        role="tabpanel"
        id={`panel-${tab}`}
        aria-labelledby={`tab-${tab}`}
        className="mt-6"
      >
        <FlowArea state={accounts}>
          {(movable) => {
            // Pre-select the deep-linked account where the flow has a single
            // "your account" selector, by ordering it first.
            const ordered = preselectAccountId
              ? [
                  ...movable.filter((a) => a.id === preselectAccountId),
                  ...movable.filter((a) => a.id !== preselectAccountId),
                ]
              : movable;
            switch (tab) {
              case 'transfer':
                return <TransferFlow accounts={ordered} />;
              case 'deposit':
                return <DepositFlow accounts={ordered} />;
              case 'send':
                return <SendFlow accounts={ordered} />;
              case 'bill':
                return <BillPayFlow accounts={ordered} />;
              default:
                return null;
            }
          }}
        </FlowArea>
      </div>

      <p className="mt-8 rounded-lg border border-brand-gold/40 bg-brand-gold/10 px-4 py-2 text-xs text-brand-ink">
        Money moves only by appending ledger entries — balances are never edited directly. This is a
        simulation: no real money, accounts, or payment networks are involved.
      </p>
    </div>
  );
}

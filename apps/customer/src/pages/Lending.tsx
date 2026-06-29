import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  amortizedPaymentMinor,
  cdApyForTerm,
  daysBetween,
  formatApy,
  formatMinor,
  isCdWithdrawable,
  lendingKindLabel,
  lendingStatusLabel,
  loanApyForTerm,
  projectCdMaturityMinor,
  toMinor,
  validateLoanPayment,
  validateOpenCd,
  validateOpenLoan,
  validateWithdrawCd,
  CD_TERMS_MONTHS,
  LOAN_TERMS_MONTHS,
  type AccountSummary,
  type LendingProductDTO,
  type LendingStatus,
  type SimulationClockDTO,
} from '@simbank/shared';
import { Card, CardDescription, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { BackendStatusPill } from '../components/BackendStatusPill';
import { cn } from '../lib/cn';
import { accountTypeLabel } from '../lib/account-display';
import { fetchAccounts } from '../lib/auth';
import { fetchClock } from '../lib/schedules';
import { listLending, openCd, openLoan, payLoan, withdrawCd } from '../lib/lending';

/**
 * "Loans & CDs" — the authenticated lending portal (v1.0.0, task L-06). One page
 * that:
 *
 *  - lists the customer's lending products (CDs + loans) with status, APY, term,
 *    maturity ("matures in N days" vs the simulation clock), the DERIVED balance
 *    (a loan shows the outstanding amount owed; a CD shows its growing value),
 *    and the loan's monthly payment;
 *  - opens a CD (funding account + principal + offered term) — POST /api/lending/cds;
 *  - opens a loan (disbursement account + principal + offered term) with a live
 *    monthly-payment preview — POST /api/lending/loans;
 *  - makes a loan payment (the scheduled payment by default, or a custom amount)
 *    — POST /api/lending/loans/:id/pay;
 *  - withdraws a MATURED CD to a chosen account — POST /api/lending/cds/:id/withdraw.
 *
 * The shared validators (`validateOpenCd` / `validateOpenLoan` /
 * `validateLoanPayment` / `validateWithdrawCd`) drive inline per-field errors
 * BEFORE submit so the client and server agree; the server's `fields` map is
 * merged in afterwards. Loading / empty / offline states keep the page honest.
 *
 * SIMULATION: no real lender, deposit product, credit decision, or money network
 * is ever involved. Money moves only by appending ledger entries on the server;
 * the UI only DISPLAYS derived balances.
 */

// ---- Shared async state -----------------------------------------------------

interface AsyncData<T> {
  loading: boolean;
  /** null = request failed (offline / unauthorized). */
  data: T | null;
}

/** Only accounts that can fund/receive money (active, not view-only, cash). */
function fundingAccounts(accounts: AccountSummary[]): AccountSummary[] {
  return accounts.filter(
    (a) =>
      a.status === 'active' &&
      a.relationship !== 'viewer' &&
      (a.type === 'checking' || a.type === 'savings'),
  );
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

// ---- Small form primitives (mirroring MoveMoney / ScheduledPayments) ---------

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

/** A native account `<select>` over a list of accounts. */
function AccountSelect({
  id,
  label,
  value,
  accounts,
  placeholder,
  error,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  accounts: AccountSummary[];
  placeholder: string;
  error?: string;
  disabled?: boolean;
  onChange: (id: string) => void;
}) {
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
        {accounts.map((a) => (
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
  label,
  hint,
  value,
  error,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  hint?: ReactNode;
  value: string;
  error?: string;
  disabled?: boolean;
  onChange: (raw: string) => void;
}) {
  return (
    <Field id={id} label={label} error={error} hint={hint}>
      <div className="relative mt-1">
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-slate-400">
          $
        </span>
        <input
          id={id}
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
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

// ---- Term option helpers ----------------------------------------------------

/** "12 months — 4.50% APY" option label for a term whose APY is known. */
function termOptionLabel(months: number, apyBps: number | null): string {
  const term = `${months} month${months === 1 ? '' : 's'}`;
  return apyBps === null ? term : `${term} — ${formatApy(apyBps)} APY`;
}

// ---- Open a CD --------------------------------------------------------------

function OpenCdForm({
  accounts,
  onOpened,
}: {
  accounts: AccountSummary[];
  onOpened: (product: LendingProductDTO, message: string) => void;
}) {
  const [fundingAccountId, setFundingAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [termMonths, setTermMonths] = useState<number | ''>('');
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Live projection of value at maturity for the chosen amount + term.
  const principalMinor = parseAmountMinor(amount);
  const chosenApy = typeof termMonths === 'number' ? cdApyForTerm(termMonths) : null;
  const showProjection =
    principalMinor !== null && principalMinor > 0 && typeof termMonths === 'number' && chosenApy !== null;

  function reset() {
    setFundingAccountId('');
    setAmount('');
    setTermMonths('');
    setErrors({});
    setBanner(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setBanner(null);

    const check = validateOpenCd({
      fundingAccountId,
      principalMinor: principalMinor ?? Number.NaN,
      termMonths: typeof termMonths === 'number' ? termMonths : Number.NaN,
    });
    if (!check.ok || !check.value) {
      setErrors(check.errors);
      return;
    }
    setErrors({});
    setSubmitting(true);
    const result = await openCd(check.value);
    setSubmitting(false);
    if (result.ok) {
      reset();
      onOpened(result.data.product, result.data.message);
      return;
    }
    setErrors(result.fields ?? {});
    setBanner(result.message);
  }

  return (
    <Card>
      <CardTitle>Open a certificate of deposit</CardTitle>
      <CardDescription>
        Move money from one of your accounts into a CD that earns a simulated, fixed rate for its
        term. The deposit posts immediately; interest accrues each time the simulation clock advances
        a month.
      </CardDescription>
      <form onSubmit={handleSubmit} className="mt-5 space-y-4" noValidate>
        {banner && <FormErrorBanner message={banner} />}
        <AccountSelect
          id="cd-funding"
          label="Fund from"
          value={fundingAccountId}
          accounts={accounts}
          placeholder="Choose an account"
          error={errors.fundingAccountId}
          disabled={submitting}
          onChange={setFundingAccountId}
        />
        <AmountInput
          id="cd-amount"
          label="Deposit amount (USD)"
          hint="Simulated range: $100 – $1,000,000."
          value={amount}
          error={errors.principalMinor}
          disabled={submitting}
          onChange={setAmount}
        />
        <Field id="cd-term" label="Term" error={errors.termMonths}>
          <select
            id="cd-term"
            value={termMonths}
            disabled={submitting}
            aria-invalid={!!errors.termMonths}
            aria-describedby={errors.termMonths ? 'cd-term-error' : undefined}
            onChange={(e) => setTermMonths(e.target.value ? Number(e.target.value) : '')}
            className={inputClasses}
          >
            <option value="">Choose a term</option>
            {CD_TERMS_MONTHS.map((months) => (
              <option key={months} value={months}>
                {termOptionLabel(months, cdApyForTerm(months))}
              </option>
            ))}
          </select>
        </Field>

        {showProjection && (
          <p className="rounded-lg border border-brand-teal/30 bg-brand-teal/5 px-3 py-2 text-sm text-slate-700">
            At {formatApy(chosenApy)} APY, this CD is projected to be worth{' '}
            <span className="font-semibold text-brand-navy tabular-nums">
              {formatMinor(projectCdMaturityMinor(principalMinor, chosenApy, termMonths))}
            </span>{' '}
            at maturity (simulated).
          </p>
        )}

        <Button type="submit" disabled={submitting}>
          {submitting ? 'Opening…' : 'Open CD'}
        </Button>
      </form>
    </Card>
  );
}

// ---- Open a loan ------------------------------------------------------------

function OpenLoanForm({
  accounts,
  onOpened,
}: {
  accounts: AccountSummary[];
  onOpened: (product: LendingProductDTO, message: string) => void;
}) {
  const [disbursementAccountId, setDisbursementAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [termMonths, setTermMonths] = useState<number | ''>('');
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Live amortized monthly-payment preview for the chosen amount + term.
  const principalMinor = parseAmountMinor(amount);
  const chosenApy = typeof termMonths === 'number' ? loanApyForTerm(termMonths) : null;
  const showPreview =
    principalMinor !== null && principalMinor > 0 && typeof termMonths === 'number' && chosenApy !== null;

  function reset() {
    setDisbursementAccountId('');
    setAmount('');
    setTermMonths('');
    setErrors({});
    setBanner(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setBanner(null);

    const check = validateOpenLoan({
      disbursementAccountId,
      principalMinor: principalMinor ?? Number.NaN,
      termMonths: typeof termMonths === 'number' ? termMonths : Number.NaN,
    });
    if (!check.ok || !check.value) {
      setErrors(check.errors);
      return;
    }
    setErrors({});
    setSubmitting(true);
    const result = await openLoan(check.value);
    setSubmitting(false);
    if (result.ok) {
      reset();
      onOpened(result.data.product, result.data.message);
      return;
    }
    setErrors(result.fields ?? {});
    setBanner(result.message);
  }

  return (
    <Card>
      <CardTitle>Open a loan</CardTitle>
      <CardDescription>
        Borrow a simulated amount disbursed straight to one of your accounts. Interest is charged each
        time the simulation clock advances a month; pay it down any time below.
      </CardDescription>
      <form onSubmit={handleSubmit} className="mt-5 space-y-4" noValidate>
        {banner && <FormErrorBanner message={banner} />}
        <AccountSelect
          id="loan-disbursement"
          label="Disburse to"
          value={disbursementAccountId}
          accounts={accounts}
          placeholder="Choose an account"
          error={errors.disbursementAccountId}
          disabled={submitting}
          onChange={setDisbursementAccountId}
        />
        <AmountInput
          id="loan-amount"
          label="Loan amount (USD)"
          hint="Simulated range: $100 – $1,000,000."
          value={amount}
          error={errors.principalMinor}
          disabled={submitting}
          onChange={setAmount}
        />
        <Field id="loan-term" label="Term" error={errors.termMonths}>
          <select
            id="loan-term"
            value={termMonths}
            disabled={submitting}
            aria-invalid={!!errors.termMonths}
            aria-describedby={errors.termMonths ? 'loan-term-error' : undefined}
            onChange={(e) => setTermMonths(e.target.value ? Number(e.target.value) : '')}
            className={inputClasses}
          >
            <option value="">Choose a term</option>
            {LOAN_TERMS_MONTHS.map((months) => (
              <option key={months} value={months}>
                {termOptionLabel(months, loanApyForTerm(months))}
              </option>
            ))}
          </select>
        </Field>

        {showPreview && (
          <p className="rounded-lg border border-brand-teal/30 bg-brand-teal/5 px-3 py-2 text-sm text-slate-700">
            At {formatApy(chosenApy)} APY, the estimated monthly payment is{' '}
            <span className="font-semibold text-brand-navy tabular-nums">
              {formatMinor(amortizedPaymentMinor(principalMinor, chosenApy, termMonths))}
            </span>{' '}
            for {termMonths} months (simulated).
          </p>
        )}

        <Button type="submit" disabled={submitting}>
          {submitting ? 'Opening…' : 'Open loan'}
        </Button>
      </form>
    </Card>
  );
}

// ---- Lending product list ---------------------------------------------------

/** Status badge colours mirroring the wallet / scheduled-payments conventions. */
const LENDING_STATUS_CLASS: Record<LendingStatus, string> = {
  active: 'bg-emerald-50 text-emerald-700',
  matured: 'bg-brand-gold/20 text-brand-ink',
  paid_off: 'bg-slate-100 text-slate-500',
  closed: 'bg-slate-100 text-slate-500',
};

function LendingStatusBadge({ status }: { status: LendingStatus }) {
  return (
    <span
      className={cn(
        'rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
        LENDING_STATUS_CLASS[status],
      )}
    >
      {lendingStatusLabel(status)}
    </span>
  );
}

/** "matures in N days" / "matured N days ago" relative to the simulated clock. */
function maturityHint(maturesAt: string, nowIso: string | null): string | null {
  if (!nowIso) return null;
  const days = daysBetween(nowIso, maturesAt);
  if (days > 0) return `matures in ${days} day${days === 1 ? '' : 's'}`;
  if (days === 0) return 'matures today';
  const ago = Math.abs(days);
  return `matured ${ago} day${ago === 1 ? '' : 's'} ago`;
}

/** Make-a-payment form shown inline under an active loan. */
function LoanPaymentForm({
  product,
  accounts,
  onPaid,
  onCancel,
}: {
  product: LendingProductDTO;
  accounts: AccountSummary[];
  onPaid: (updated: LendingProductDTO, message: string) => void;
  onCancel: () => void;
}) {
  const [fromAccountId, setFromAccountId] = useState('');
  const [mode, setMode] = useState<'scheduled' | 'custom'>('scheduled');
  const [amount, setAmount] = useState('');
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setBanner(null);

    // Scheduled mode sends no amount (the server resolves the monthly payment);
    // custom mode sends the parsed amount.
    const customMinor = mode === 'custom' ? parseAmountMinor(amount) : undefined;
    const check = validateLoanPayment({
      fromAccountId,
      amountMinor: mode === 'custom' ? (customMinor ?? Number.NaN) : null,
    });
    if (!check.ok || !check.value) {
      setErrors(check.errors);
      return;
    }
    setErrors({});
    setSubmitting(true);
    const result = await payLoan(product.id, check.value);
    setSubmitting(false);
    if (result.ok) {
      onPaid(result.data.product, result.data.message);
      return;
    }
    setErrors(result.fields ?? {});
    setBanner(result.message);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-4 space-y-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3"
      noValidate
    >
      {banner && <FormErrorBanner message={banner} />}
      <AccountSelect
        id={`${product.id}-pay-from`}
        label="Pay from"
        value={fromAccountId}
        accounts={accounts}
        placeholder="Choose an account"
        error={errors.fromAccountId}
        disabled={submitting}
        onChange={setFromAccountId}
      />

      <Field id={`${product.id}-pay-mode`} label="Amount to pay" error={undefined}>
        <div className="mt-1 grid grid-cols-2 gap-2" role="group" aria-label="Payment amount">
          {(['scheduled', 'custom'] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              disabled={submitting}
              onClick={() => setMode(m)}
              className={cn(
                'rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50',
                mode === m
                  ? 'border-brand-teal bg-brand-teal/10 text-brand-teal-dark'
                  : 'border-slate-300 text-slate-600 hover:border-slate-400',
              )}
            >
              {m === 'scheduled'
                ? `Monthly payment${
                    product.paymentMinor != null ? ` (${formatMinor(product.paymentMinor)})` : ''
                  }`
                : 'Custom amount'}
            </button>
          ))}
        </div>
      </Field>

      {mode === 'custom' && (
        <AmountInput
          id={`${product.id}-pay-amount`}
          label="Custom amount (USD)"
          hint="Simulated range: $1 – $1,000,000."
          value={amount}
          error={errors.amountMinor}
          disabled={submitting}
          onChange={setAmount}
        />
      )}

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={submitting}>
          {submitting ? 'Paying…' : 'Make payment'}
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={submitting} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/** Withdraw-to-account form shown inline under a matured CD. */
function WithdrawCdForm({
  product,
  accounts,
  onWithdrawn,
  onCancel,
}: {
  product: LendingProductDTO;
  accounts: AccountSummary[];
  onWithdrawn: (updated: LendingProductDTO, message: string) => void;
  onCancel: () => void;
}) {
  const [toAccountId, setToAccountId] = useState('');
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setBanner(null);

    const check = validateWithdrawCd({ toAccountId });
    if (!check.ok || !check.value) {
      setErrors(check.errors);
      return;
    }
    setErrors({});
    setSubmitting(true);
    const result = await withdrawCd(product.id, check.value);
    setSubmitting(false);
    if (result.ok) {
      onWithdrawn(result.data.product, result.data.message);
      return;
    }
    setErrors(result.fields ?? {});
    setBanner(result.message);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-4 space-y-3 rounded-lg border border-brand-gold/40 bg-brand-gold/10 p-3"
      noValidate
    >
      {banner && <FormErrorBanner message={banner} />}
      <p className="text-sm text-brand-ink">
        This CD has matured. Withdraw its value of{' '}
        <span className="font-semibold tabular-nums">{formatMinor(product.balanceMinor)}</span> to one
        of your accounts (simulated).
      </p>
      <AccountSelect
        id={`${product.id}-withdraw-to`}
        label="Deposit into"
        value={toAccountId}
        accounts={accounts}
        placeholder="Choose an account"
        error={errors.toAccountId}
        disabled={submitting}
        onChange={setToAccountId}
      />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={submitting}>
          {submitting ? 'Withdrawing…' : 'Withdraw CD'}
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={submitting} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

type ProductPanel = 'none' | 'pay' | 'withdraw';

/** One lending product card (CD or loan) with its inline action panel. */
function LendingProductItem({
  product,
  accounts,
  nowIso,
  onUpdated,
}: {
  product: LendingProductDTO;
  accounts: AccountSummary[];
  nowIso: string | null;
  onUpdated: (updated: LendingProductDTO, message: string) => void;
}) {
  const [panel, setPanel] = useState<ProductPanel>('none');
  const isLoan = product.kind === 'loan';
  const owed = isLoan && product.outstandingMinor > 0;
  const canPay = isLoan && product.status === 'active' && product.outstandingMinor > 0;
  const canWithdraw = isCdWithdrawable(product);
  const hint = maturityHint(product.maturesAt, nowIso);

  return (
    <li>
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <CardTitle>{lendingKindLabel(product.kind)}</CardTitle>
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                {formatApy(product.apyBps)} APY
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-600">{product.accountName}</p>
          </div>
          <div className="text-right">
            {isLoan ? (
              <>
                <div className="text-lg font-semibold text-rose-700 tabular-nums">
                  {owed ? formatMinor(product.outstandingMinor) : formatMinor(0)}
                </div>
                <div className="text-[11px] uppercase tracking-wide text-slate-400">
                  {owed ? 'You owe' : 'Paid off'}
                </div>
              </>
            ) : (
              <>
                <div className="text-lg font-semibold text-brand-navy tabular-nums">
                  {formatMinor(product.balanceMinor)}
                </div>
                <div className="text-[11px] uppercase tracking-wide text-slate-400">CD value</div>
              </>
            )}
            <div className="mt-1">
              <LendingStatusBadge status={product.status} />
            </div>
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Principal</dt>
            <dd className="text-slate-700 tabular-nums">{formatMinor(product.principalMinor)}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Term</dt>
            <dd className="text-slate-700 tabular-nums">{product.termMonths} mo</dd>
          </div>
          {isLoan && product.paymentMinor != null && (
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Monthly payment</dt>
              <dd className="text-slate-700 tabular-nums">{formatMinor(product.paymentMinor)}</dd>
            </div>
          )}
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Matures</dt>
            <dd className="text-slate-700">{formatDate(product.maturesAt)}</dd>
          </div>
        </dl>

        {hint && product.status !== 'closed' && product.status !== 'paid_off' && (
          <p className="mt-2 text-xs text-slate-500">{hint}</p>
        )}

        {(canPay || canWithdraw) && panel === 'none' && (
          <div className="mt-4 flex flex-wrap gap-2">
            {canPay && (
              <Button type="button" size="sm" onClick={() => setPanel('pay')}>
                Make a payment
              </Button>
            )}
            {canWithdraw && (
              <Button type="button" size="sm" onClick={() => setPanel('withdraw')}>
                Withdraw CD
              </Button>
            )}
          </div>
        )}

        {panel === 'pay' && (
          <LoanPaymentForm
            product={product}
            accounts={accounts}
            onPaid={(updated, message) => {
              setPanel('none');
              onUpdated(updated, message);
            }}
            onCancel={() => setPanel('none')}
          />
        )}

        {panel === 'withdraw' && (
          <WithdrawCdForm
            product={product}
            accounts={accounts}
            onWithdrawn={(updated, message) => {
              setPanel('none');
              onUpdated(updated, message);
            }}
            onCancel={() => setPanel('none')}
          />
        )}
      </Card>
    </li>
  );
}

/** Loading / offline / empty / list wrapper for the caller's lending products. */
function LendingList({
  state,
  accounts,
  nowIso,
  onUpdated,
}: {
  state: AsyncData<LendingProductDTO[]>;
  accounts: AccountSummary[];
  nowIso: string | null;
  onUpdated: (updated: LendingProductDTO, message: string) => void;
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
        <CardTitle className="text-rose-700">Loans &amp; CDs unavailable</CardTitle>
        <CardDescription className="text-rose-600">
          We could not load your loans and CDs. The backend may be offline — start it with{' '}
          <code className="font-mono">npm run dev</code> and refresh.
        </CardDescription>
      </Card>
    );
  }
  if (state.data.length === 0) {
    return (
      <Card className="mt-6 border-dashed">
        <CardTitle>No loans or CDs yet</CardTitle>
        <CardDescription>
          You don’t have any certificates of deposit or loans yet. Open one below to get started.
        </CardDescription>
      </Card>
    );
  }
  return (
    <ul className="mt-6 space-y-4">
      {state.data.map((product) => (
        <LendingProductItem
          key={product.id}
          product={product}
          accounts={accounts}
          nowIso={nowIso}
          onUpdated={onUpdated}
        />
      ))}
    </ul>
  );
}

// ---- Simulated-clock banner -------------------------------------------------

/** Compact "current simulated date" panel explaining clock-driven accrual. */
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
          ? 'CDs and loans accrue simulated interest each time an operator advances this clock past a monthly anniversary — there is no real-world timer.'
          : 'We could not read the simulation clock. Interest still accrues when an operator advances it.'}
      </p>
    </Card>
  );
}

// ---- Page -------------------------------------------------------------------

export function Lending() {
  const [accounts, setAccounts] = useState<AsyncData<AccountSummary[]>>({
    loading: true,
    data: null,
  });
  const [clock, setClock] = useState<SimulationClockDTO | null>(null);
  const [products, setProducts] = useState<AsyncData<LendingProductDTO[]>>({
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
    void listLending().then((result) => {
      if (active) setProducts({ loading: false, data: result.ok ? result.data.products : null });
    });
    return () => {
      active = false;
    };
  }, []);

  /** Prepend a newly-opened product and surface its confirmation message. */
  function handleOpened(product: LendingProductDTO, message: string) {
    setProducts((s) => ({ loading: false, data: [product, ...(s.data ?? [])] }));
    setConfirmation(message);
    // A new CD/loan moves money, so the account balances changed — refresh them.
    void fetchAccounts().then((data) => setAccounts({ loading: false, data }));
  }

  /** Replace a single product (by id) after a payment / withdrawal. */
  function handleUpdated(updated: LendingProductDTO, message: string) {
    setProducts((s) => ({
      loading: false,
      data: (s.data ?? []).map((p) => (p.id === updated.id ? updated : p)),
    }));
    setConfirmation(message);
    void fetchAccounts().then((data) => setAccounts({ loading: false, data }));
  }

  const funding = accounts.data ? fundingAccounts(accounts.data) : [];
  const nowIso = clock?.currentTime ?? null;

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
          <h1 className="mt-2 text-2xl font-bold text-brand-navy">Loans &amp; CDs</h1>
          <p className="text-sm text-slate-600">
            Open a certificate of deposit, take out a loan, and manage them over simulated time.
          </p>
        </div>
        <BackendStatusPill />
      </div>

      <div className="mt-5 rounded-lg border border-brand-gold/40 bg-brand-gold/10 px-4 py-2 text-xs text-brand-ink">
        <strong>SIMULATION</strong> — no real lender, deposit product, credit decision, or money
        network. Opening, repaying, or withdrawing moves only SIMULATED money by appending ledger
        entries; interest accrues only when the simulation clock advances. Balances stay DERIVED from
        an append-only ledger.
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

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-brand-navy">Your loans &amp; CDs</h2>
        <LendingList
          state={products}
          accounts={funding}
          nowIso={nowIso}
          onUpdated={handleUpdated}
        />
      </section>

      <section className="mt-10 space-y-6">
        <h2 className="text-lg font-semibold text-brand-navy">Open something new</h2>
        {accounts.loading ? (
          <Card className="animate-pulse" aria-busy="true">
            <div className="h-4 w-40 rounded bg-slate-100" />
            <div className="mt-6 h-10 w-full rounded bg-slate-100" />
            <div className="mt-3 h-10 w-full rounded bg-slate-100" />
            <div className="mt-3 h-10 w-2/3 rounded bg-slate-100" />
          </Card>
        ) : accounts.data === null ? (
          <Card className="border-rose-200 bg-rose-50">
            <CardTitle className="text-rose-700">Opening is unavailable</CardTitle>
            <CardDescription className="text-rose-600">
              We could not load your accounts, so opening a CD or loan is paused. The backend may be
              offline — start it with <code className="font-mono">npm run dev</code> and refresh.
            </CardDescription>
          </Card>
        ) : funding.length === 0 ? (
          <Card className="border-dashed">
            <CardTitle>No accounts available</CardTitle>
            <CardDescription>
              You need an active checking or savings account to fund a CD or receive a loan.{' '}
              <Link to="/dashboard" className="font-medium text-brand-teal-dark hover:underline">
                Return to your dashboard
              </Link>
              .
            </CardDescription>
          </Card>
        ) : (
          <>
            <OpenCdForm accounts={funding} onOpened={handleOpened} />
            <OpenLoanForm accounts={funding} onOpened={handleOpened} />
          </>
        )}
      </section>

      <p className="mt-8 rounded-lg border border-brand-gold/40 bg-brand-gold/10 px-4 py-2 text-xs text-brand-ink">
        Loans and CDs move money only by appending ledger entries — balances are never edited
        directly. This is a simulation: no real money, lender, or deposit product is involved.
      </p>
    </div>
  );
}

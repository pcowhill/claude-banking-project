import { useMemo, useState, type FormEvent } from 'react';
import {
  filterTransactions,
  formatMinor,
  groupForStatus,
  originLabel,
  validateDispute,
  DISPUTE_REASONS,
  DISPUTE_REASON_LABELS,
  DISPUTE_TEXT,
  type DisputeReason,
  type LedgerOrigin,
  type TransactionDTO,
  type TransactionGroup,
} from '@simbank/shared';
import { cn } from '../lib/cn';
import { Button } from './ui/Button';
import { formatSignedMinor, formatTxnDate, TXN_STATUS_META } from '../lib/account-display';
import { fileDispute } from '../lib/risk';

/**
 * Transaction history for one account (v0.4.0, task D-06). Renders PENDING and
 * POSTED transactions in clearly-separated groups, each posted row showing the
 * running settled balance, with an instant client-side search + status/category
 * filter built on the SAME shared `filterTransactions` the API uses. The data
 * (derived amounts, running balance, ordering) comes from the server; this is
 * presentation only.
 */

type StatusFilter = 'all' | Extract<TransactionGroup, 'pending' | 'posted'>;

function StatusBadge({ status }: { status: TransactionDTO['status'] }) {
  const meta = TXN_STATUS_META[status];
  return (
    <span
      className={cn(
        'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
        meta.className,
      )}
    >
      {meta.label}
    </span>
  );
}

/**
 * Inline "dispute this transaction" form (v0.8.0). A reason from the shared
 * `DISPUTE_REASONS` plus optional details, validated with `validateDispute`
 * before POSTing to `/api/disputes`. On success it tells the parent so the row
 * flips to a "Disputed" badge and stops offering the action.
 */
function DisputeForm({
  ledgerEntryId,
  onDisputed,
  onCancel,
}: {
  ledgerEntryId: string;
  onDisputed: () => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState<DisputeReason | ''>('');
  const [details, setDetails] = useState('');
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setBanner(null);
    const check = validateDispute({ ledgerEntryId, reason, details });
    if (!check.ok || !check.value) {
      setErrors(check.errors);
      return;
    }
    setErrors({});
    setSubmitting(true);
    const result = await fileDispute(check.value);
    setSubmitting(false);
    if (!result.ok) {
      setErrors(result.fields ?? {});
      setBanner(result.message);
      return;
    }
    onDisputed();
  }

  const inputClass =
    'mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal';

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-3 space-y-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3"
      noValidate
    >
      {banner && (
        <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-2 text-xs text-rose-700">
          {banner}
        </p>
      )}
      <div>
        <label htmlFor={`dispute-reason-${ledgerEntryId}`} className="block text-xs font-medium text-slate-700">
          Why are you disputing this?
        </label>
        <select
          id={`dispute-reason-${ledgerEntryId}`}
          value={reason}
          disabled={submitting}
          onChange={(e) => setReason(e.target.value as DisputeReason | '')}
          className={inputClass}
        >
          <option value="">Choose a reason</option>
          {DISPUTE_REASONS.map((r) => (
            <option key={r} value={r}>
              {DISPUTE_REASON_LABELS[r]}
            </option>
          ))}
        </select>
        {errors.reason && <p className="mt-1 text-xs font-medium text-rose-600">{errors.reason}</p>}
      </div>
      <div>
        <label htmlFor={`dispute-details-${ledgerEntryId}`} className="block text-xs font-medium text-slate-700">
          Details (optional)
        </label>
        <textarea
          id={`dispute-details-${ledgerEntryId}`}
          value={details}
          maxLength={DISPUTE_TEXT.detailsMaxLength}
          disabled={submitting}
          onChange={(e) => setDetails(e.target.value)}
          rows={2}
          placeholder="Anything that helps us review this."
          className={inputClass}
        />
        {errors.details && <p className="mt-1 text-xs font-medium text-rose-600">{errors.details}</p>}
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" variant="secondary" disabled={submitting}>
          {submitting ? 'Filing…' : 'File dispute'}
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={submitting} onClick={onCancel}>
          Cancel
        </Button>
      </div>
      <p className="text-[11px] text-slate-500">
        Simulated — filing flags the transaction for operator review. No real money moves.
      </p>
    </form>
  );
}

function TransactionRow({
  txn,
  currency,
  showRunningBalance,
  disputed,
  onDisputed,
}: {
  txn: TransactionDTO;
  currency: string;
  showRunningBalance: boolean;
  /** True when the entry is disputed (server-side or just filed in this session). */
  disputed: boolean;
  onDisputed: (ledgerEntryId: string) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const isCredit = txn.signedAmountMinor >= 0;
  const dateIso = txn.postedAt ?? txn.createdAt;
  // Offer the dispute action only on a settled, not-yet-disputed transaction.
  const canDispute = txn.status === 'posted' && !disputed;
  return (
    <li className="px-4 py-3 sm:px-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-slate-800">{txn.description}</div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <time className="text-xs text-slate-400" dateTime={dateIso}>
              {formatTxnDate(dateIso)}
            </time>
            <span className="text-slate-300" aria-hidden="true">
              ·
            </span>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
              {originLabel(txn.origin)}
            </span>
            {groupForStatus(txn.status) !== 'posted' && <StatusBadge status={txn.status} />}
            {disputed && <StatusBadge status="disputed" />}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div
            className={cn(
              'text-sm font-semibold tabular-nums',
              isCredit ? 'text-emerald-700' : 'text-slate-800',
            )}
          >
            {formatSignedMinor(txn.signedAmountMinor, currency)}
          </div>
          {showRunningBalance && txn.runningBalanceMinor !== null && (
            <div className="text-xs tabular-nums text-slate-400">
              {formatMinor(txn.runningBalanceMinor, currency)}
            </div>
          )}
          {canDispute && !showForm && (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="mt-1 text-xs font-medium text-brand-teal-dark hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal"
            >
              Dispute
            </button>
          )}
        </div>
      </div>
      {showForm && canDispute && (
        <DisputeForm
          ledgerEntryId={txn.id}
          onDisputed={() => {
            setShowForm(false);
            onDisputed(txn.id);
          }}
          onCancel={() => setShowForm(false)}
        />
      )}
    </li>
  );
}

function GroupSection({
  title,
  hint,
  transactions,
  currency,
  showRunningBalance,
  disputedIds,
  onDisputed,
}: {
  title: string;
  hint?: string;
  transactions: TransactionDTO[];
  currency: string;
  showRunningBalance: boolean;
  disputedIds: Set<string>;
  onDisputed: (ledgerEntryId: string) => void;
}) {
  if (transactions.length === 0) return null;
  return (
    <section className="mt-4">
      <div className="flex items-baseline justify-between px-1">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
        {hint && <span className="text-[11px] text-slate-400">{hint}</span>}
      </div>
      <ul className="mt-2 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {transactions.map((txn) => (
          <TransactionRow
            key={txn.id}
            txn={txn}
            currency={currency}
            showRunningBalance={showRunningBalance}
            disputed={txn.status === 'disputed' || disputedIds.has(txn.id)}
            onDisputed={onDisputed}
          />
        ))}
      </ul>
    </section>
  );
}

export function TransactionList({
  transactions,
  currency = 'USD',
}: {
  transactions: TransactionDTO[];
  currency?: string;
}) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [origin, setOrigin] = useState<'all' | LedgerOrigin>('all');
  // Entries disputed in THIS session (the server response isn't re-fetched here),
  // so the row immediately flips to a "Disputed" badge and drops the action.
  const [disputedIds, setDisputedIds] = useState<Set<string>>(() => new Set());
  const markDisputed = (id: string) =>
    setDisputedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });

  // Categories actually present, for a tidy filter dropdown.
  const origins = useMemo(() => {
    const set = new Set<LedgerOrigin>();
    for (const txn of transactions) set.add(txn.origin);
    return [...set].sort((a, b) => originLabel(a).localeCompare(originLabel(b)));
  }, [transactions]);

  const filtered = useMemo(
    () =>
      filterTransactions(transactions, {
        q: q.trim() || undefined,
        group: status === 'all' ? undefined : status,
        origin: origin === 'all' ? undefined : origin,
      }),
    [transactions, q, status, origin],
  );

  const pending = filtered.filter((t) => groupForStatus(t.status) === 'pending');
  const posted = filtered.filter((t) => groupForStatus(t.status) === 'posted');
  const other = filtered.filter((t) => groupForStatus(t.status) === 'other');

  const selectClass =
    'rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-700 focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal';

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex-1">
          <label htmlFor="txn-search" className="sr-only">
            Search transactions
          </label>
          <input
            id="txn-search"
            type="search"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Search transactions…"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal"
          />
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="txn-status" className="sr-only">
            Filter by status
          </label>
          <select
            id="txn-status"
            value={status}
            onChange={(event) => setStatus(event.target.value as StatusFilter)}
            className={selectClass}
          >
            <option value="all">All status</option>
            <option value="pending">Pending</option>
            <option value="posted">Posted</option>
          </select>
          <label htmlFor="txn-origin" className="sr-only">
            Filter by category
          </label>
          <select
            id="txn-origin"
            value={origin}
            onChange={(event) => setOrigin(event.target.value as 'all' | LedgerOrigin)}
            className={selectClass}
          >
            <option value="all">All categories</option>
            {origins.map((o) => (
              <option key={o} value={o}>
                {originLabel(o)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center text-sm text-slate-500">
          No transactions match your search.
        </div>
      ) : (
        <>
          <GroupSection
            title="Pending"
            hint="Not yet posted — may affect your available balance"
            transactions={pending}
            currency={currency}
            showRunningBalance={false}
            disputedIds={disputedIds}
            onDisputed={markDisputed}
          />
          <GroupSection
            title="Posted"
            transactions={posted}
            currency={currency}
            showRunningBalance
            disputedIds={disputedIds}
            onDisputed={markDisputed}
          />
          <GroupSection
            title="Other"
            hint="Failed or reversed — no balance effect"
            transactions={other}
            currency={currency}
            showRunningBalance={false}
            disputedIds={disputedIds}
            onDisputed={markDisputed}
          />
        </>
      )}
    </div>
  );
}

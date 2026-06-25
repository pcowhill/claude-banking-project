import { useMemo, useState } from 'react';
import {
  filterTransactions,
  formatMinor,
  groupForStatus,
  originLabel,
  type LedgerOrigin,
  type TransactionDTO,
  type TransactionGroup,
} from '@simbank/shared';
import { cn } from '../lib/cn';
import { formatSignedMinor, formatTxnDate, TXN_STATUS_META } from '../lib/account-display';

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

function TransactionRow({
  txn,
  currency,
  showRunningBalance,
}: {
  txn: TransactionDTO;
  currency: string;
  showRunningBalance: boolean;
}) {
  const isCredit = txn.signedAmountMinor >= 0;
  const dateIso = txn.postedAt ?? txn.createdAt;
  return (
    <li className="flex items-start justify-between gap-3 px-4 py-3 sm:px-6">
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
      </div>
    </li>
  );
}

function GroupSection({
  title,
  hint,
  transactions,
  currency,
  showRunningBalance,
}: {
  title: string;
  hint?: string;
  transactions: TransactionDTO[];
  currency: string;
  showRunningBalance: boolean;
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
          />
          <GroupSection
            title="Posted"
            transactions={posted}
            currency={currency}
            showRunningBalance
          />
          <GroupSection
            title="Other"
            hint="Failed or reversed — no balance effect"
            transactions={other}
            currency={currency}
            showRunningBalance={false}
          />
        </>
      )}
    </div>
  );
}

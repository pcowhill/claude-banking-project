import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  formatMinor,
  type AccountStatementsResponse,
  type AccountSummary,
  type StatementPeriodDTO,
} from '@simbank/shared';
import { Card, CardDescription, CardTitle } from '../components/ui/Card';
import { BackendStatusPill } from '../components/BackendStatusPill';
import { accountTypeLabel } from '../lib/account-display';
import { fetchAccounts } from '../lib/auth';
import { fetchAccountStatements } from '../lib/schedules';

/**
 * Statements — a real, clearly-SIMULATED per-account statement view (v0.9.0).
 *
 * Replaces the v0.4.0 placeholder. The customer picks one of their accounts and
 * we fetch GET /api/accounts/:id/statements, which derives monthly PERIODS over
 * the account's posted ledger as-of the simulation clock. Each period shows the
 * opening/closing balances, period credits/debits, and a settled-entry count —
 * all via the shared `formatMinor`; nothing is stored and there is no real PDF.
 *
 * Loading / empty / 403 (no access) / offline states keep the page honest. Lives
 * at /statements, reachable from the dashboard quick links as before.
 */

// ---- Shared async state -----------------------------------------------------

interface AsyncData<T> {
  loading: boolean;
  /** null = request failed (offline / unauthorized). */
  data: T | null;
}

/** Format an ISO timestamp as a long date, tolerating a bad value. */
function formatAsOf(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'short' });
}

const inputClasses =
  'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal disabled:cursor-not-allowed disabled:bg-slate-50';

// ---- Statements result (per selected account) -------------------------------

/**
 * The fetch result for the selected account's statements. `code` lets the view
 * tell apart "no access" (forbidden) / "not found" from "offline" so it can show
 * the right message; `data` is present only on success.
 */
interface StatementsState {
  loading: boolean;
  data: AccountStatementsResponse | null;
  /** A non-success error code, when the request failed. */
  code: string | null;
}

/** One statement period as a table row (all money via `formatMinor`). */
function StatementRow({ period }: { period: StatementPeriodDTO }) {
  return (
    <tr className="border-t border-slate-100">
      <th scope="row" className="py-3 pr-3 text-left text-sm font-medium text-slate-700">
        {period.label}
      </th>
      <td className="py-3 px-3 text-right text-sm text-slate-600 tabular-nums">
        {formatMinor(period.openingMinor)}
      </td>
      <td className="py-3 px-3 text-right text-sm text-emerald-700 tabular-nums">
        {formatMinor(period.creditsMinor)}
      </td>
      <td className="py-3 px-3 text-right text-sm text-rose-600 tabular-nums">
        {formatMinor(period.debitsMinor)}
      </td>
      <td className="py-3 px-3 text-right text-sm font-semibold text-brand-navy tabular-nums">
        {formatMinor(period.closingMinor)}
      </td>
      <td className="py-3 pl-3 text-right text-sm text-slate-500 tabular-nums">{period.count}</td>
    </tr>
  );
}

/** The periods table, or an empty state when there is no activity yet. */
function StatementsTable({ result }: { result: AccountStatementsResponse }) {
  return (
    <Card className="mt-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <CardTitle>Monthly statements</CardTitle>
        <span className="text-xs text-slate-500">As of {formatAsOf(result.asOf)}</span>
      </div>
      <CardDescription>
        Each period is derived from the same append-only ledger that powers your balances — every
        figure is reconcilable. Simulated: no real financial document or downloadable PDF.
      </CardDescription>

      {result.periods.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
          No statement periods for this account yet.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[34rem] border-collapse">
            <caption className="sr-only">
              Monthly statement periods with opening balance, credits, debits, closing balance, and
              settled entry count.
            </caption>
            <thead>
              <tr className="text-xs uppercase tracking-wide text-slate-500">
                <th scope="col" className="py-2 pr-3 text-left font-semibold">
                  Period
                </th>
                <th scope="col" className="py-2 px-3 text-right font-semibold">
                  Opening
                </th>
                <th scope="col" className="py-2 px-3 text-right font-semibold">
                  Credits
                </th>
                <th scope="col" className="py-2 px-3 text-right font-semibold">
                  Debits
                </th>
                <th scope="col" className="py-2 px-3 text-right font-semibold">
                  Closing
                </th>
                <th scope="col" className="py-2 pl-3 text-right font-semibold">
                  Entries
                </th>
              </tr>
            </thead>
            <tbody>
              {result.periods.map((period) => (
                <StatementRow key={period.key} period={period} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/** Loading / forbidden / offline / table wrapper for the selected account. */
function StatementsArea({ state }: { state: StatementsState }) {
  if (state.loading) {
    return (
      <Card className="mt-6 animate-pulse" aria-busy="true">
        <div className="h-4 w-40 rounded bg-slate-100" />
        <div className="mt-4 h-6 w-full rounded bg-slate-100" />
        <div className="mt-3 h-6 w-full rounded bg-slate-100" />
        <div className="mt-3 h-6 w-2/3 rounded bg-slate-100" />
      </Card>
    );
  }
  if (state.data) return <StatementsTable result={state.data} />;

  // Forbidden / not found: a benign "no access" message rather than an error red.
  if (state.code === 'forbidden' || state.code === 'not_found') {
    return (
      <Card className="mt-6 border-dashed">
        <CardTitle>Statements unavailable for this account</CardTitle>
        <CardDescription>
          You don’t have access to statements for that account. Choose one of your own accounts.
        </CardDescription>
      </Card>
    );
  }
  // Anything else (network / unknown) — offline-style guidance.
  return (
    <Card className="mt-6 border-rose-200 bg-rose-50">
      <CardTitle className="text-rose-700">Statements unavailable</CardTitle>
      <CardDescription className="text-rose-600">
        We could not load statements right now. The backend may be offline — start it with{' '}
        <code className="font-mono">npm run dev</code> and refresh.
      </CardDescription>
    </Card>
  );
}

// ---- Page -------------------------------------------------------------------

export function Statements() {
  const [accounts, setAccounts] = useState<AsyncData<AccountSummary[]>>({
    loading: true,
    data: null,
  });
  const [selectedId, setSelectedId] = useState('');
  const [statements, setStatements] = useState<StatementsState>({
    loading: false,
    data: null,
    code: null,
  });

  // Load the accounts once; default the selection to the first account.
  useEffect(() => {
    let active = true;
    void fetchAccounts().then((data) => {
      if (!active) return;
      setAccounts({ loading: false, data });
      if (data && data.length > 0) setSelectedId(data[0].id);
    });
    return () => {
      active = false;
    };
  }, []);

  // Fetch statements whenever the selected account changes.
  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    setStatements({ loading: true, data: null, code: null });
    void fetchAccountStatements(selectedId).then((result) => {
      if (!active) return;
      setStatements(
        result.ok
          ? { loading: false, data: result.data, code: null }
          : { loading: false, data: null, code: result.code },
      );
    });
    return () => {
      active = false;
    };
  }, [selectedId]);

  const selectedAccount = accounts.data?.find((a) => a.id === selectedId) ?? null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-1 text-sm font-medium text-brand-teal-dark hover:underline"
          >
            <span aria-hidden="true">←</span> Back to dashboard
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-brand-navy">Statements &amp; documents</h1>
          <p className="text-sm text-slate-600">
            Monthly statements for your simulated accounts, derived from the simulation clock.
          </p>
        </div>
        <BackendStatusPill />
      </div>

      <div className="mt-5 rounded-lg border border-brand-gold/40 bg-brand-gold/10 px-4 py-2 text-xs text-brand-ink">
        <strong>SIMULATION</strong> — these are not real financial documents and there is nothing to
        download. Every figure is derived read-only from an append-only ledger, as of the simulation
        clock’s current date.
      </div>

      {accounts.loading ? (
        <Card className="mt-6 animate-pulse" aria-busy="true">
          <div className="h-4 w-40 rounded bg-slate-100" />
          <div className="mt-4 h-10 w-full rounded bg-slate-100" />
        </Card>
      ) : accounts.data === null ? (
        <Card className="mt-6 border-rose-200 bg-rose-50">
          <CardTitle className="text-rose-700">Accounts unavailable</CardTitle>
          <CardDescription className="text-rose-600">
            We could not load your accounts. The backend may be offline — start it with{' '}
            <code className="font-mono">npm run dev</code> and refresh.
          </CardDescription>
        </Card>
      ) : accounts.data.length === 0 ? (
        <Card className="mt-6 border-dashed">
          <CardTitle>No accounts yet</CardTitle>
          <CardDescription>
            You do not have any accounts in this simulation yet, so there are no statements to show.
          </CardDescription>
        </Card>
      ) : (
        <>
          <Card className="mt-6">
            <label
              htmlFor="statements-account"
              className="block text-sm font-medium text-slate-700"
            >
              Account
            </label>
            <select
              id="statements-account"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className={inputClasses}
            >
              {accounts.data.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} · {accountTypeLabel(account.type)}
                </option>
              ))}
            </select>
            {selectedAccount && (
              <p className="mt-2 text-xs text-slate-500">
                Showing monthly statements for{' '}
                <span className="font-medium text-slate-600">{selectedAccount.name}</span>.
              </p>
            )}
          </Card>

          <StatementsArea state={statements} />
        </>
      )}

      <p className="mt-8 rounded-lg border border-brand-gold/40 bg-brand-gold/10 px-4 py-2 text-xs text-brand-ink">
        Statements are generated from the same append-only ledger that powers your balances — so
        every figure is reconcilable. This is a simulation: no real money or documents are involved.
      </p>
    </div>
  );
}

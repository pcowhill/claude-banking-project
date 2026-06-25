import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  formatMinor,
  type AccountSummary,
  type LoginEventDTO,
} from '@simbank/shared';
import { Card, CardDescription, CardTitle } from '../components/ui/Card';
import { BackendStatusPill } from '../components/BackendStatusPill';
import { cn } from '../lib/cn';
import { accountTypeLabel, RELATIONSHIP_META } from '../lib/account-display';
import { useAuth } from '../lib/auth-context';
import { fetchAccounts, fetchLoginHistory } from '../lib/auth';

/**
 * Authenticated dashboard — the accounts OVERVIEW (v0.4.0, task D-04). Lists
 * every account the user may see with ledger-DERIVED balances and a combined
 * total, each linking into its detail + transaction history. Recent sign-in
 * activity is retained from v0.2.0. Every section degrades across
 * loading/empty/offline so the page stays honest when the backend is down.
 */

/** Generic async-fetch state for the dashboard's two data sections. */
interface AsyncData<T> {
  loading: boolean;
  /** null = request failed (backend offline or unauthorized). */
  data: T | null;
}

/** Friendly description of a login attempt's outcome. */
function describeLoginEvent(event: LoginEventDTO): string {
  if (event.success) return 'Signed in successfully';
  switch (event.reason) {
    case 'invalid_credentials':
      return 'Failed sign-in — incorrect email or password';
    case 'account_locked':
      return 'Blocked — account temporarily locked';
    case 'account_disabled':
      return 'Blocked — account disabled';
    default:
      return 'Failed sign-in attempt';
  }
}

/** Format an ISO timestamp for display, tolerating a bad value. */
function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function AccountOverviewCard({ account }: { account: AccountSummary }) {
  const meta = RELATIONSHIP_META[account.relationship];
  const { balances } = account;
  return (
    <Link
      to={`/accounts/${account.id}`}
      className="group flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <CardTitle>{account.name}</CardTitle>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            {accountTypeLabel(account.type)}
          </span>
        </div>
        <span
          className={cn(
            'rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
            meta.className,
          )}
        >
          {meta.label}
        </span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">Available</div>
          <div className="text-2xl font-bold text-brand-navy tabular-nums">
            {formatMinor(balances.availableMinor, account.currency)}
          </div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">Current</div>
          <div className="text-2xl font-semibold text-slate-700 tabular-nums">
            {formatMinor(balances.currentMinor, account.currency)}
          </div>
        </div>
      </div>
      {balances.pendingDebitMinor + balances.heldMinor > 0 && (
        <CardDescription>
          Includes {formatMinor(balances.pendingDebitMinor + balances.heldMinor, account.currency)}{' '}
          pending/held.
        </CardDescription>
      )}
      <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-teal-dark group-hover:gap-2">
        View transactions <span aria-hidden="true">→</span>
      </span>
    </Link>
  );
}

function AccountsOverview({ state }: { state: AsyncData<AccountSummary[]> }) {
  if (state.loading) {
    return (
      <section className="mt-6 grid gap-4 md:grid-cols-2" aria-busy="true">
        {[0, 1].map((i) => (
          <Card key={i} className="animate-pulse">
            <div className="h-4 w-32 rounded bg-slate-100" />
            <div className="mt-6 h-8 w-24 rounded bg-slate-100" />
          </Card>
        ))}
      </section>
    );
  }

  if (state.data === null) {
    return (
      <Card className="mt-6 border-rose-200 bg-rose-50">
        <CardTitle className="text-rose-700">Accounts unavailable</CardTitle>
        <CardDescription className="text-rose-600">
          We could not load your accounts. The backend may be offline — start it with{' '}
          <code className="font-mono">npm run dev</code> and refresh.
        </CardDescription>
      </Card>
    );
  }

  if (state.data.length === 0) {
    return (
      <Card className="mt-6 border-dashed">
        <CardTitle>No accounts yet</CardTitle>
        <CardDescription>
          You do not have any accounts in this simulation yet. Seeded demo customers have accounts
          ready to explore.
        </CardDescription>
      </Card>
    );
  }

  // Combined available across every account the user can see (single currency in
  // the simulation today, so a plain sum is correct).
  const currency = state.data[0]?.currency ?? 'USD';
  const totalAvailable = state.data.reduce((sum, a) => sum + a.balances.availableMinor, 0);

  return (
    <section className="mt-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">
            Total available across your accounts
          </div>
          <div className="text-3xl font-bold text-brand-navy tabular-nums">
            {formatMinor(totalAvailable, currency)}
          </div>
        </div>
        <span className="text-xs text-slate-400">
          {state.data.length} {state.data.length === 1 ? 'account' : 'accounts'}
        </span>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {state.data.map((account) => (
          <AccountOverviewCard key={account.id} account={account} />
        ))}
      </div>
    </section>
  );
}

function LoginHistorySection({ state }: { state: AsyncData<LoginEventDTO[]> }) {
  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold text-brand-navy">Recent sign-in activity</h2>
      <Card className="mt-3 p-0">
        {state.loading ? (
          <div className="p-6 text-sm text-slate-500">Loading recent activity…</div>
        ) : state.data === null ? (
          <div className="p-6 text-sm text-slate-500">Sign-in history is unavailable right now.</div>
        ) : state.data.length === 0 ? (
          <div className="p-6 text-sm text-slate-500">No sign-in activity recorded yet.</div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {state.data.map((event) => (
              <li key={event.id} className="flex items-center justify-between gap-3 px-6 py-3">
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      'h-2 w-2 shrink-0 rounded-full',
                      event.success ? 'bg-emerald-500' : 'bg-rose-400',
                    )}
                    aria-hidden="true"
                  />
                  <div>
                    <div className="text-sm text-slate-700">{describeLoginEvent(event)}</div>
                    {event.ip && <div className="text-xs text-slate-400">from {event.ip}</div>}
                  </div>
                </div>
                <time className="shrink-0 text-xs text-slate-500" dateTime={event.createdAt}>
                  {formatTimestamp(event.createdAt)}
                </time>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </section>
  );
}

export function Dashboard() {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<AsyncData<AccountSummary[]>>({ loading: true, data: null });
  const [history, setHistory] = useState<AsyncData<LoginEventDTO[]>>({ loading: true, data: null });

  useEffect(() => {
    let active = true;
    void fetchAccounts().then((data) => {
      if (active) setAccounts({ loading: false, data });
    });
    void fetchLoginHistory().then((data) => {
      if (active) setHistory({ loading: false, data });
    });
    return () => {
      active = false;
    };
  }, []);

  const greetingName = user?.displayName ?? 'there';

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand-navy">Welcome back, {greetingName}</h1>
          <p className="text-sm text-slate-600">
            Your simulated accounts, balances, and recent activity.
          </p>
        </div>
        <BackendStatusPill />
      </div>

      <div className="mt-6 rounded-lg border border-brand-gold/40 bg-brand-gold/10 px-4 py-2 text-xs text-brand-ink">
        Balances are DERIVED on the server from an append-only ledger — never stored as an editable
        number. This is a simulation: no real money or accounts.
      </div>

      <AccountsOverview state={accounts} />

      {/* Quick links */}
      <section className="mt-8">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Link
            to="/statements"
            className="rounded-lg border border-slate-200 bg-white p-4 text-sm shadow-sm transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal"
          >
            <div className="font-medium text-brand-navy">Statements &amp; documents</div>
            <div className="mt-0.5 text-xs text-slate-500">Monthly statements (coming soon)</div>
          </Link>
          {[
            ['Transfers', 'v0.7.0'],
            ['Bill pay', 'v0.7.0'],
            ['Cards & fraud', 'v0.8.0'],
          ].map(([label, milestone]) => (
            <div
              key={label}
              className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500"
            >
              <div className="font-medium text-slate-700">{label}</div>
              <div className="text-xs">{milestone}</div>
            </div>
          ))}
        </div>
      </section>

      <LoginHistorySection state={history} />
    </div>
  );
}

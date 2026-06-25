import { deriveBalances, formatMinor, toMinor, type LedgerEntryLike } from '@simbank/shared';
import { Card, CardDescription, CardTitle } from '../components/ui/Card';
import { BackendStatusPill } from '../components/BackendStatusPill';

/**
 * Placeholder authenticated dashboard. There is no real auth or live data yet
 * (that arrives in v0.2.0 / v0.4.0). To keep the UI honest about the ledger
 * model, balances here are DERIVED from sample ledger entries — never stored as
 * an editable number — using the same shared logic the backend will use.
 */
interface DemoAccount {
  name: string;
  type: string;
  entries: LedgerEntryLike[];
}

const demoAccounts: DemoAccount[] = [
  {
    name: 'Everyday Checking',
    type: 'checking',
    entries: [
      { amountMinor: toMinor(2500), direction: 'credit', status: 'posted' },
      { amountMinor: toMinor(84.2), direction: 'debit', status: 'posted' },
      { amountMinor: toMinor(200), direction: 'debit', status: 'posted' },
      { amountMinor: toMinor(25), direction: 'debit', status: 'pending' },
    ],
  },
  {
    name: 'Goal Savings',
    type: 'savings',
    entries: [
      { amountMinor: toMinor(5000), direction: 'credit', status: 'posted' },
      { amountMinor: toMinor(200), direction: 'credit', status: 'posted' },
      { amountMinor: toMinor(4.17), direction: 'credit', status: 'posted' },
    ],
  },
];

export function Dashboard() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand-navy">Welcome back, Avery</h1>
          <p className="text-sm text-slate-600">
            Dashboard shell · live accounts and transactions arrive in v0.4.0.
          </p>
        </div>
        <BackendStatusPill />
      </div>

      <div className="mt-6 rounded-lg border border-brand-gold/40 bg-brand-gold/10 px-4 py-2 text-xs text-brand-ink">
        Demo data shown below is computed from sample ledger entries using the shared
        derive-balances logic. No real authentication is in place yet (v0.2.0).
      </div>

      <section className="mt-6 grid gap-4 md:grid-cols-2">
        {demoAccounts.map((account) => {
          const balances = deriveBalances(account.entries);
          return (
            <Card key={account.name}>
              <div className="flex items-center justify-between">
                <CardTitle>{account.name}</CardTitle>
                <span className="rounded bg-brand-mist px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-500">
                  {account.type}
                </span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-500">Available</div>
                  <div className="text-2xl font-bold text-brand-navy">
                    {formatMinor(balances.availableMinor)}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-500">Current</div>
                  <div className="text-2xl font-semibold text-slate-700">
                    {formatMinor(balances.currentMinor)}
                  </div>
                </div>
              </div>
              {balances.pendingDebitMinor > 0 && (
                <CardDescription>
                  Includes {formatMinor(balances.pendingDebitMinor)} in pending holds.
                </CardDescription>
              )}
            </Card>
          );
        })}
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-brand-navy">Coming soon</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['Transfers', 'v0.7.0'],
            ['Bill pay', 'v0.7.0'],
            ['Mobile deposit', 'v0.7.0'],
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
    </div>
  );
}

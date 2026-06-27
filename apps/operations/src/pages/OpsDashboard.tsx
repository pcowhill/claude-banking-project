import { Link } from 'react-router-dom';
import {
  isRequestReversed,
  isTerminalOpsStatus,
  OPS_REQUEST_STATUSES,
  opsStatusLabel,
  opsTypeLabel,
} from '@simbank/shared';
import { Card } from '../components/ui/Card';
import { StatusBadge, PriorityBadge, ReversedBadge } from '../components/badges';
import { OpsActivityFeed } from '../components/OpsActivityFeed';
import { useAuth } from '../lib/auth-context';
import { useOpsSummary } from '../lib/useOpsSummary';
import { useOpsData } from '../lib/ops-data-context';
import { relativeTime } from '../lib/format';
import { cn } from '../lib/cn';

/** One overview tile in the top strip. */
function SummaryStat({
  label,
  value,
  loading,
  accent,
}: {
  label: string;
  value: number | undefined;
  loading: boolean;
  accent?: boolean;
}) {
  return (
    <Card className="flex flex-col gap-1 py-4">
      <span className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</span>
      <span
        className={cn(
          'text-2xl font-bold tabular-nums',
          accent && value ? 'text-brand-gold-soft' : 'text-white',
        )}
      >
        {loading ? '—' : (value ?? 0)}
      </span>
    </Card>
  );
}

export function OpsDashboard() {
  const { user } = useAuth();
  const { loading: summaryLoading, summary } = useOpsSummary();
  const { requests, counts, events, connected } = useOpsData();

  const open = requests.filter((r) => !isTerminalOpsStatus(r.status));
  const needsAttention = open.slice(0, 5);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Operations overview</h1>
          <p className="mt-1 text-sm text-slate-400">
            {user ? `Signed in as ${user.displayName}. ` : ''}Simulate the bank-side of every customer
            action. Counts and queues below are live.
          </p>
        </div>
        <span
          className={cn(
            'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs',
            connected
              ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
              : 'border-amber-400/30 bg-amber-400/10 text-amber-200',
          )}
        >
          <span className={cn('h-2 w-2 rounded-full', connected ? 'bg-emerald-400' : 'bg-amber-400')} />
          {connected ? 'Live' : 'Reconnecting…'}
        </span>
      </div>

      {/* Platform counts */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
          Platform overview
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryStat label="Customers & staff" value={summary?.users} loading={summaryLoading} />
          <SummaryStat label="Accounts" value={summary?.accounts} loading={summaryLoading} />
          <SummaryStat label="Open requests" value={open.length} loading={false} />
          <SummaryStat
            label="Locked accounts"
            value={summary?.lockedAccounts}
            loading={summaryLoading}
            accent
          />
        </div>
      </section>

      {/* Queue snapshot */}
      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
            Request queue
          </h2>
          <Link to="/queues" className="text-xs font-semibold text-brand-teal hover:underline">
            Open queues →
          </Link>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {OPS_REQUEST_STATUSES.map((status) => (
            <Card key={status} className="flex flex-col gap-1 py-3">
              <span className="text-[11px] uppercase tracking-wide text-slate-500">
                {opsStatusLabel(status)}
              </span>
              <span className="text-xl font-bold tabular-nums text-white">{counts[status]}</span>
            </Card>
          ))}
        </div>

        <Card className="mt-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Needs attention
          </h3>
          {needsAttention.length === 0 ? (
            <p className="mt-2 text-xs text-slate-500">The queue is clear. 🎉</p>
          ) : (
            <ul className="mt-2 divide-y divide-white/10">
              {needsAttention.map((request) => (
                <li key={request.id} className="flex items-center justify-between gap-3 py-2">
                  <Link to="/queues" className="min-w-0 hover:underline">
                    <div className="text-[10px] uppercase tracking-wide text-slate-500">
                      {opsTypeLabel(request.type)}
                    </div>
                    <div className="truncate text-sm text-white">{request.summary}</div>
                  </Link>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <PriorityBadge priority={request.priority} />
                    <StatusBadge status={request.status} />
                    {isRequestReversed(request.payload) && <ReversedBadge />}
                    <span className="text-[10px] text-slate-500">{relativeTime(request.createdAt)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      {/* Recent simulated events */}
      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
            Recent simulated events
          </h2>
          <Link to="/messaging" className="text-xs font-semibold text-brand-teal hover:underline">
            Simulated messaging →
          </Link>
        </div>
        <Card className="mt-3">
          <OpsActivityFeed events={events} limit={6} emptyHint="No simulated events yet." />
        </Card>
      </section>
    </div>
  );
}

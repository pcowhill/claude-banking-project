import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { useAuth } from '../lib/auth-context';
import { useOpsSummary } from '../lib/useOpsSummary';
import { cn } from '../lib/cn';

/**
 * Operations dashboard SHELL. The live overview counts (v0.2.0) sit at the top;
 * the queues, actions, simulation controls and simulated external responses are
 * placeholders that become live and WebSocket-driven starting in v0.5.0. The
 * structure intentionally mirrors the real workflow so future milestones slot in
 * without re-architecting.
 */
const queues = [
  { key: 'onboarding', label: 'Onboarding & identity', pending: 0, milestone: 'v0.6.0' },
  { key: 'deposits', label: 'Deposits & mobile checks', pending: 0, milestone: 'v0.7.0' },
  { key: 'ach', label: 'ACH transfers', pending: 0, milestone: 'v0.7.0' },
  { key: 'wires', label: 'Wire transfers', pending: 0, milestone: 'v0.7.0' },
  { key: 'fraud', label: 'Fraud alerts', pending: 0, milestone: 'v0.8.0' },
  { key: 'disputes', label: 'Disputes', pending: 0, milestone: 'v0.8.0' },
  { key: 'support', label: 'Support messages', pending: 0, milestone: 'v0.5.0' },
  { key: 'password', label: 'Password resets', pending: 0, milestone: 'v0.2.0' },
];

const simControls = [
  'Inject random transaction',
  'Trigger fraud alert',
  'Place account hold',
  'Create failed payment',
  'Simulate monthly interest',
  'Generate statement cycle',
  'Fast-forward simulation time',
];

const simulatedResponses = [
  { channel: 'SMS code', detail: 'Deliver / fail a one-time passcode' },
  { channel: 'Email message', detail: 'Send a simulated notification' },
  { channel: 'MFA / identity', detail: 'Approve or reject verification' },
  { channel: 'ACH network', detail: 'Return success / NSF / R01…' },
  { channel: 'Wire network', detail: 'Approve / reject / hold' },
  { channel: 'Check image', detail: 'Accept / reject deposit' },
];

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

/** Live operations counts from `GET /api/ops/summary` (ops_agent / admin). */
function OverviewStrip() {
  const { loading, summary, error } = useOpsSummary();

  return (
    <section>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
        Platform overview
      </h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryStat label="Customers & staff" value={summary?.users} loading={loading} />
        <SummaryStat label="Accounts" value={summary?.accounts} loading={loading} />
        <SummaryStat label="Pending requests" value={summary?.pendingRequests} loading={loading} />
        <SummaryStat
          label="Locked accounts"
          value={summary?.lockedAccounts}
          loading={loading}
          accent
        />
      </div>
      {error && (
        <p className="mt-2 text-xs text-rose-300/80">{error}</p>
      )}
    </section>
  );
}

export function OpsDashboard() {
  const { user } = useAuth();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-white">Operations overview</h1>
        <p className="mt-1 text-sm text-slate-400">
          {user ? `Signed in as ${user.displayName}. ` : ''}Simulate the bank-side of every customer
          action. The counts below are live; the queues and controls are placeholders that light up
          in later milestones.
        </p>
      </div>

      {/* Live platform counts (v0.2.0) */}
      <OverviewStrip />

      {/* Request queues */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
          Pending request queues
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {queues.map((queue) => (
            <Card key={queue.key} className="flex flex-col gap-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-sm font-semibold text-white">{queue.label}</div>
                  <div className="text-[10px] uppercase tracking-wide text-slate-500">
                    arrives {queue.milestone}
                  </div>
                </div>
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-bold text-slate-300">
                  {queue.pending}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Button variant="approve" size="sm" disabled>
                  Approve
                </Button>
                <Button variant="reject" size="sm" disabled>
                  Reject
                </Button>
                <Button variant="hold" size="sm" disabled>
                  Hold
                </Button>
                <Button variant="ghost" size="sm" disabled>
                  Request info
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Scenario / simulation controls */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
            Scenario controls
          </h2>
          <Card className="mt-3">
            <div className="flex flex-wrap gap-2">
              {simControls.map((control) => (
                <Button key={control} variant="ghost" size="sm" disabled>
                  {control}
                </Button>
              ))}
            </div>
            <p className="mt-3 text-xs text-slate-500">
              These drive the disciplined ledger and fraud engine in later milestones (v0.5.0+).
            </p>
          </Card>
        </section>

        {/* Simulated external responses */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
            Simulated external responses
          </h2>
          <Card className="mt-3">
            <ul className="divide-y divide-white/10">
              {simulatedResponses.map((item) => (
                <li key={item.channel} className="flex items-center justify-between py-2">
                  <div>
                    <div className="text-sm text-white">{item.channel}</div>
                    <div className="text-xs text-slate-500">{item.detail}</div>
                  </div>
                  <Button variant="ghost" size="sm" disabled>
                    Send
                  </Button>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      </div>
    </div>
  );
}

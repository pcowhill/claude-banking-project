import { useMemo, useState } from 'react';
import {
  OPS_QUEUES,
  OPS_REQUEST_STATUSES,
  opsStatusLabel,
  queueForType,
  type OpsAction,
  type OpsRequestStatus,
} from '@simbank/shared';
import { ApiError } from '../lib/api';
import { useOpsData } from '../lib/ops-data-context';
import { QueueRequestCard } from '../components/QueueRequestCard';
import { RequestDetailPanel } from '../components/RequestDetailPanel';
import { cn } from '../lib/cn';

type StatusFilter = OpsRequestStatus | 'all';
type LaneFilter = string; // queue lane key or 'all'

/** A small filter chip. */
function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full px-3 py-1 text-xs font-semibold transition-colors',
        active ? 'bg-brand-teal text-white' : 'bg-white/5 text-slate-300 hover:bg-white/10',
      )}
    >
      {children}
    </button>
  );
}

export function RequestQueues() {
  const { requests, counts, loading, error, connected, act } = useOpsData();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [laneFilter, setLaneFilter] = useState<LaneFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [actionError, setActionError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return requests.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (laneFilter !== 'all' && queueForType(r.type) !== laneFilter) return false;
      return true;
    });
  }, [requests, statusFilter, laneFilter]);

  async function runAction(id: string, action: OpsAction) {
    setActionError(null);
    setBusyIds((prev) => new Set(prev).add(id));
    try {
      await act(id, action);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'That action could not be completed.');
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Request queues</h1>
          <p className="mt-1 text-sm text-slate-400">
            Live work items from the simulated bank. Approve, reject, hold, or request more
            information — every action is audited. SIMULATION: actions change workflow state only and
            never move money.
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

      {/* Status filters with live counts */}
      <div className="flex flex-wrap gap-1.5">
        <Chip active={statusFilter === 'all'} onClick={() => setStatusFilter('all')}>
          All ({requests.length})
        </Chip>
        {OPS_REQUEST_STATUSES.map((status) => (
          <Chip
            key={status}
            active={statusFilter === status}
            onClick={() => setStatusFilter(status)}
          >
            {opsStatusLabel(status)} ({counts[status]})
          </Chip>
        ))}
      </div>

      {/* Queue-lane filters */}
      <div className="flex flex-wrap gap-1.5">
        <Chip active={laneFilter === 'all'} onClick={() => setLaneFilter('all')}>
          All queues
        </Chip>
        {OPS_QUEUES.map((lane) => (
          <Chip key={lane.key} active={laneFilter === lane.key} onClick={() => setLaneFilter(lane.key)}>
            {lane.label}
          </Chip>
        ))}
      </div>

      {actionError && <p className="text-sm text-rose-300/90">{actionError}</p>}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* Queue list */}
        <div className="space-y-3">
          {loading && <p className="text-sm text-slate-500">Loading queue…</p>}
          {!loading && error && <p className="text-sm text-rose-300/90">{error}</p>}
          {!loading && !error && filtered.length === 0 && (
            <p className="text-sm text-slate-500">No requests match this filter.</p>
          )}
          {filtered.map((request) => (
            <QueueRequestCard
              key={request.id}
              request={request}
              selected={selectedId === request.id}
              busy={busyIds.has(request.id)}
              onSelect={() => setSelectedId(request.id)}
              onAction={(action) => runAction(request.id, action)}
            />
          ))}
        </div>

        {/* Detail panel */}
        <div className="lg:sticky lg:top-6 lg:self-start">
          {selectedId ? (
            <RequestDetailPanel requestId={selectedId} onClose={() => setSelectedId(null)} />
          ) : (
            <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-xs text-slate-500">
              Select a request to see its history, linked simulated events, and add a note.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

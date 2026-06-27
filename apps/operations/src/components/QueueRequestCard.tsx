import {
  isRequestReversed,
  opsTypeLabel,
  type OperationsRequestDTO,
  type OpsAction,
} from '@simbank/shared';
import { Card } from './ui/Card';
import { StatusBadge, PriorityBadge, ReversedBadge } from './badges';
import { ActionBar } from './ActionBar';
import { relativeTime } from '../lib/format';
import { cn } from '../lib/cn';

/**
 * One queue work item: type + summary + subject, status/priority badges, and the
 * operator action bar (quick actions, no note). Clicking the body selects the
 * item to open its detail panel. SIMULATION: acting changes workflow state only.
 */
export function QueueRequestCard({
  request,
  selected,
  busy,
  onSelect,
  onAction,
}: {
  request: OperationsRequestDTO;
  selected?: boolean;
  busy?: boolean;
  onSelect: () => void;
  onAction: (action: OpsAction) => void;
}) {
  return (
    <Card
      data-testid="queue-card"
      className={cn(
        'flex flex-col gap-3 transition-colors',
        selected && 'ring-2 ring-brand-teal/60',
      )}
    >
      <button type="button" onClick={onSelect} className="text-left focus:outline-none">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              {opsTypeLabel(request.type)}
            </div>
            <div data-testid="queue-summary" className="truncate text-sm font-semibold text-white">
              {request.summary}
            </div>
            {request.subjectName && (
              <div className="truncate text-xs text-slate-400">{request.subjectName}</div>
            )}
          </div>
          <span className="shrink-0 text-[10px] text-slate-500">{relativeTime(request.createdAt)}</span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <StatusBadge status={request.status} />
          {isRequestReversed(request.payload) && <ReversedBadge />}
          <PriorityBadge priority={request.priority} />
        </div>
      </button>

      <ActionBar status={request.status} busy={busy} onAction={onAction} />
    </Card>
  );
}

import {
  channelLabel,
  opsStatusLabel,
  OPS_PRIORITY_LABELS,
  type OpsRequestPriority,
  type OpsRequestStatus,
  type SimEventChannel,
  type SimEventStatus,
} from '@simbank/shared';
import { cn } from '../lib/cn';

/** A small pill. */
function Pill({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
        className,
      )}
    >
      {children}
    </span>
  );
}

const STATUS_CLASSES: Record<OpsRequestStatus, string> = {
  pending: 'bg-amber-400/15 text-amber-200',
  approved: 'bg-emerald-400/15 text-emerald-200',
  rejected: 'bg-rose-400/15 text-rose-200',
  on_hold: 'bg-sky-400/15 text-sky-200',
  info_requested: 'bg-violet-400/15 text-violet-200',
};

export function StatusBadge({ status }: { status: OpsRequestStatus }) {
  return <Pill className={STATUS_CLASSES[status]}>{opsStatusLabel(status)}</Pill>;
}

/**
 * Secondary tag shown ALONGSIDE the status badge when a request's money movement
 * was reversed (operator reversal, dispute upheld, or confirmed fraud). The
 * request stays terminal "Approved"; this pill explains the after-the-fact undo.
 * Decide whether to render via the shared `isRequestReversed(payload)` helper.
 */
export function ReversedBadge() {
  return <Pill className="bg-amber-500/15 text-amber-200">Reversed</Pill>;
}

const PRIORITY_CLASSES: Record<OpsRequestPriority, string> = {
  high: 'bg-rose-500/20 text-rose-200',
  normal: 'bg-white/10 text-slate-300',
  low: 'bg-white/5 text-slate-400',
};

export function PriorityBadge({ priority }: { priority: OpsRequestPriority }) {
  if (priority === 'normal') return null; // de-emphasize the common case
  return <Pill className={PRIORITY_CLASSES[priority]}>{OPS_PRIORITY_LABELS[priority]} priority</Pill>;
}

const CHANNEL_CLASSES: Record<SimEventChannel, string> = {
  sms: 'bg-teal-400/15 text-teal-200',
  email: 'bg-indigo-400/15 text-indigo-200',
  mfa: 'bg-amber-400/15 text-amber-200',
  identity: 'bg-violet-400/15 text-violet-200',
};

export function ChannelBadge({ channel }: { channel: SimEventChannel }) {
  return <Pill className={CHANNEL_CLASSES[channel]}>{channelLabel(channel)}</Pill>;
}

const EVENT_STATUS_CLASSES: Record<SimEventStatus, string> = {
  sent: 'bg-white/10 text-slate-300',
  delivered: 'bg-emerald-400/15 text-emerald-200',
  failed: 'bg-rose-400/15 text-rose-200',
  pending: 'bg-amber-400/15 text-amber-200',
  approved: 'bg-emerald-400/15 text-emerald-200',
  rejected: 'bg-rose-400/15 text-rose-200',
};

export function EventStatusBadge({ status }: { status: SimEventStatus }) {
  return <Pill className={EVENT_STATUS_CLASSES[status]}>{status}</Pill>;
}

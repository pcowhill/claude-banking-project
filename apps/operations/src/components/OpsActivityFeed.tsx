import { type SimulatedEventDTO } from '@simbank/shared';
import { ChannelBadge, EventStatusBadge } from './badges';
import { relativeTime } from '../lib/format';

/**
 * A live feed of SIMULATED external events (SMS / email / MFA / identity). Every
 * row is clearly a simulation — no real provider is ever contacted.
 */
export function OpsActivityFeed({
  events,
  emptyHint = 'No simulated events yet.',
  limit,
}: {
  events: SimulatedEventDTO[];
  emptyHint?: string;
  limit?: number;
}) {
  const shown = limit ? events.slice(0, limit) : events;

  if (shown.length === 0) {
    return <p className="text-xs text-slate-500">{emptyHint}</p>;
  }

  return (
    <ul className="divide-y divide-white/10">
      {shown.map((event) => (
        <li key={event.id} className="flex items-start justify-between gap-3 py-2.5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <ChannelBadge channel={event.channel} />
              <EventStatusBadge status={event.status} />
              {event.direction === 'inbound' && (
                <span className="text-[10px] uppercase tracking-wide text-slate-500">inbound</span>
              )}
            </div>
            <div className="mt-1 truncate text-sm text-white">{event.summary}</div>
          </div>
          <span className="shrink-0 text-[10px] text-slate-500">{relativeTime(event.createdAt)}</span>
        </li>
      ))}
    </ul>
  );
}

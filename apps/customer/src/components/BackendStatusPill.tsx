import { useApiStatus } from '../lib/useApiStatus';
import { cn } from '../lib/cn';

/**
 * Small live indicator showing whether the local backend API is reachable.
 * Demonstrates the frontend <-> backend wiring established in v0.1.0 and
 * degrades gracefully when the API is offline.
 */
export function BackendStatusPill() {
  const { loading, status } = useApiStatus();

  const online = !!status;
  const label = loading
    ? 'Checking backend…'
    : online
      ? `Backend online · v${status?.version} · ${status?.database.connected ? 'db ready' : 'db not seeded'}`
      : 'Backend offline (run npm run dev)';

  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 shadow-sm">
      <span
        className={cn(
          'h-2 w-2 rounded-full',
          loading ? 'bg-slate-300' : online ? 'bg-emerald-500' : 'bg-rose-400',
        )}
      />
      {label}
    </span>
  );
}

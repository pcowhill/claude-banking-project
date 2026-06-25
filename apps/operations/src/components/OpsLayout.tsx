import type { ReactNode } from 'react';
import { APP_VERSION, MILESTONE, MILESTONE_NAME } from '@simbank/shared';
import { Logo } from './Logo';
import { SimulationBanner } from './SimulationBanner';
import { useApiStatus } from '../lib/useApiStatus';
import { cn } from '../lib/cn';

const navSections = [
  { label: 'Dashboard', active: true },
  { label: 'Request queues', active: false, milestone: 'v0.5.0' },
  { label: 'Simulation controls', active: false, milestone: 'v0.5.0' },
  { label: 'Simulated messaging', active: false, milestone: 'v0.5.0' },
  { label: 'Audit log', active: false, milestone: 'v0.5.0' },
  { label: 'Simulation clock', active: false, milestone: 'v0.9.0' },
];

function OpsStatus() {
  const { loading, status } = useApiStatus();
  const online = !!status;
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
      <span
        className={cn(
          'h-2 w-2 rounded-full',
          loading ? 'bg-slate-500' : online ? 'bg-emerald-400' : 'bg-rose-400',
        )}
      />
      {loading ? 'Connecting…' : online ? `API online · v${status?.version}` : 'API offline'}
    </span>
  );
}

export function OpsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <SimulationBanner />
      <header className="border-b border-white/10 bg-brand-navy-deep">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Logo className="h-8" />
            <span className="rounded bg-white/10 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-slate-300">
              Operations Simulator
            </span>
          </div>
          <OpsStatus />
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl flex-1 gap-6 px-4 py-6">
        <aside className="hidden w-56 shrink-0 lg:block">
          <nav className="space-y-1">
            {navSections.map((item) => (
              <div
                key={item.label}
                className={cn(
                  'flex items-center justify-between rounded-md px-3 py-2 text-sm',
                  item.active
                    ? 'bg-brand-teal/15 font-semibold text-white'
                    : 'text-slate-400',
                )}
              >
                <span>{item.label}</span>
                {item.milestone && (
                  <span className="text-[10px] text-slate-500">{item.milestone}</span>
                )}
              </div>
            ))}
          </nav>
        </aside>

        <main className="min-w-0 flex-1">{children}</main>
      </div>

      <footer className="border-t border-white/10 bg-brand-navy-deep">
        <div className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-4 text-xs text-slate-500 sm:flex-row sm:justify-between">
          <span>Meridian Operations Simulator — local simulation only, not a real bank system.</span>
          <span>
            v{APP_VERSION} · {MILESTONE} {MILESTONE_NAME}
          </span>
        </div>
      </footer>
    </div>
  );
}

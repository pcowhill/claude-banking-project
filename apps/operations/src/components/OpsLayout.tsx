import { useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { APP_VERSION, MILESTONE, MILESTONE_NAME } from '@simbank/shared';
import { Logo } from './Logo';
import { RoleBadge } from './RoleBadge';
import { SimulationBanner } from './SimulationBanner';
import { useApiStatus } from '../lib/useApiStatus';
import { useAuth } from '../lib/auth-context';
import { cn } from '../lib/cn';

interface NavItem {
  label: string;
  to: string;
  end: boolean;
  /** When true, only shown to admins. */
  adminOnly?: boolean;
}

/** Live console sections (v0.5.0+). `adminOnly` links are gated by role. */
const navLinks: NavItem[] = [
  { label: 'Dashboard', to: '/', end: true },
  { label: 'Request queues', to: '/queues', end: false },
  { label: 'Simulated messaging', to: '/messaging', end: false },
  { label: 'Create demo user', to: '/admin', end: false, adminOnly: true },
];

/** Sections that arrive in later milestones (shown dimmed). */
const futureNav = [
  { label: 'Audit log', milestone: 'v0.6.0' },
  { label: 'Simulation clock', milestone: 'v0.9.0' },
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

/** Signed-in operator identity + log out, shown in the header. */
function OperatorMenu() {
  const { user, logout } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  if (!user) return null;

  async function handleLogout() {
    setSigningOut(true);
    try {
      await logout();
    } finally {
      // On logout the app swaps back to the login screen; reset for safety in
      // case this component is still mounted.
      setSigningOut(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <div className="hidden flex-col items-end leading-tight sm:flex">
        <span className="text-sm font-semibold text-white">{user.displayName}</span>
        <span className="text-[11px] text-slate-400">{user.email}</span>
      </div>
      <RoleBadge role={user.role} />
      <button
        type="button"
        onClick={handleLogout}
        disabled={signingOut}
        className={cn(
          'rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-semibold text-slate-200 transition-colors',
          'hover:bg-white/10',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2 focus-visible:ring-offset-brand-navy-deep',
          'disabled:pointer-events-none disabled:opacity-40',
        )}
      >
        {signingOut ? 'Signing out…' : 'Log out'}
      </button>
    </div>
  );
}

export function OpsLayout({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const visibleNav = navLinks.filter((item) => !item.adminOnly || isAdmin);

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
          <div className="flex items-center gap-4">
            <OpsStatus />
            <OperatorMenu />
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl flex-1 gap-6 px-4 py-6">
        <aside className="hidden w-56 shrink-0 lg:block">
          <nav className="space-y-1">
            {visibleNav.map((item) => (
              <NavLink
                key={item.label}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'flex items-center justify-between rounded-md px-3 py-2 text-sm transition-colors',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal',
                    isActive
                      ? 'bg-brand-teal/15 font-semibold text-white'
                      : 'text-slate-400 hover:bg-white/5 hover:text-slate-200',
                  )
                }
              >
                <span>{item.label}</span>
              </NavLink>
            ))}
            {futureNav.map((item) => (
              <div
                key={item.label}
                className="flex items-center justify-between rounded-md px-3 py-2 text-sm text-slate-500"
              >
                <span>{item.label}</span>
                <span className="text-[10px] text-slate-600">{item.milestone}</span>
              </div>
            ))}
          </nav>
        </aside>

        <main className="min-w-0 flex-1">{children}</main>
      </div>

      <footer className="border-t border-white/10 bg-brand-navy-deep">
        <div className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-4 text-xs text-slate-500 sm:flex-row sm:justify-between">
          <span>
            Meridian Operations Simulator — local simulation only, not a real bank system.
          </span>
          <span>
            v{APP_VERSION} · {MILESTONE} {MILESTONE_NAME}
          </span>
        </div>
      </footer>
    </div>
  );
}

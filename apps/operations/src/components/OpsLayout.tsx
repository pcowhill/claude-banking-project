import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
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
  // Both ops_agent and admin may drive the simulation clock (NOT adminOnly).
  { label: 'Simulation clock', to: '/clock', end: false },
  { label: 'Create demo user', to: '/admin', end: false, adminOnly: true },
];

/** Sections that arrive in later milestones (shown dimmed). */
const futureNav = [{ label: 'Audit log', milestone: 'v0.6.0' }];

/**
 * The console navigation links. Shared by the desktop sidebar and the mobile
 * menu so both surfaces stay in sync. `onNavigate` lets the mobile menu close
 * itself when a link is chosen.
 */
function NavList({ visibleNav, onNavigate }: { visibleNav: NavItem[]; onNavigate?: () => void }) {
  return (
    <nav className="space-y-1">
      {visibleNav.map((item) => (
        <NavLink
          key={item.label}
          to={item.to}
          end={item.end}
          onClick={onNavigate}
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
  );
}

/** Hamburger / close icon for the mobile nav toggle. */
function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      {open ? (
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
      ) : (
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 12h16M4 17h16" />
      )}
    </svg>
  );
}

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

  // Mobile navigation: below the `lg` breakpoint the sidebar is hidden, so a
  // toggle button reveals the same links (B-03 fix — previously there was no way
  // to switch sections on a narrow window). Close it on every route change.
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const location = useLocation();
  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen flex-col">
      <SimulationBanner />
      <header className="border-b border-white/10 bg-brand-navy-deep">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileNavOpen((open) => !open)}
              aria-label={mobileNavOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={mobileNavOpen}
              aria-controls="ops-mobile-nav"
              className={cn(
                'inline-flex items-center justify-center rounded-md border border-white/10 bg-white/5 p-2 text-slate-200 transition-colors lg:hidden',
                'hover:bg-white/10',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2 focus-visible:ring-offset-brand-navy-deep',
              )}
            >
              <MenuIcon open={mobileNavOpen} />
            </button>
            <Logo className="h-8" />
            <span className="hidden rounded bg-white/10 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-slate-300 sm:inline">
              Operations Simulator
            </span>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden sm:block">
              <OpsStatus />
            </div>
            <OperatorMenu />
          </div>
        </div>

        {/* Mobile nav panel — visible only below `lg` and only when toggled. */}
        {mobileNavOpen && (
          <div id="ops-mobile-nav" className="border-t border-white/10 px-4 py-3 lg:hidden">
            <NavList visibleNav={visibleNav} onNavigate={() => setMobileNavOpen(false)} />
          </div>
        )}
      </header>

      <div className="mx-auto flex w-full max-w-7xl flex-1 gap-6 px-4 py-6">
        <aside className="hidden w-56 shrink-0 lg:block">
          <NavList visibleNav={visibleNav} />
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

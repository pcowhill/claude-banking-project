import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { cn } from '../lib/cn';
import { useAuth } from '../lib/auth-context';
import { Logo } from './Logo';
import { SimulationBanner } from './SimulationBanner';
import { SiteFooter } from './SiteFooter';
import { Button } from './ui/Button';
import { PRIMARY_NAV } from '../lib/nav';

/**
 * Public site shell: a persistent simulation banner, a responsive header with
 * the full marketing nav (collapsing to a mobile menu) and session-aware auth
 * actions, the routed page, and the footer. A skip link + semantic landmarks
 * keep keyboard and screen-reader navigation sound.
 *
 * The auth actions are unchanged in behavior from v0.2.0 — only the login/logout
 * controls were relocated into the wider nav — so the protected dashboard and
 * session-aware nav from v0.2.0 are preserved.
 */
export function SiteLayout() {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  // Surface the dashboard only once signed in (it is a protected route).
  const navLinks = user ? [...PRIMARY_NAV, { to: '/dashboard', label: 'Dashboard' }] : PRIMARY_NAV;

  async function handleLogout() {
    setMenuOpen(false);
    await logout();
    navigate('/');
  }

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      'rounded-md px-3 py-2 text-sm font-medium transition-colors',
      isActive ? 'bg-brand-mist text-brand-navy' : 'text-slate-600 hover:text-brand-navy',
    );

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-brand-navy focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        Skip to content
      </a>

      <SimulationBanner />

      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link to="/" aria-label="Meridian home" className="shrink-0">
            <Logo className="h-9" />
          </Link>

          {/* Desktop nav */}
          <nav aria-label="Primary" className="hidden items-center gap-1 lg:flex">
            {navLinks.map((link) => (
              <NavLink key={link.to} to={link.to} end={link.end} className={linkClass}>
                {link.label}
              </NavLink>
            ))}
          </nav>

          {/* Desktop auth actions */}
          <div className="hidden items-center gap-2 lg:flex">
            {!loading &&
              (user ? (
                <>
                  <span className="text-sm text-slate-600">
                    Hi, <span className="font-semibold text-brand-navy">{user.displayName}</span>
                  </span>
                  <Button variant="ghost" size="sm" onClick={handleLogout}>
                    Log out
                  </Button>
                </>
              ) : (
                <>
                  <Link to="/login">
                    <Button variant="ghost" size="sm">
                      Log in
                    </Button>
                  </Link>
                  <Link to="/open-account">
                    <Button size="sm">Open account</Button>
                  </Link>
                </>
              ))}
          </div>

          {/* Mobile menu toggle */}
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 text-brand-navy lg:hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal"
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              {menuOpen ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>

        {/* Mobile menu panel (only rendered when open) */}
        {menuOpen && (
          <div id="mobile-menu" className="border-t border-slate-200 bg-white lg:hidden">
            <nav aria-label="Mobile" className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-3">
              {navLinks.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  end={link.end}
                  onClick={() => setMenuOpen(false)}
                  className={linkClass}
                >
                  {link.label}
                </NavLink>
              ))}
              <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                {!loading &&
                  (user ? (
                    <>
                      <span className="text-sm text-slate-600">
                        Signed in as{' '}
                        <span className="font-semibold text-brand-navy">{user.displayName}</span>
                      </span>
                      <Button variant="ghost" size="sm" onClick={handleLogout}>
                        Log out
                      </Button>
                    </>
                  ) : (
                    <>
                      <Link to="/login" onClick={() => setMenuOpen(false)}>
                        <Button variant="ghost" size="sm">
                          Log in
                        </Button>
                      </Link>
                      <Link to="/open-account" onClick={() => setMenuOpen(false)}>
                        <Button size="sm">Open account</Button>
                      </Link>
                    </>
                  ))}
              </div>
            </nav>
          </div>
        )}
      </header>

      <main id="main" className="flex-1">
        <Outlet />
      </main>

      <SiteFooter />
    </div>
  );
}

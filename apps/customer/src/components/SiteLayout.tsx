import { Link, NavLink, Outlet } from 'react-router-dom';
import { cn } from '../lib/cn';
import { Logo } from './Logo';
import { SimulationBanner } from './SimulationBanner';
import { SiteFooter } from './SiteFooter';
import { Button } from './ui/Button';

const navLinks = [
  { to: '/', label: 'Home', end: true },
  { to: '/dashboard', label: 'Dashboard' },
];

export function SiteLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <SimulationBanner />
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link to="/" aria-label="Meridian home">
            <Logo className="h-9" />
          </Link>
          <nav className="hidden items-center gap-1 sm:flex">
            {navLinks.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={({ isActive }) =>
                  cn(
                    'rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    isActive ? 'bg-brand-mist text-brand-navy' : 'text-slate-600 hover:text-brand-navy',
                  )
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/login">
              <Button variant="ghost" size="sm">
                Log in
              </Button>
            </Link>
            <Link to="/login" className="hidden sm:block">
              <Button size="sm">Open account</Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <SiteFooter />
    </div>
  );
}

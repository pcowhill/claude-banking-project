import { Link } from 'react-router-dom';
import { APP_VERSION, BRAND, MILESTONE, MILESTONE_NAME } from '@simbank/shared';
import { Logo } from './Logo';
import { PRODUCT_NAV } from '../lib/nav';

const companyLinks = [
  { to: '/about', label: 'About Meridian' },
  { to: '/about#security', label: 'Security' },
  { to: '/open-account', label: 'Open an account' },
  { to: '/login', label: 'Log in' },
];

export function SiteFooter() {
  return (
    <footer className="mt-16 bg-brand-navy text-white">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-sm">
            <Logo tone="light" className="h-8" />
            <p className="mt-3 text-sm text-white/70">{BRAND.tagline}</p>
          </div>
          <nav aria-label="Footer" className="grid grid-cols-2 gap-x-12 gap-y-2 text-sm">
            <span className="font-semibold text-white">Banking</span>
            <span className="font-semibold text-white">Company</span>
            <ul className="space-y-2 text-white/75">
              {PRODUCT_NAV.map((link) => (
                <li key={link.to}>
                  <Link to={link.to} className="hover:text-white">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
            <ul className="space-y-2 text-white/75">
              {companyLinks.map((link) => (
                <li key={link.label}>
                  <Link to={link.to} className="hover:text-white">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="mt-8 rounded-lg border border-white/15 bg-white/5 p-3 text-xs text-white/70">
          <strong className="text-brand-gold-soft">Simulation notice:</strong>{' '}
          {BRAND.simulationNotice} This is not FDIC insured because it is not a bank.
        </div>

        <div className="mt-6 flex flex-col gap-1 text-xs text-white/50 sm:flex-row sm:justify-between">
          <span>© {BRAND.legalName}. For development and demonstration only.</span>
          <span>
            v{APP_VERSION} · {MILESTONE} {MILESTONE_NAME}
          </span>
        </div>
      </div>
    </footer>
  );
}

import { APP_VERSION, BRAND, MILESTONE, MILESTONE_NAME } from '@simbank/shared';
import { Logo } from './Logo';

export function SiteFooter() {
  return (
    <footer className="mt-16 bg-brand-navy text-white">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-sm">
            <Logo tone="light" className="h-8" />
            <p className="mt-3 text-sm text-white/70">{BRAND.tagline}</p>
          </div>
          <nav className="grid grid-cols-2 gap-x-10 gap-y-2 text-sm text-white/80">
            <span className="font-semibold text-white">Banking</span>
            <span className="font-semibold text-white">Company</span>
            <span>Checking</span>
            <span>About (demo)</span>
            <span>Savings</span>
            <span>Security</span>
            <span>Credit cards</span>
            <span>Support</span>
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

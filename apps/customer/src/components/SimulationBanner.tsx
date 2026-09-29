import { BRAND, MILESTONE } from '@simbank/shared';
import { PublicDemoNotice } from './PublicDemoNotice';

/**
 * Always-on disclaimer bar. Per the project's safety rules, every screen must
 * make it unmistakable that this is a simulation and not a real bank. In
 * public-demo mode a second, shared-demo line follows it (see `PublicDemoNotice`).
 */
export function SimulationBanner() {
  return (
    <>
      <div className="w-full bg-brand-gold/15 text-brand-ink">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-1.5 text-xs">
          <span className="inline-flex items-center rounded bg-brand-gold px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-navy-deep">
            Simulation
          </span>
          <span className="truncate">
            {BRAND.simulationNotice}{' '}
            <span className="font-semibold">({MILESTONE})</span>
          </span>
        </div>
      </div>
      <PublicDemoNotice variant="banner" />
    </>
  );
}

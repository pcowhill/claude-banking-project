import { MILESTONE } from '@simbank/shared';

/**
 * Operator-facing disclaimer. Makes explicit that this console SIMULATES the
 * external banking systems and bank-employee decisions behind the customer app.
 */
export function SimulationBanner() {
  return (
    <div className="w-full border-b border-brand-gold/30 bg-brand-gold/10 text-brand-gold-soft">
      <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-1.5 text-xs">
        <span className="inline-flex items-center rounded bg-brand-gold px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-navy-deep">
          Simulation
        </span>
        <span className="truncate text-slate-300">
          Internal operator console. This app <strong>simulates</strong> external/bank operations
          (SMS, email, ACH, wire networks, fraud decisions). Not a real bank system.{' '}
          <span className="font-semibold">({MILESTONE})</span>
        </span>
      </div>
    </div>
  );
}

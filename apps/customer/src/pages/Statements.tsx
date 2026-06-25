import { Link } from 'react-router-dom';
import { Card } from '../components/ui/Card';

/**
 * Statements & documents — a clearly-labelled PLACEHOLDER (v0.4.0, task D-07).
 * Real statement generation (monthly cycles, downloadable PDFs) arrives with the
 * simulated statement cycles in v0.9.0; until then this shows the shape of the
 * feature without producing any documents.
 */

/** A few recent months, rendered as not-yet-available statement rows. */
const RECENT_MONTHS = ['This month', 'Last month', 'Two months ago'];

export function Statements() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link
        to="/dashboard"
        className="inline-flex items-center gap-1 text-sm font-medium text-brand-teal-dark hover:underline"
      >
        <span aria-hidden="true">←</span> Back to accounts
      </Link>

      <h1 className="mt-4 text-2xl font-bold text-brand-navy">Statements &amp; documents</h1>
      <p className="mt-1 text-sm text-slate-600">
        Monthly statements and tax documents for your simulated accounts.
      </p>

      <div className="mt-4 rounded-lg border border-brand-gold/40 bg-brand-gold/10 px-4 py-3 text-sm text-brand-ink">
        <strong>Coming soon.</strong> Statement cycles and downloadable documents arrive with the
        simulated statement cycles in <span className="font-mono text-xs">v0.9.0</span>. Nothing here
        is a real financial document — this is a simulation.
      </div>

      <Card className="mt-6 p-0">
        <ul className="divide-y divide-slate-100">
          {RECENT_MONTHS.map((label) => (
            <li key={label} className="flex items-center justify-between gap-3 px-6 py-4">
              <div className="flex items-center gap-3">
                <span
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-400"
                  aria-hidden="true"
                >
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.6}>
                    <path d="M7 3h7l4 4v14H7V3z" strokeLinejoin="round" />
                    <path d="M13 3v5h5M9 13h6M9 17h6" strokeLinecap="round" />
                  </svg>
                </span>
                <div>
                  <div className="text-sm font-medium text-slate-700">{label} statement</div>
                  <div className="text-xs text-slate-400">PDF · simulated</div>
                </div>
              </div>
              <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Not available yet
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <p className="mt-6 text-xs text-slate-500">
        When statements arrive, each will be generated from the same append-only ledger that powers
        your balances — so every figure is reconcilable.
      </p>
    </div>
  );
}

import { useCallback, useEffect, useState } from 'react';
import {
  daysBetween,
  formatApy,
  formatMinor,
  lendingKindLabel,
  type LendingProductDTO,
} from '@simbank/shared';
import { ApiError } from '../lib/api';
import { fetchLending } from '../lib/opsApi';
import { Card } from '../components/ui/Card';
import { LendingStatusBadge } from '../components/badges';

/**
 * Operator lending visibility (v1.0.0). A READ-ONLY window onto every customer's
 * lending products — certificates of deposit (CDs) and loans. Shows the product
 * terms plus the product account's DERIVED figures (a loan is negative while
 * owed; a CD is positive deposit + earned interest).
 *
 * SIMULATION: operators do NOT open, pay, or close customer lending here — money
 * never moves from this view. Balances stay derived from the append-only ledger;
 * no real lender, deposit product, or credit decision is ever involved.
 */

/** Date-only label for the maturity column (no time component needed). */
function formatMaturityDate(iso: string | null): string {
  if (!iso) return '—';
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return '—';
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(ms));
}

/** Term in months, written as a short "N mo" label. */
function formatTerm(termMonths: number): string {
  return `${termMonths} mo`;
}

/** The balance cell: a CD shows its positive balance; a loan shows "owed". */
function BalanceCell({ product }: { product: LendingProductDTO }) {
  if (product.kind === 'loan') {
    // A loan's balance is negative while owed; surface `outstandingMinor` as a
    // positive "owed" figure (0 once paid off).
    if (product.outstandingMinor > 0) {
      return (
        <span className="text-rose-200">
          {formatMinor(product.outstandingMinor)}
          <span className="ml-1 text-[11px] uppercase tracking-wide text-slate-500">owed</span>
        </span>
      );
    }
    return <span className="text-slate-400">{formatMinor(0)}</span>;
  }
  return <span className="text-emerald-200">{formatMinor(product.balanceMinor)}</span>;
}

export function LendingProducts() {
  const [products, setProducts] = useState<LendingProductDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadLending = useCallback(async () => {
    setLoading(true);
    try {
      const { products: list } = await fetchLending();
      setProducts(list);
      setError(null);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Could not load customer lending products.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLending();
  }, [loadLending]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-white">Lending</h1>
        <p className="mt-1 text-sm text-slate-400">
          A <span className="font-semibold text-slate-200">read-only</span> view of every
          customer&rsquo;s <span className="font-semibold text-slate-200">simulated</span> lending
          products &mdash; certificates of deposit and loans. Balances are derived from the ledger;
          interest accrues when the <span className="font-semibold text-slate-200">simulation
          clock</span> is advanced. Operators do not open or modify customer lending here.
        </p>
      </div>

      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
            Customer lending products
          </h2>
          <button
            type="button"
            onClick={() => void loadLending()}
            disabled={loading}
            className="text-xs font-semibold text-brand-teal hover:underline disabled:opacity-40"
          >
            Refresh
          </button>
        </div>
        <Card className="mt-3">
          {loading && products === null ? (
            <p className="text-sm text-slate-500">Loading lending products…</p>
          ) : error ? (
            <p className="text-sm text-rose-300/90">{error}</p>
          ) : !products || products.length === 0 ? (
            <p className="text-sm text-slate-500">
              No customer has opened a CD or loan yet (simulated).
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[48rem] text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-left text-[11px] uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-3 font-medium">Product</th>
                    <th className="py-2 pr-3 font-medium">Account</th>
                    <th className="py-2 pr-3 font-medium">Status</th>
                    <th className="py-2 pr-3 text-right font-medium">Balance</th>
                    <th className="py-2 pr-3 text-right font-medium">APY</th>
                    <th className="py-2 pr-3 text-right font-medium">Term</th>
                    <th className="py-2 pr-0 font-medium">Matures</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {products.map((product) => {
                    const daysToMaturity =
                      product.status === 'active'
                        ? daysBetween(product.lastAccruedAt, product.maturesAt)
                        : 0;
                    return (
                      <tr key={product.id} className="text-slate-200">
                        <td className="py-2 pr-3">{lendingKindLabel(product.kind)}</td>
                        <td className="py-2 pr-3 text-slate-300">{product.accountName}</td>
                        <td className="py-2 pr-3">
                          <LendingStatusBadge status={product.status} />
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          <BalanceCell product={product} />
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums text-slate-300">
                          {formatApy(product.apyBps)}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums text-slate-400">
                          {formatTerm(product.termMonths)}
                        </td>
                        <td className="py-2 pr-0 text-slate-400">
                          <span className="tabular-nums">{formatMaturityDate(product.maturesAt)}</span>
                          {product.status === 'active' && daysToMaturity > 0 && (
                            <span className="ml-2 text-[11px] text-slate-600">
                              in {daysToMaturity} {daysToMaturity === 1 ? 'day' : 'days'}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </section>

      <p className="text-xs text-slate-600">
        Simulation only&nbsp;&mdash; no real lender, deposit product, money network, or credit
        decision is ever involved. Every product and balance shown exists solely in this local demo.
      </p>
    </div>
  );
}

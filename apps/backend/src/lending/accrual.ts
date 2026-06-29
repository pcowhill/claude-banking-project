import {
  addMonthsClamped,
  DEFAULT_SAVINGS_APY_BPS,
  formatMinor,
  monthlyAccrualMinor,
  type InterestAccrualSummary,
} from '@simbank/shared';
import { prisma, type DbClient } from '../db';
import { writeAudit } from '../auth/audit';
import { accountCurrentMinor } from './lending';

/**
 * Clock-driven INTEREST ACCRUAL (v1.0.0). Run on every clock advance, right after
 * the scheduler (see `routes/clock.ts`). For each interest-bearing target it posts
 * one bank-originated `interest` ledger entry per whole simulated month that has
 * elapsed since its bookmark, dated at the month's simulated anniversary:
 *
 *  - **Savings** accounts earn a CREDIT at {@link DEFAULT_SAVINGS_APY_BPS};
 *    bookmark = `Account.interestAccruedThrough`.
 *  - **CDs** earn a CREDIT at the product's APY until maturity (then `matured`);
 *    bookmark = `LendingProduct.lastAccruedAt`.
 *  - **Loans** are CHARGED a DEBIT at the product's APY on the outstanding owed
 *    (growing what is owed); bookmark = `LendingProduct.lastAccruedAt`.
 *
 * MONEY DISCIPLINE: interest is bank-originated (`origin: 'interest'`), the only
 * kind of entry allowed to change the system-wide settled total; balances stay
 * DERIVED. There is NO wall-clock timer — a month only "passes" when an operator
 * advances the simulation clock. Idempotent: the bookmark only advances by whole
 * accrued months, so re-running with the same `upTo` accrues nothing new, and a
 * partial month is never accrued (no drift). Catch-up is bounded.
 */

/** Max months a single target may accrue in one advance (a single advance is ≤ 1 year). */
const MAX_ACCRUAL_MONTHS = 24;

interface AccrualPeriod {
  at: Date;
  interestMinor: number;
}
interface AccrualPlan {
  periods: AccrualPeriod[];
  /** New bookmark = the last whole-month anniversary at or before `upTo`. */
  newBookmark: Date;
  /** Whole months stepped (may exceed periods.length when a month accrues 0). */
  monthsStepped: number;
}

/**
 * Plan the per-month accruals from `from` up to `upTo`, compounding on a running
 * magnitude (the balance for savings/CDs; the amount owed for loans). Pure given
 * its inputs. A month whose interest rounds to 0 is stepped over (bookmark still
 * advances) but produces no entry.
 */
function planMonthlyAccrual(
  magnitudeStart: number,
  from: Date,
  upTo: Date,
  apyBps: number,
): AccrualPlan {
  const periods: AccrualPeriod[] = [];
  let magnitude = Math.max(0, magnitudeStart);
  let monthsStepped = 0;
  let periodEnd = addMonthsClamped(from, 1);
  while (periodEnd.getTime() <= upTo.getTime() && monthsStepped < MAX_ACCRUAL_MONTHS) {
    const interest = monthlyAccrualMinor(magnitude, apyBps);
    if (interest > 0) periods.push({ at: periodEnd, interestMinor: interest });
    magnitude += interest;
    monthsStepped += 1;
    periodEnd = addMonthsClamped(from, monthsStepped + 1);
  }
  const newBookmark = monthsStepped > 0 ? addMonthsClamped(from, monthsStepped) : from;
  return { periods, newBookmark, monthsStepped };
}

/** Post one bank-originated `interest` ledger entry dated at the simulated `at`. */
async function postInterest(
  tx: DbClient,
  accountId: string,
  direction: 'credit' | 'debit',
  amountMinor: number,
  description: string,
  at: Date,
): Promise<void> {
  await tx.ledgerEntry.create({
    data: {
      accountId,
      amountMinor,
      direction,
      status: 'posted',
      origin: 'interest',
      description,
      postedAt: at,
      createdAt: at,
    },
  });
}

const emptySummary = (): InterestAccrualSummary => ({
  savingsAccountsAccrued: 0,
  cdsAccrued: 0,
  loansAccrued: 0,
  totalInterestCreditedMinor: 0,
  totalInterestChargedMinor: 0,
  cdsMatured: 0,
});

/**
 * Accrue interest for every interest-bearing target up to the simulated instant
 * `upTo`. Each target is processed in its own transaction and guarded so one
 * failure can never strand the rest of the advance. Returns a summary the clock
 * route surfaces to the operator.
 */
export async function runInterestAccrual(upTo: Date): Promise<InterestAccrualSummary> {
  const summary = emptySummary();

  // ---- 1) Savings interest (credit) -----------------------------------------
  const savings = await prisma.account.findMany({ where: { type: 'savings', status: 'active' } });
  for (const acct of savings) {
    try {
      const from = acct.interestAccruedThrough ?? acct.openedAt;
      if (from.getTime() >= upTo.getTime()) continue;
      const balance = await accountCurrentMinor(prisma, acct.id);
      const plan = planMonthlyAccrual(balance, from, upTo, DEFAULT_SAVINGS_APY_BPS);
      if (plan.monthsStepped === 0) continue;
      let credited = 0;
      await prisma.$transaction(async (tx) => {
        for (const p of plan.periods) {
          await postInterest(tx, acct.id, 'credit', p.interestMinor, 'Interest earned (simulated)', p.at);
          credited += p.interestMinor;
        }
        await tx.account.update({ where: { id: acct.id }, data: { interestAccruedThrough: plan.newBookmark } });
        if (credited > 0) {
          await writeAudit(tx, {
            actorId: null,
            actorRole: 'system',
            action: 'interest_accrued_savings',
            entity: 'account',
            entityId: acct.id,
            reason: `Accrued ${formatMinor(credited)} savings interest over ${plan.periods.length} month(s) (simulated)`,
            metadata: { months: plan.periods.length, creditedMinor: credited, throughISO: plan.newBookmark.toISOString() },
          });
        }
      });
      if (plan.periods.length > 0) {
        summary.savingsAccountsAccrued += 1;
        summary.totalInterestCreditedMinor += credited;
      }
    } catch (err) {
      // per-account guard: one failure must not strand the rest of the advance.
      // Each account keeps its own bookmark, so log for operability (the advance
      // continues; the next advance retries this account from where it left off).
      console.error(`[accrual] savings accrual failed for account ${acct.id}:`, err);
    }
  }

  // ---- 2) CDs (credit, until maturity) + 3) Loans (debit on owed) -----------
  const products = await prisma.lendingProduct.findMany({ where: { status: 'active' } });
  for (const product of products) {
    try {
      if (product.kind === 'cd') {
        const willMature = upTo.getTime() >= product.maturesAt.getTime();
        const accrueTo = willMature ? product.maturesAt : upTo;
        const from = product.lastAccruedAt;
        // Symmetric with savings/loans: nothing to do if not yet a month past the
        // bookmark and the CD has not matured this advance.
        if (!willMature && from.getTime() >= upTo.getTime()) continue;
        const balance = await accountCurrentMinor(prisma, product.accountId);
        const plan = planMonthlyAccrual(balance, from, accrueTo, product.apyBps);
        let credited = 0;
        await prisma.$transaction(async (tx) => {
          for (const p of plan.periods) {
            await postInterest(tx, product.accountId, 'credit', p.interestMinor, 'CD interest earned (simulated)', p.at);
            credited += p.interestMinor;
          }
          const data: { lastAccruedAt?: Date; status?: string } = {};
          if (plan.monthsStepped > 0) data.lastAccruedAt = plan.newBookmark;
          if (willMature) {
            data.status = 'matured';
            data.lastAccruedAt = product.maturesAt;
          }
          if (Object.keys(data).length > 0) {
            await tx.lendingProduct.update({ where: { id: product.id }, data });
          }
          if (credited > 0 || willMature) {
            await writeAudit(tx, {
              actorId: null,
              actorRole: 'system',
              action: willMature ? 'interest_accrued_cd_matured' : 'interest_accrued_cd',
              entity: 'lending_product',
              entityId: product.id,
              reason: `Accrued ${formatMinor(credited)} CD interest${willMature ? ' — CD matured' : ''} (simulated)`,
              metadata: { months: plan.periods.length, creditedMinor: credited, matured: willMature },
            });
          }
        });
        if (plan.periods.length > 0) {
          summary.cdsAccrued += 1;
          summary.totalInterestCreditedMinor += credited;
        }
        if (willMature) summary.cdsMatured += 1;
      } else if (product.kind === 'loan') {
        const from = product.lastAccruedAt;
        if (from.getTime() >= upTo.getTime()) continue;
        const owed = -(await accountCurrentMinor(prisma, product.accountId)); // positive while owed
        if (owed <= 0) continue;
        const plan = planMonthlyAccrual(owed, from, upTo, product.apyBps);
        if (plan.monthsStepped === 0) continue;
        let charged = 0;
        await prisma.$transaction(async (tx) => {
          for (const p of plan.periods) {
            await postInterest(tx, product.accountId, 'debit', p.interestMinor, 'Loan interest charged (simulated)', p.at);
            charged += p.interestMinor;
          }
          await tx.lendingProduct.update({ where: { id: product.id }, data: { lastAccruedAt: plan.newBookmark } });
          if (charged > 0) {
            await writeAudit(tx, {
              actorId: null,
              actorRole: 'system',
              action: 'interest_accrued_loan',
              entity: 'lending_product',
              entityId: product.id,
              reason: `Charged ${formatMinor(charged)} loan interest over ${plan.periods.length} month(s) (simulated)`,
              metadata: { months: plan.periods.length, chargedMinor: charged },
            });
          }
        });
        if (plan.periods.length > 0) {
          summary.loansAccrued += 1;
          summary.totalInterestChargedMinor += charged;
        }
      }
    } catch (err) {
      // per-product guard (same rationale as savings above): isolate + log.
      console.error(`[accrual] ${product.kind} accrual failed for product ${product.id}:`, err);
    }
  }

  return summary;
}

/**
 * Lending & savings-interest contracts (v1.0.0) — loans, certificates of deposit
 * (CDs), and clock-driven interest accrual.
 *
 * Dependency-free and shared by the backend AND the customer app so the product
 * shape, the rate tables, the interest/amortization MATH, and field-level
 * VALIDATION live in one place (the same validator runs in the customer form and
 * again on the server).
 *
 * MONEY DISCIPLINE — these products move money ONLY by appending `LedgerEntry`
 * rows (never by editing a balance), and only ever via the existing disciplined
 * ledger:
 *  - **Opening a CD** moves the principal from the customer's funding account into
 *    the new CD account as a pair of `transfer` legs (nets to zero). The CD
 *    account then carries a POSITIVE balance.
 *  - **A loan** is disbursed as a pair of `transfer` legs: the loan account is
 *    DEBITED the principal (so it carries a NEGATIVE balance — the amount owed)
 *    and the customer's checking is CREDITED the cash. Nets to zero.
 *  - **Interest accrual** posts a BANK-ORIGINATED `interest` entry dated at the
 *    simulated accrual date: a CREDIT on a savings/CD account (you earn), a DEBIT
 *    on a loan account (you owe more). The simulation clock decides when a month
 *    has elapsed — there is no wall-clock timer.
 *  - **A loan payment** moves money from checking to the loan account as a pair of
 *    `transfer` legs (nets to zero), reducing the amount owed.
 *  - **A matured CD withdrawal** moves the CD balance back to a checking/savings
 *    account as a pair of `transfer` legs (nets to zero).
 *
 * Balances stay DERIVED from the ledger throughout (a loan's balance is simply the
 * sum of its entries — negative while owed). SIMULATION: no real lender, deposit
 * product, money network, or credit decision is ever involved.
 */
import type { ValidationResult } from './onboarding';

// ---- Kinds & statuses -------------------------------------------------------

/** The two lending/deposit products. (Savings interest is a plain savings account.) */
export const LENDING_KINDS = ['cd', 'loan'] as const;
export type LendingKind = (typeof LENDING_KINDS)[number];

/** Lifecycle of a lending product. */
export const LENDING_STATUSES = ['active', 'matured', 'paid_off', 'closed'] as const;
export type LendingStatus = (typeof LENDING_STATUSES)[number];

export function isLendingKind(value: unknown): value is LendingKind {
  return typeof value === 'string' && (LENDING_KINDS as readonly string[]).includes(value);
}
export function isLendingStatus(value: unknown): value is LendingStatus {
  return typeof value === 'string' && (LENDING_STATUSES as readonly string[]).includes(value);
}

// ---- Policy bounds & rate tables -------------------------------------------

export const LENDING_LIMITS = {
  /** Minimum opening principal (a CD deposit / a loan amount), in minor units. */
  minPrincipalMinor: 100_00, // $100
  /** Maximum opening principal (simulated cap), in minor units. */
  maxPrincipalMinor: 1_000_000_00, // $1,000,000
  /** Bounds on a stored APY (basis points) — guards seeded/admin values too. */
  minApyBps: 0,
  maxApyBps: 3000, // 30.00% (simulated)
  /** Bounds on a term in months. */
  minTermMonths: 1,
  maxTermMonths: 360, // 30 years
  /** Min/max for a single loan payment, in minor units. */
  minPaymentMinor: 1_00,
  maxPaymentMinor: 1_000_000_00,
} as const;

/** Simulated APY (basis points) earned on a plain savings balance. 1.50%. */
export const DEFAULT_SAVINGS_APY_BPS = 150;

/** Offered CD terms (months) → simulated APY in basis points. */
export const CD_RATE_TABLE_BPS: Readonly<Record<number, number>> = {
  6: 350, // 3.50%
  12: 450, // 4.50%
  24: 500, // 5.00%
  60: 525, // 5.25%
};
export const CD_TERMS_MONTHS = [6, 12, 24, 60] as const;

/** Offered loan terms (months) → simulated APY in basis points. */
export const LOAN_RATE_TABLE_BPS: Readonly<Record<number, number>> = {
  12: 1200, // 12.00%
  24: 1050, // 10.50%
  36: 950, // 9.50%
  60: 850, // 8.50%
};
export const LOAN_TERMS_MONTHS = [12, 24, 36, 60] as const;

/** The simulated APY (bps) the bank offers for a CD term, or null if not offered. */
export function cdApyForTerm(months: number): number | null {
  return CD_RATE_TABLE_BPS[months] ?? null;
}
/** The simulated APY (bps) the bank offers for a loan term, or null if not offered. */
export function loanApyForTerm(months: number): number | null {
  return LOAN_RATE_TABLE_BPS[months] ?? null;
}

// ---- Pure interest & amortization math --------------------------------------

/**
 * One month's interest on a balance, in minor units, rounded to the nearest cent.
 * Simple monthly interest at apy/12; compounding emerges naturally because each
 * accrual posts to the ledger and the next month reads the new derived balance.
 * Returns 0 for a non-positive balance or non-positive rate.
 */
export function monthlyAccrualMinor(balanceMinor: number, apyBps: number): number {
  if (!Number.isFinite(balanceMinor) || !Number.isFinite(apyBps)) return 0;
  const magnitude = Math.abs(balanceMinor);
  if (magnitude <= 0 || apyBps <= 0) return 0;
  return Math.round((magnitude * apyBps) / (10000 * 12));
}

/**
 * The level monthly payment that fully amortizes `principalMinor` over
 * `termMonths` at `apyBps`, in minor units, rounded UP to the cent so the balance
 * is never left fractionally outstanding. With a zero rate it is principal/term.
 */
export function amortizedPaymentMinor(
  principalMinor: number,
  apyBps: number,
  termMonths: number,
): number {
  if (termMonths <= 0) return Math.max(0, Math.round(principalMinor));
  const r = apyBps / 10000 / 12;
  if (r <= 0) return Math.ceil(principalMinor / termMonths);
  const factor = Math.pow(1 + r, termMonths);
  const payment = (principalMinor * r * factor) / (factor - 1);
  return Math.ceil(payment);
}

/**
 * Projected CD value at maturity, in minor units, applying the SAME per-month
 * accrual the scheduler posts (so the projection matches what actually accrues).
 */
export function projectCdMaturityMinor(
  principalMinor: number,
  apyBps: number,
  termMonths: number,
): number {
  let balance = Math.max(0, Math.round(principalMinor));
  for (let i = 0; i < termMonths; i += 1) {
    balance += monthlyAccrualMinor(balance, apyBps);
  }
  return balance;
}

/** Total interest a CD will earn over its term (projection − principal). */
export function projectCdInterestMinor(
  principalMinor: number,
  apyBps: number,
  termMonths: number,
): number {
  return projectCdMaturityMinor(principalMinor, apyBps, termMonths) - Math.max(0, Math.round(principalMinor));
}

// ---- Calendar math (UTC, month-clamped) -------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Add `n` calendar months to a date, clamping the day-of-month (Jan 31 + 1mo →
 * Feb 28/29). UTC so it is deterministic regardless of host time zone. Mirrors the
 * scheduler's `addInterval` month logic so accrual periods line up with statements.
 */
export function addMonthsClamped(date: Date, n: number): Date {
  const day = date.getUTCDate();
  const d = new Date(date.getTime());
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  const lastDayOfTargetMonth = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
  ).getUTCDate();
  d.setUTCDate(Math.min(day, lastDayOfTargetMonth));
  return d;
}

/**
 * How many whole accrual months have elapsed from `from` up to and including
 * `upTo` (i.e. how many monthly anniversaries of `from` are at or before `upTo`),
 * capped at `cap`. Pure — used by the accrual driver to bound catch-up.
 */
export function monthsElapsed(from: Date, upTo: Date, cap = 600): number {
  let count = 0;
  let next = addMonthsClamped(from, 1);
  while (next.getTime() <= upTo.getTime() && count < cap) {
    count += 1;
    next = addMonthsClamped(from, count + 1);
  }
  return count;
}

// ---- DTOs -------------------------------------------------------------------

/**
 * A lending product (CD or loan) as exposed to clients. It carries the product
 * TERMS plus the product account's DERIVED figures (never a stored balance).
 */
export interface LendingProductDTO {
  id: string;
  kind: LendingKind;
  status: LendingStatus;
  /** The product's own account (a `cd` or `loan` account). */
  accountId: string;
  accountName: string;
  /** APY in basis points (e.g. 450 = 4.50%). */
  apyBps: number;
  termMonths: number;
  /** Opening principal in minor units (the CD deposit / the loan amount). */
  principalMinor: number;
  /** Level monthly payment for a loan; null for a CD. */
  paymentMinor: number | null;
  /** ISO (simulated) — when the product opened / matures / last accrued. */
  openedAt: string;
  maturesAt: string;
  lastAccruedAt: string;
  /**
   * The product account's DERIVED current balance, in minor units. A CD is
   * positive (deposit + earned interest); a loan is NEGATIVE while owed (it
   * trends toward 0 as it is repaid).
   */
  balanceMinor: number;
  /**
   * Outstanding amount OWED on a loan (a positive number = -balanceMinor while in
   * debit); 0 for a CD or a paid-off loan. Convenience for the UI.
   */
  outstandingMinor: number;
}

/**
 * What interest accrual did across a single clock advance (operator-facing). Like
 * the scheduler's fire summary, this is surfaced on the advance response so the
 * operator sees what a fast-forward produced.
 */
export interface InterestAccrualSummary {
  /** Savings accounts that earned at least one month of interest. */
  savingsAccountsAccrued: number;
  /** CDs that accrued interest. */
  cdsAccrued: number;
  /** Loans that accrued interest (added to what is owed). */
  loansAccrued: number;
  /** Total interest CREDITED to savings + CDs (money earned), minor units. */
  totalInterestCreditedMinor: number;
  /** Total interest CHARGED to loans (money owed), minor units. */
  totalInterestChargedMinor: number;
  /** CDs that reached maturity during this advance. */
  cdsMatured: number;
}

export interface LendingListResponse {
  products: LendingProductDTO[];
}
export interface LendingProductResponse {
  product: LendingProductDTO;
  message: string;
}

// ---- Request DTOs + validators ----------------------------------------------

export interface OpenCdRequest {
  /** The account the principal is moved FROM (checking/savings the caller holds). */
  fundingAccountId: string;
  principalMinor: number;
  /** One of {@link CD_TERMS_MONTHS}; the APY is the bank's offered rate. */
  termMonths: number;
}
export interface NormalizedOpenCd {
  fundingAccountId: string;
  principalMinor: number;
  termMonths: number;
  apyBps: number;
}
export type OpenCdField = 'fundingAccountId' | 'principalMinor' | 'termMonths';

export interface OpenLoanRequest {
  /** The account the loan cash is disbursed TO (a checking account the caller holds). */
  disbursementAccountId: string;
  principalMinor: number;
  /** One of {@link LOAN_TERMS_MONTHS}; the APY is the bank's offered rate. */
  termMonths: number;
}
export interface NormalizedOpenLoan {
  disbursementAccountId: string;
  principalMinor: number;
  termMonths: number;
  apyBps: number;
  paymentMinor: number;
}
export type OpenLoanField = 'disbursementAccountId' | 'principalMinor' | 'termMonths';

export interface LoanPaymentRequest {
  /** The account the payment is taken FROM (a checking/savings the caller holds). */
  fromAccountId: string;
  /** Amount to pay, in minor units. Omit/null to pay the scheduled monthly payment. */
  amountMinor?: number | null;
}
export interface NormalizedLoanPayment {
  fromAccountId: string;
  /** null = "pay the scheduled monthly payment" (resolved by the server). */
  amountMinor: number | null;
}
export type LoanPaymentField = 'fromAccountId' | 'amountMinor';

export interface WithdrawCdRequest {
  /** The account the matured CD balance is moved TO (a checking/savings held). */
  toAccountId: string;
}
export type WithdrawCdField = 'toAccountId';

function validPrincipal(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= LENDING_LIMITS.minPrincipalMinor &&
    value <= LENDING_LIMITS.maxPrincipalMinor
  );
}

/** Validate + normalize an open-CD request. Pure (form + server). */
export function validateOpenCd(
  input: Partial<OpenCdRequest>,
): ValidationResult<NormalizedOpenCd, OpenCdField> {
  const errors: Partial<Record<OpenCdField, string>> = {};

  const fundingAccountId = typeof input.fundingAccountId === 'string' ? input.fundingAccountId.trim() : '';
  if (!fundingAccountId) errors.fundingAccountId = 'Choose the account to fund the CD from.';

  if (!validPrincipal(input.principalMinor)) {
    errors.principalMinor = 'Enter a deposit between $100 and $1,000,000 (simulated).';
  }

  const termMonths = typeof input.termMonths === 'number' ? input.termMonths : NaN;
  const apyBps = cdApyForTerm(termMonths);
  if (apyBps === null) errors.termMonths = 'Choose an offered CD term.';

  const ok = Object.keys(errors).length === 0;
  return {
    ok,
    errors,
    value:
      ok && apyBps !== null
        ? { fundingAccountId, principalMinor: input.principalMinor as number, termMonths, apyBps }
        : undefined,
  };
}

/** Validate + normalize an open-loan request (computes the amortized payment). Pure. */
export function validateOpenLoan(
  input: Partial<OpenLoanRequest>,
): ValidationResult<NormalizedOpenLoan, OpenLoanField> {
  const errors: Partial<Record<OpenLoanField, string>> = {};

  const disbursementAccountId =
    typeof input.disbursementAccountId === 'string' ? input.disbursementAccountId.trim() : '';
  if (!disbursementAccountId) errors.disbursementAccountId = 'Choose the account to receive the funds.';

  if (!validPrincipal(input.principalMinor)) {
    errors.principalMinor = 'Enter a loan amount between $100 and $1,000,000 (simulated).';
  }

  const termMonths = typeof input.termMonths === 'number' ? input.termMonths : NaN;
  const apyBps = loanApyForTerm(termMonths);
  if (apyBps === null) errors.termMonths = 'Choose an offered loan term.';

  const ok = Object.keys(errors).length === 0;
  return {
    ok,
    errors,
    value:
      ok && apyBps !== null
        ? {
            disbursementAccountId,
            principalMinor: input.principalMinor as number,
            termMonths,
            apyBps,
            paymentMinor: amortizedPaymentMinor(input.principalMinor as number, apyBps, termMonths),
          }
        : undefined,
  };
}

/** Validate + normalize a loan payment. `amountMinor` omitted → scheduled payment. Pure. */
export function validateLoanPayment(
  input: Partial<LoanPaymentRequest>,
): ValidationResult<NormalizedLoanPayment, LoanPaymentField> {
  const errors: Partial<Record<LoanPaymentField, string>> = {};

  const fromAccountId = typeof input.fromAccountId === 'string' ? input.fromAccountId.trim() : '';
  if (!fromAccountId) errors.fromAccountId = 'Choose the account to pay from.';

  let amountMinor: number | null = null;
  if (input.amountMinor !== undefined && input.amountMinor !== null) {
    if (
      typeof input.amountMinor !== 'number' ||
      !Number.isInteger(input.amountMinor) ||
      input.amountMinor < LENDING_LIMITS.minPaymentMinor ||
      input.amountMinor > LENDING_LIMITS.maxPaymentMinor
    ) {
      errors.amountMinor = 'Enter a payment between $1 and $1,000,000 (simulated).';
    } else {
      amountMinor = input.amountMinor;
    }
  }

  const ok = Object.keys(errors).length === 0;
  return { ok, errors, value: ok ? { fromAccountId, amountMinor } : undefined };
}

/** Validate + normalize a matured-CD withdrawal. Pure. */
export function validateWithdrawCd(
  input: Partial<WithdrawCdRequest>,
): ValidationResult<{ toAccountId: string }, WithdrawCdField> {
  const errors: Partial<Record<WithdrawCdField, string>> = {};
  const toAccountId = typeof input.toAccountId === 'string' ? input.toAccountId.trim() : '';
  if (!toAccountId) errors.toAccountId = 'Choose the account to receive the funds.';
  const ok = Object.keys(errors).length === 0;
  return { ok, errors, value: ok ? { toAccountId } : undefined };
}

// ---- Labels & display helpers ----------------------------------------------

export const LENDING_KIND_LABELS: Record<LendingKind, string> = {
  cd: 'Certificate of Deposit',
  loan: 'Loan',
};
export const LENDING_STATUS_LABELS: Record<LendingStatus, string> = {
  active: 'Active',
  matured: 'Matured',
  paid_off: 'Paid off',
  closed: 'Closed',
};

export function lendingKindLabel(kind: LendingKind): string {
  return LENDING_KIND_LABELS[kind] ?? kind;
}
export function lendingStatusLabel(status: LendingStatus): string {
  return LENDING_STATUS_LABELS[status] ?? status;
}

/** Format an APY in basis points as a percentage string, e.g. 450 → "4.50%". */
export function formatApy(apyBps: number): string {
  return `${(apyBps / 100).toFixed(2)}%`;
}

/** True when a CD has reached (simulated) maturity and can be withdrawn. */
export function isCdWithdrawable(product: Pick<LendingProductDTO, 'kind' | 'status'>): boolean {
  return product.kind === 'cd' && product.status === 'matured';
}

/** Approximate days between two instants (for "matures in N days" copy). */
export function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.round((to - from) / DAY_MS);
}

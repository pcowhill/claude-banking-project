import { describe, expect, it } from 'vitest';
import {
  addMonthsClamped,
  amortizedPaymentMinor,
  cdApyForTerm,
  DEFAULT_SAVINGS_APY_BPS,
  formatApy,
  isCdWithdrawable,
  loanApyForTerm,
  monthlyAccrualMinor,
  monthsElapsed,
  projectCdInterestMinor,
  projectCdMaturityMinor,
  validateLoanPayment,
  validateOpenCd,
  validateOpenLoan,
  validateWithdrawCd,
} from './lending';

describe('lending math (v1.0.0)', () => {
  describe('monthlyAccrualMinor', () => {
    it('is one month of apy/12 on the balance, rounded to the cent', () => {
      // $10,000 at 6% APY → 0.5%/mo → $50.00
      expect(monthlyAccrualMinor(10_000_00, 600)).toBe(50_00);
      // $1,000 at 1.50% APY → 0.125%/mo → $1.25
      expect(monthlyAccrualMinor(1_000_00, DEFAULT_SAVINGS_APY_BPS)).toBe(1_25);
    });
    it('uses the magnitude (so a loan debit balance accrues on what is owed)', () => {
      expect(monthlyAccrualMinor(-10_000_00, 1200)).toBe(monthlyAccrualMinor(10_000_00, 1200));
    });
    it('is zero for a non-positive balance or non-positive rate', () => {
      expect(monthlyAccrualMinor(0, 600)).toBe(0);
      expect(monthlyAccrualMinor(10_000_00, 0)).toBe(0);
    });
  });

  describe('amortizedPaymentMinor', () => {
    it('fully amortizes the principal over the term (sum of payments ≥ principal)', () => {
      const P = 12_000_00;
      const pay = amortizedPaymentMinor(P, 1200, 24);
      // A known-good ballpark for $12k @ 12% over 24mo is ~$565/mo.
      expect(pay).toBeGreaterThan(560_00);
      expect(pay).toBeLessThan(570_00);
      // Paying it that many times covers the principal (rounded up).
      expect(pay * 24).toBeGreaterThanOrEqual(P);
    });
    it('is principal/term (rounded up) at a zero rate', () => {
      expect(amortizedPaymentMinor(1_200_00, 0, 12)).toBe(100_00);
    });
    it('simulating the amortization drives the balance to zero (no residual owed)', () => {
      const P = 5_000_00;
      const apy = 950;
      const term = 12;
      const pay = amortizedPaymentMinor(P, apy, term);
      let balance = P;
      for (let i = 0; i < term; i += 1) {
        balance += monthlyAccrualMinor(balance, apy); // interest owed accrues
        balance -= pay; // payment applied
      }
      // After the full schedule the loan is paid off (balance ≤ 0, within one cent).
      expect(balance).toBeLessThanOrEqual(0);
      expect(balance).toBeGreaterThan(-pay); // not wildly overpaid
    });
  });

  describe('projectCdMaturityMinor', () => {
    it('compounds monthly and equals principal + projected interest', () => {
      const P = 10_000_00;
      const maturity = projectCdMaturityMinor(P, 500, 12);
      expect(maturity).toBeGreaterThan(P); // earned something
      expect(projectCdInterestMinor(P, 500, 12)).toBe(maturity - P);
    });
    it('returns the principal unchanged at a zero rate', () => {
      expect(projectCdMaturityMinor(10_000_00, 0, 12)).toBe(10_000_00);
    });
  });

  describe('calendar helpers', () => {
    it('addMonthsClamped clamps the day of month', () => {
      // Jan 31 + 1 month → Feb 28 (2026 is not a leap year)
      const jan31 = new Date(Date.UTC(2026, 0, 31));
      expect(addMonthsClamped(jan31, 1).toISOString()).toBe('2026-02-28T00:00:00.000Z');
    });
    it('monthsElapsed counts whole monthly anniversaries up to a date', () => {
      const from = new Date(Date.UTC(2026, 0, 15));
      expect(monthsElapsed(from, new Date(Date.UTC(2026, 0, 20)))).toBe(0); // < 1 month
      expect(monthsElapsed(from, new Date(Date.UTC(2026, 2, 15)))).toBe(2); // Feb 15 + Mar 15
      expect(monthsElapsed(from, new Date(Date.UTC(2026, 2, 15)), 1)).toBe(1); // capped
    });
  });

  describe('rate tables', () => {
    it('offers rates only for the published terms', () => {
      expect(cdApyForTerm(12)).toBe(450);
      expect(cdApyForTerm(7)).toBeNull();
      expect(loanApyForTerm(36)).toBe(950);
      expect(loanApyForTerm(11)).toBeNull();
    });
    it('formatApy renders basis points as a percentage', () => {
      expect(formatApy(450)).toBe('4.50%');
      expect(formatApy(DEFAULT_SAVINGS_APY_BPS)).toBe('1.50%');
    });
  });
});

describe('lending validators (v1.0.0)', () => {
  it('validateOpenCd requires a funding account, a valid principal, and an offered term', () => {
    expect(validateOpenCd({ fundingAccountId: 'acc', principalMinor: 5_000_00, termMonths: 12 })).toMatchObject({
      ok: true,
      value: { apyBps: 450, termMonths: 12, principalMinor: 5_000_00 },
    });
    expect(validateOpenCd({ fundingAccountId: '', principalMinor: 50, termMonths: 7 }).ok).toBe(false);
    expect(validateOpenCd({ fundingAccountId: 'a', principalMinor: 10, termMonths: 12 }).errors.principalMinor).toBeDefined();
    expect(validateOpenCd({ fundingAccountId: 'a', principalMinor: 5_000_00, termMonths: 7 }).errors.termMonths).toBeDefined();
  });

  it('validateOpenLoan computes the amortized payment for an offered term', () => {
    const res = validateOpenLoan({ disbursementAccountId: 'chk', principalMinor: 12_000_00, termMonths: 24 });
    expect(res.ok).toBe(true);
    expect(res.value!.apyBps).toBe(1050);
    expect(res.value!.paymentMinor).toBe(amortizedPaymentMinor(12_000_00, 1050, 24));
    expect(validateOpenLoan({ disbursementAccountId: '', principalMinor: 12_000_00, termMonths: 24 }).ok).toBe(false);
  });

  it('validateLoanPayment treats omitted amount as "scheduled payment" and bounds a custom amount', () => {
    expect(validateLoanPayment({ fromAccountId: 'chk' })).toMatchObject({ ok: true, value: { amountMinor: null } });
    expect(validateLoanPayment({ fromAccountId: 'chk', amountMinor: 250_00 }).value!.amountMinor).toBe(250_00);
    expect(validateLoanPayment({ fromAccountId: 'chk', amountMinor: 0 }).ok).toBe(false);
    expect(validateLoanPayment({ fromAccountId: '' }).ok).toBe(false);
  });

  it('validateWithdrawCd requires a destination account', () => {
    expect(validateWithdrawCd({ toAccountId: 'chk' }).ok).toBe(true);
    expect(validateWithdrawCd({ toAccountId: '' }).ok).toBe(false);
  });

  it('isCdWithdrawable only for a matured CD', () => {
    expect(isCdWithdrawable({ kind: 'cd', status: 'matured' })).toBe(true);
    expect(isCdWithdrawable({ kind: 'cd', status: 'active' })).toBe(false);
    expect(isCdWithdrawable({ kind: 'loan', status: 'matured' })).toBe(false);
  });
});

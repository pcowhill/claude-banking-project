import {
  cdApyForTerm,
  formatApy,
  loanApyForTerm,
  CD_TERMS_MONTHS,
  DEFAULT_SAVINGS_APY_BPS,
  LOAN_TERMS_MONTHS,
} from '@simbank/shared';
import { useAuth } from '../lib/auth-context';
import {
  CTASection,
  FeatureGrid,
  Icon,
  PageHero,
  RateTable,
  Section,
  SectionHeading,
  type Feature,
  type HeroCTA,
  type RateRow,
} from '../components/marketing';

/**
 * Loans & CDs marketing page (/borrow). Lending shipped in v1.0.0 — customers
 * open and manage CDs and loans in the authenticated portal at /loans — so this
 * page presents the product set as LIVE and clearly simulated (not "coming
 * soon"). It shows the REAL offered rate tables from the shared lending contract
 * (`CD_TERMS_MONTHS` / `cdApyForTerm`, `LOAN_TERMS_MONTHS` / `loanApyForTerm`)
 * and the simulated savings APY, so the marketing rates match what the portal
 * actually offers. The hero CTAs switch to a portal link for signed-in visitors.
 */

const lendingFeatures: Feature[] = [
  {
    icon: 'chart',
    title: 'Personal loans',
    description: 'Fixed-term loans with a clear, simulated monthly payment computed by amortization.',
  },
  {
    icon: 'clock',
    title: 'Certificates of Deposit',
    description: 'Lock in a simulated rate for a fixed term and watch interest accrue to the ledger.',
  },
  {
    icon: 'receipt',
    title: 'Simulated interest',
    description: 'Interest posts as explicit bank-originated ledger entries — earned on CDs, owed on loans.',
  },
  {
    icon: 'bolt',
    title: 'Simulated time',
    description: 'An operator-advanced clock moves accrual forward — no real-world timer.',
  },
  {
    icon: 'piggy',
    title: 'Savings interest',
    description: `Plain savings balances earn a simulated ${formatApy(DEFAULT_SAVINGS_APY_BPS)} APY, accrued on each clock advance.`,
  },
  {
    icon: 'lock',
    title: 'Flexible payments & withdrawals',
    description: 'Pay a loan down any time, and withdraw a CD to your account once it matures.',
  },
];

/** Offered CD rates, straight from the shared lending contract. */
const cdRates: RateRow[] = CD_TERMS_MONTHS.map((months) => ({
  label: `${months}-month CD`,
  value: `${formatApy(cdApyForTerm(months) ?? 0)} APY`,
  note: 'Simulated annual percentage yield',
}));

/** Offered loan rates, straight from the shared lending contract. */
const loanRates: RateRow[] = LOAN_TERMS_MONTHS.map((months) => ({
  label: `${months}-month loan`,
  value: `${formatApy(loanApyForTerm(months) ?? 0)} APY`,
  note: 'Simulated annual percentage rate',
}));

/** Savings APY row, shown alongside the deposit products. */
const savingsRates: RateRow[] = [
  {
    label: 'Goal Savings',
    value: `${formatApy(DEFAULT_SAVINGS_APY_BPS)} APY`,
    note: 'Simulated annual percentage yield',
  },
];

export function Borrow() {
  const { user } = useAuth();
  // Signed-in visitors go straight to the lending portal; logged-out visitors
  // get the standard auth-entry CTAs.
  const ctas: HeroCTA[] = user
    ? [
        { to: '/loans', label: 'Open a loan or CD', variant: 'primary' },
        { to: '/dashboard', label: 'Go to dashboard', variant: 'ghost' },
      ]
    : [
        { to: '/open-account', label: 'Open a (simulated) account', variant: 'primary' },
        { to: '/login', label: 'Log in to borrow or save', variant: 'ghost' },
      ];

  return (
    <div>
      <PageHero
        eyebrow="Loans & CDs"
        title="Borrow and save over simulated time"
        lead="Open a simulated loan or certificate of deposit, watch interest accrue as explicit ledger entries, and manage payments and maturities — all driven by a fast-forward simulation clock."
        ctas={ctas}
        image={{
          src: '/images/borrow-lifestyle.jpg',
          alt: 'A person reviewing a loan plan on a tablet at home',
          label: 'Lending & CDs lifestyle',
        }}
      />

      <Section>
        <div className="flex items-start gap-3 rounded-xl border border-brand-gold/40 bg-brand-gold/10 p-4 text-sm text-brand-ink">
          <Icon name="sparkles" className="mt-0.5 h-5 w-5 shrink-0 text-brand-teal-dark" />
          <p>
            <strong>Clearly simulated.</strong> No real lender, deposit product, credit decision, or
            money network is ever involved. Opening, repaying, or withdrawing moves only simulated
            money by appending ledger entries; interest accrues only when the simulation clock
            advances. Sign in and open <span className="font-medium">Loans &amp; CDs</span> in your
            portal to try it.
          </p>
        </div>

        <div className="mt-10">
          <SectionHeading
            eyebrow="What you can do"
            title="Lending and CDs, modeled with discipline"
            subtitle="Interest and payments post as explicit ledger entries, just like the rest of Meridian — every figure is reconcilable."
          />
          <FeatureGrid features={lendingFeatures} />
        </div>
      </Section>

      <Section tone="muted">
        <SectionHeading
          eyebrow="Simulated rates"
          title="Transparent and fictional"
          subtitle="The offered rates below are the exact simulated figures the portal uses — illustrative only, not an offer or real account terms."
        />
        <div className="grid gap-6 lg:grid-cols-2">
          <RateTable caption="Certificate of Deposit rates" rows={cdRates} />
          <RateTable caption="Loan rates" rows={loanRates} />
        </div>
        <RateTable caption="Savings interest" rows={savingsRates} />
        <p className="mt-4 text-xs text-slate-500">
          APYs above are illustrative simulation values only — not an offer, and not real account
          terms. Interest is modeled as bank-originated ledger entries for realism.
        </p>
      </Section>

      <CTASection
        title="Open a simulated loan or CD"
        body="Sign in to open a CD, take out a loan, or make a payment — or open a simulated account to get started."
        primaryLabel="Open a (simulated) account"
        primaryTo="/open-account"
        secondaryLabel="Log in"
        secondaryTo="/login"
      />
    </div>
  );
}

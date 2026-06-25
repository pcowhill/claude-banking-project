import {
  CTASection,
  FeatureGrid,
  Icon,
  PageHero,
  Section,
  SectionHeading,
  type Feature,
} from '../components/marketing';

const lendingFeatures: Feature[] = [
  {
    icon: 'chart',
    title: 'Personal loans',
    description: 'Fixed-term personal loans with a clear, simulated amortization schedule.',
    milestone: 'v0.9.0',
  },
  {
    icon: 'globe',
    title: 'Auto loans',
    description: 'Finance a simulated vehicle purchase and track payoff over time.',
    milestone: 'v0.9.0',
  },
  {
    icon: 'compass',
    title: 'Mortgage-style loans',
    description: 'Longer-term loans with simulated interest and statement cycles.',
    milestone: 'v0.9.0',
  },
  {
    icon: 'clock',
    title: 'Certificates of Deposit',
    description: 'Lock in a simulated rate for a fixed term and watch interest accrue.',
    milestone: 'v0.9.0',
  },
  {
    icon: 'receipt',
    title: 'Payment schedules',
    description: 'See every upcoming payment and how each splits between principal and interest.',
    milestone: 'v0.9.0',
  },
  {
    icon: 'bolt',
    title: 'Simulated time',
    description: 'A fast-forward simulation clock advances accrual and statement cycles.',
    milestone: 'v0.9.0',
  },
];

export function Borrow() {
  return (
    <div>
      <PageHero
        eyebrow="Loans & CDs · Coming soon"
        title="Borrow and save over time"
        lead="Personal, auto, and mortgage-style loans plus certificates of deposit — with simulated interest, payment schedules, and a fast-forward clock. This product set arrives in milestone v0.9.0."
        ctas={[
          { to: '/savings', label: 'Explore Savings', variant: 'primary' },
          { to: '/open-account', label: 'Open a (simulated) account', variant: 'ghost' },
        ]}
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
            <strong>Not built yet.</strong> Loans, CDs, and the simulation clock are planned for the
            v0.9.0 milestone. The capabilities below preview the plan — none of it is available in
            the app today.
          </p>
        </div>

        <div className="mt-10">
          <SectionHeading
            eyebrow="What’s coming"
            title="Lending and CDs, modeled with discipline"
            subtitle="Interest and schedules will post as explicit ledger entries, just like the rest of Meridian."
          />
          <FeatureGrid features={lendingFeatures} />
        </div>
      </Section>

      <CTASection
        title="Lending is on the roadmap"
        body="While loans and CDs are built, explore Checking and Savings with the seeded demo data."
        primaryLabel="See Savings"
        primaryTo="/savings"
        secondaryLabel="See Checking"
        secondaryTo="/checking"
      />
    </div>
  );
}

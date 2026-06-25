import {
  CTASection,
  FAQ,
  FeatureGrid,
  PageHero,
  RateTable,
  Section,
  SectionHeading,
  type Feature,
  type QA,
} from '../components/marketing';

const features: Feature[] = [
  {
    icon: 'compass',
    title: 'Goals that motivate',
    description: 'Name your goals and track progress toward each one with a clear visual.',
  },
  {
    icon: 'chart',
    title: 'Simulated interest',
    description: 'Interest accrues as bank-originated ledger entries — visible and reconcilable.',
  },
  {
    icon: 'sparkles',
    title: 'Automatic round-ups',
    description: 'Round up simulated purchases and sweep the difference into savings.',
    milestone: 'v0.7.0',
  },
  {
    icon: 'receipt',
    title: 'No monthly fees',
    description: 'No maintenance fee and no minimum balance in the simulation.',
  },
  {
    icon: 'lock',
    title: 'Your money, your view',
    description: 'Role-based access means you only ever see your own savings accounts.',
  },
  {
    icon: 'clock',
    title: 'Certificates of Deposit',
    description: 'Lock in a simulated rate for a fixed term when CDs arrive.',
    milestone: 'v0.9.0',
  },
];

const rates = [
  { label: 'Goal Savings APY', value: '3.75%', note: 'Simulated annual percentage yield' },
  { label: 'Minimum opening deposit', value: '$0.00' },
  { label: 'Monthly fee', value: '$0.00' },
  { label: 'Withdrawal limit', value: 'None', note: 'No simulated transfer limits' },
];

const faqs: QA[] = [
  {
    q: 'Is the APY real?',
    a: 'No. The 3.75% APY is an illustrative simulation figure. Meridian is not a real bank and pays no real interest — accrual is modeled as bank-originated ledger entries for realism.',
  },
  {
    q: 'How is interest applied?',
    a: 'As explicit, bank-originated credits to the append-only ledger. Because balances are derived from the ledger, every cent of simulated interest is traceable to an entry.',
  },
  {
    q: 'Can I open multiple savings goals?',
    a: 'Goal-based savings views expand alongside the banking dashboard milestone (v0.4.0). The seeded demo already includes a Goal Savings account to explore.',
  },
];

export function Savings() {
  return (
    <div>
      <PageHero
        eyebrow="Goal Savings"
        title="Save with intention"
        lead="Set goals and watch simulated interest accrue straight from the ledger. A realistic savings experience with nothing real at stake."
        ctas={[
          { to: '/open-account', label: 'Open a (simulated) account', variant: 'primary' },
          { to: '/login', label: 'Explore the demo', variant: 'ghost' },
        ]}
        image={{
          src: '/images/savings-goals.jpg',
          alt: 'A couple planning savings goals together at a kitchen table',
          label: 'Savings goals lifestyle',
        }}
      />

      <Section>
        <SectionHeading
          eyebrow="Features"
          title="A savings account that shows its work"
          subtitle="Clear goals, transparent interest, and the same ledger discipline as the rest of Meridian."
        />
        <FeatureGrid features={features} />
      </Section>

      <Section tone="muted">
        <SectionHeading
          eyebrow="Simulated rates & fees"
          title="Transparent and fictional"
          subtitle="Illustrative figures that show how savings disclosures would read in the simulation."
        />
        <RateTable caption="Goal Savings" rows={rates} />
        <p className="mt-4 text-xs text-slate-500">
          The APY and figures above are illustrative simulation values only — not an offer, and not
          real account terms.
        </p>
      </Section>

      <Section>
        <SectionHeading eyebrow="Questions" title="Savings FAQ" />
        <FAQ items={faqs} />
      </Section>

      <CTASection
        title="Start a simulated savings goal"
        body="Open a simulated account or sign in with a seeded demo customer to explore Goal Savings."
      />
    </div>
  );
}

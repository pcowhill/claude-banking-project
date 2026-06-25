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
    icon: 'receipt',
    title: 'No surprise fees',
    description: 'No monthly maintenance fee and no minimum balance in the simulation.',
  },
  {
    icon: 'bolt',
    title: 'Early direct deposit',
    description: 'Simulated paydays can land up to two days early so you can plan ahead.',
  },
  {
    icon: 'globe',
    title: 'Wide ATM network',
    description: 'A simulated fee-free ATM network, with clear out-of-network disclosures.',
  },
  {
    icon: 'chart',
    title: 'Spending at a glance',
    description: 'A clean dashboard with balances derived from an append-only ledger.',
  },
  {
    icon: 'phone',
    title: 'Card controls',
    description: 'Freeze, unfreeze, and travel notices arrive with the cards milestone.',
    milestone: 'v0.8.0',
  },
  {
    icon: 'bolt',
    title: 'Instant internal transfers',
    description: 'Move money between your Meridian accounts the moment money movement lands.',
    milestone: 'v0.7.0',
  },
];

const fees = [
  { label: 'Monthly maintenance fee', value: '$0.00' },
  { label: 'Minimum opening deposit', value: '$0.00' },
  { label: 'Overdraft fee', value: '$0.00', note: 'Transactions are declined rather than overdrawn' },
  { label: 'Out-of-network ATM', value: '$2.50', note: 'Simulated; waived in-network' },
  { label: 'Foreign transaction', value: '0%' },
];

const faqs: QA[] = [
  {
    q: 'Is this a real checking account?',
    a: 'No. Meridian is a local simulation for development and demos. Everything here uses fake, seeded data — no real money, deposits, or transactions.',
  },
  {
    q: 'How are balances calculated?',
    a: 'Your Available and Current balances are derived on the server from an append-only ledger. Balances are never stored as an editable number, so they always reconcile to the underlying entries.',
  },
  {
    q: 'When can I move money?',
    a: 'Transfers, bill pay, and deposits arrive in the money-movement milestone (v0.7.0). Until then you can explore accounts and balances with the seeded demo data.',
  },
  {
    q: 'How do I try it?',
    a: 'Open a (simulated) account to see the onboarding placeholder, or log in with a seeded demo customer from the login page.',
  },
];

export function Checking() {
  return (
    <div>
      <PageHero
        eyebrow="Everyday Checking"
        title="Checking that stays out of your way"
        lead="A fee-free everyday account with a calm spending view and balances you can always reconcile. Modeled realistically — entirely as a simulation."
        ctas={[
          { to: '/open-account', label: 'Open a (simulated) account', variant: 'primary' },
          { to: '/login', label: 'Explore the demo', variant: 'ghost' },
        ]}
        image={{
          src: '/images/checking-lifestyle.jpg',
          alt: 'A person paying for coffee with a phone at a café counter',
          label: 'Everyday checking lifestyle',
        }}
      />

      <Section>
        <SectionHeading
          eyebrow="Features"
          title="Designed for everyday spending"
          subtitle="The essentials today, with richer money movement and card controls arriving on the roadmap."
        />
        <FeatureGrid features={features} />
      </Section>

      <Section tone="muted">
        <SectionHeading
          eyebrow="Simulated rates & fees"
          title="Clear, simple, and fictional"
          subtitle="These illustrative figures show how disclosures would read. They are part of the simulation and are not real account terms."
        />
        <RateTable caption="Everyday Checking" rows={fees} />
        <p className="mt-4 text-xs text-slate-500">
          Figures are illustrative simulation values only — not an offer, and not real account terms.
        </p>
      </Section>

      <Section>
        <SectionHeading eyebrow="Questions" title="Checking FAQ" />
        <FAQ items={faqs} />
      </Section>

      <CTASection
        title="Ready to explore Everyday Checking?"
        body="Open a simulated account or sign in with a seeded demo customer to see ledger-derived balances in action."
      />
    </div>
  );
}

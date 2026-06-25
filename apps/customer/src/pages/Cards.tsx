import {
  CTASection,
  FeatureGrid,
  Icon,
  PageHero,
  Section,
  SectionHeading,
  type Feature,
} from '../components/marketing';

const cardFeatures: Feature[] = [
  {
    icon: 'card',
    title: 'Debit & credit cards',
    description: 'Issue simulated debit and credit cards tied to your Meridian accounts.',
    milestone: 'v0.8.0',
  },
  {
    icon: 'lock',
    title: 'Freeze & unfreeze',
    description: 'Instantly lock a card and unlock it again — no phone call required.',
    milestone: 'v0.8.0',
  },
  {
    icon: 'globe',
    title: 'Travel notices',
    description: 'Tell the bank where you are headed so simulated purchases sail through.',
    milestone: 'v0.8.0',
  },
  {
    icon: 'shield',
    title: 'Fraud alerts',
    description: 'Explainable rules flag suspicious activity and ask you to confirm.',
    milestone: 'v0.8.0',
  },
  {
    icon: 'receipt',
    title: 'Disputes',
    description: 'Open a dispute on a simulated charge and track it through the ops console.',
    milestone: 'v0.8.0',
  },
  {
    icon: 'bolt',
    title: 'Lost or stolen flow',
    description: 'Report, freeze, and replace a card with a clear, guided journey.',
    milestone: 'v0.8.0',
  },
];

export function Cards() {
  return (
    <div>
      <PageHero
        eyebrow="Cards · Coming soon"
        title="Cards, with controls you actually use"
        lead="Debit and credit cards with freeze, travel notices, fraud alerts, and disputes — modeled end to end with the bank-operations console. This product arrives in milestone v0.8.0."
        ctas={[
          { to: '/checking', label: 'Explore what’s available', variant: 'primary' },
          { to: '/open-account', label: 'Open a (simulated) account', variant: 'ghost' },
        ]}
        image={{
          src: '/images/product-card.jpg',
          alt: 'A sleek unbranded payment card on a soft gradient background',
          label: 'Card product render',
        }}
      />

      <Section>
        <div className="flex items-start gap-3 rounded-xl border border-brand-gold/40 bg-brand-gold/10 p-4 text-sm text-brand-ink">
          <Icon name="sparkles" className="mt-0.5 h-5 w-5 shrink-0 text-brand-teal-dark" />
          <p>
            <strong>Not built yet.</strong> Cards are planned for the v0.8.0 milestone. The
            capabilities below preview what is coming so the roadmap is clear — none of it is
            available in the app today.
          </p>
        </div>

        <div className="mt-10">
          <SectionHeading
            eyebrow="What’s coming"
            title="A complete card experience"
            subtitle="Each capability is tagged with the milestone that delivers it."
          />
          <FeatureGrid features={cardFeatures} />
        </div>
      </Section>

      <CTASection
        title="Cards are on the way"
        body="While cards are built, explore Checking and Savings with the seeded demo data."
        primaryLabel="See Checking"
        primaryTo="/checking"
        secondaryLabel="See Savings"
        secondaryTo="/savings"
      />
    </div>
  );
}

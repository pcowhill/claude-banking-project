import { useAuth } from '../lib/auth-context';
import {
  CTASection,
  FeatureGrid,
  Icon,
  PageHero,
  Section,
  SectionHeading,
  type Feature,
  type HeroCTA,
} from '../components/marketing';

/**
 * Cards marketing page (/cards). The card product shipped in v0.8.0 — customers
 * manage cards in the authenticated portal at /wallet — so this page presents
 * cards as a LIVE, clearly-simulated feature (not "coming soon"). The hero CTAs
 * switch to a "Manage your cards" link for signed-in visitors; logged-out
 * visitors get the standard open-account / login entry points.
 */

const cardFeatures: Feature[] = [
  {
    icon: 'card',
    title: 'Debit & credit cards',
    description: 'Issue simulated debit and credit cards tied to your Meridian accounts.',
  },
  {
    icon: 'lock',
    title: 'Freeze & unfreeze',
    description: 'Instantly lock a card and unlock it again — no phone call required.',
  },
  {
    icon: 'globe',
    title: 'Travel notices',
    description: 'Tell the bank where you are headed so simulated purchases sail through.',
  },
  {
    icon: 'shield',
    title: 'Fraud alerts',
    description: 'Explainable rules flag suspicious activity and ask you to confirm.',
  },
  {
    icon: 'receipt',
    title: 'Disputes',
    description: 'Open a dispute on a simulated charge and track it through the ops console.',
  },
  {
    icon: 'bolt',
    title: 'Lost or stolen flow',
    description: 'Report, freeze, and replace a card with a clear, guided journey.',
  },
];

export function Cards() {
  const { user } = useAuth();
  // Signed-in visitors go straight to the wallet; logged-out visitors get the
  // standard auth-entry CTAs (which PageHero collapses if already signed in).
  const ctas: HeroCTA[] = user
    ? [
        { to: '/wallet', label: 'Manage your cards', variant: 'primary' },
        { to: '/dashboard', label: 'Go to dashboard', variant: 'ghost' },
      ]
    : [
        { to: '/open-account', label: 'Open a (simulated) account', variant: 'primary' },
        { to: '/login', label: 'Log in to manage cards', variant: 'ghost' },
      ];

  return (
    <div>
      <PageHero
        eyebrow="Cards"
        title="Cards, with controls you actually use"
        lead="Debit and credit cards with freeze, travel notices, fraud alerts, and disputes — modeled end to end with the bank-operations console. Manage your simulated cards from your portal wallet."
        ctas={ctas}
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
            <strong>Simulated cards.</strong> These are clearly fake cards — a masked last-four, a
            simulated network and expiry. No real card network, PAN, or issuer is ever involved, and
            card actions move no money. Sign in and open your{' '}
            <span className="font-medium">wallet</span> to try freeze, travel notices, and disputes.
          </p>
        </div>

        <div className="mt-10">
          <SectionHeading
            eyebrow="What you can do"
            title="A complete card experience"
            subtitle="Every capability below is live in the portal today — all clearly simulated."
          />
          <FeatureGrid features={cardFeatures} />
        </div>
      </Section>

      <CTASection
        title="Manage your simulated cards"
        body="Sign in to freeze a card, add a travel notice, or dispute a charge — or open a simulated account to get started."
        primaryLabel="Open a (simulated) account"
        primaryTo="/open-account"
        secondaryLabel="Log in"
        secondaryTo="/login"
      />
    </div>
  );
}

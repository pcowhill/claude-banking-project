import { Link } from 'react-router-dom';
import { BRAND } from '@simbank/shared';
import { Button } from '../components/ui/Button';
import { BackendStatusPill } from '../components/BackendStatusPill';
import { ImagePlaceholder } from '../components/ImagePlaceholder';
import {
  CTASection,
  FeatureGrid,
  Icon,
  PageHero,
  Section,
  SectionHeading,
  type Feature,
  type IconName,
} from '../components/marketing';

/** Why-Meridian value props. */
const valueProps: Feature[] = [
  {
    icon: 'compass',
    title: 'Clarity by design',
    description:
      'A calm, uncluttered interface with balances derived from an append-only ledger — what you see is always reconcilable.',
  },
  {
    icon: 'shield',
    title: 'Security you can see',
    description:
      'Real password hashing, role-based access, and an audit trail behind every sensitive action. You only ever see your own accounts.',
  },
  {
    icon: 'sparkles',
    title: 'Built in the open',
    description:
      'Meridian is a transparent simulation shipped milestone by milestone — every feature is documented and clearly labelled.',
  },
];

interface ProductHighlight {
  to: string;
  title: string;
  description: string;
  icon: IconName;
  tag: string;
}

const productHighlights: ProductHighlight[] = [
  {
    to: '/checking',
    title: 'Everyday Checking',
    description: 'No surprise fees, simulated early direct deposit, and a clean spending view.',
    icon: 'card',
    tag: 'Explore now',
  },
  {
    to: '/savings',
    title: 'Goal Savings',
    description: 'Set goals and watch simulated interest accrue straight from the ledger.',
    icon: 'piggy',
    tag: 'Explore now',
  },
  {
    to: '/cards',
    title: 'Cards',
    description: 'Issue simulated debit and credit cards with freeze, travel notices, and disputes.',
    icon: 'lock',
    tag: 'Explore now',
  },
  {
    to: '/borrow',
    title: 'Loans & CDs',
    description: 'Open a simulated loan or certificate of deposit and watch interest accrue.',
    icon: 'chart',
    tag: 'Explore now',
  },
];

export function MarketingHome() {
  return (
    <div>
      <PageHero
        eyebrow={BRAND.tagline}
        title={
          <>
            Modern banking that keeps you <span className="text-brand-teal-dark">on course</span>.
          </>
        }
        lead={
          <>
            Checking, savings, cards, and loans in one calm, secure place. Meridian is a realistic{' '}
            <strong>simulated</strong> bank built to explore great banking UX — without any real
            money.
          </>
        }
        ctas={[
          { to: '/open-account', label: 'Open a (simulated) account', variant: 'primary' },
          { to: '/login', label: 'Log in', variant: 'ghost' },
        ]}
        image={{
          src: '/images/hero-family.jpg',
          alt: 'A family enjoying everyday banking together',
          label: 'Hero image',
        }}
      >
        <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-500">
          <BackendStatusPill />
          <span className="inline-flex items-center gap-1.5">
            <Icon name="lock" className="h-4 w-4 text-brand-teal-dark" /> Encrypted demo sessions
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Icon name="receipt" className="h-4 w-4 text-brand-teal-dark" /> Ledger-derived balances
          </span>
        </div>
      </PageHero>

      {/* Value props */}
      <Section>
        <SectionHeading
          eyebrow="Why Meridian"
          title="Banking that earns trust through transparency"
          subtitle="Every part of the experience is designed to be understandable — for customers and for the engineers building it."
        />
        <FeatureGrid features={valueProps} />
      </Section>

      {/* Product highlights */}
      <Section tone="muted">
        <SectionHeading
          eyebrow="Products"
          title="Everything you expect from a bank"
          subtitle="Checking, savings, cards, and loans & CDs are all live to explore today — every one a clearly-labelled simulation."
        />
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {productHighlights.map((product) => (
            <Link
              key={product.to}
              to={product.to}
              className="group flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal"
            >
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-brand-mist text-brand-teal-dark">
                <Icon name={product.icon} />
              </span>
              <div className="mt-4 flex items-center justify-between gap-2">
                <h3 className="text-base font-semibold text-brand-navy">{product.title}</h3>
              </div>
              <p className="mt-1.5 flex-1 text-sm text-slate-600">{product.description}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-teal-dark group-hover:gap-2">
                {product.tag} <span aria-hidden="true">→</span>
              </span>
            </Link>
          ))}
        </div>
      </Section>

      {/* Experience cards */}
      <Section>
        <div className="grid gap-6 md:grid-cols-2">
          <article className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <ImagePlaceholder
              src="/images/feature-professional.jpg"
              alt="A professional reviewing finances on a laptop and phone"
              label="Professional banking"
              className="aspect-[3/2] w-full"
            />
            <div className="p-6">
              <h3 className="text-lg font-semibold text-brand-navy">Bank from anywhere</h3>
              <p className="mt-1.5 text-sm text-slate-600">
                A responsive portal for desktop and mobile, with a clean dashboard and real-time
                status. Designed to feel fast and reassuring on any screen.
              </p>
            </div>
          </article>
          <article className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <ImagePlaceholder
              src="/images/feature-small-business.jpg"
              alt="A small-business owner checking finances behind the counter"
              label="Small business"
              className="aspect-[3/2] w-full"
            />
            <div className="p-6">
              <h3 className="text-lg font-semibold text-brand-navy">Built for real life</h3>
              <p className="mt-1.5 text-sm text-slate-600">
                Transfers, bill pay, deposits, disputes, and fraud protection — each modeled end to
                end as the simulation grows, with a bank-operations console behind the scenes.
              </p>
            </div>
          </article>
        </div>
      </Section>

      {/* Security teaser */}
      <Section tone="muted">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div className="overflow-hidden rounded-2xl shadow-lg">
            <ImagePlaceholder
              src="/images/security-protection.jpg"
              alt="An abstract shield representing security and fraud protection"
              label="Security & fraud protection"
              className="aspect-[16/10] w-full"
            />
          </div>
          <div>
            <SectionHeading
              eyebrow="Security"
              title="Protection built in from the first milestone"
              subtitle="Authentication, access control, and audit logging landed early — so the discipline is structural, not bolted on later."
            />
            <ul className="mt-5 space-y-3 text-sm text-slate-700">
              {[
                'Explainable rules and audit logs — no black-box decisions',
                'Role-based access: customers see only their own accounts',
                'Independent sessions for the customer and operations apps',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <Icon name="shield" className="mt-0.5 h-5 w-5 shrink-0 text-brand-teal-dark" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <Link to="/about#security" className="mt-6 inline-block">
              <Button variant="ghost">How security works</Button>
            </Link>
          </div>
        </div>
      </Section>

      {/* Testimonial (clearly a simulated persona) */}
      <Section>
        <figure className="mx-auto max-w-3xl text-center">
          <blockquote className="text-xl font-medium text-brand-navy sm:text-2xl">
            “Meridian makes it obvious where every number comes from. It is the clearest banking
            experience I have used — and it is all a transparent simulation.”
          </blockquote>
          <figcaption className="mt-4 text-sm text-slate-500">
            Sample persona · illustrative testimonial for the Meridian simulation
          </figcaption>
        </figure>
      </Section>

      <CTASection />
    </div>
  );
}

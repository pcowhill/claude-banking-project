import { MILESTONE } from '@simbank/shared';
import {
  CTASection,
  FeatureGrid,
  Icon,
  PageHero,
  Section,
  SectionHeading,
  type Feature,
} from '../components/marketing';

const securityFeatures: Feature[] = [
  {
    icon: 'lock',
    title: 'Real password hashing',
    description: 'Credentials are hashed with a standard library (bcrypt) — never custom crypto.',
  },
  {
    icon: 'shield',
    title: 'Role-based access control',
    description: 'Customers see only their own accounts; staff tools are gated by role.',
  },
  {
    icon: 'compass',
    title: 'Independent app sessions',
    description: 'The customer portal and operations console keep separate sessions that never cross.',
  },
  {
    icon: 'receipt',
    title: 'Audit logging',
    description: 'Notable actions — logins, lockouts, admin changes — are recorded for review.',
  },
  {
    icon: 'chart',
    title: 'Ledger-derived balances',
    description: 'Money is derived from an append-only ledger and never stored as an editable field.',
  },
  {
    icon: 'clock',
    title: 'Session lockout',
    description: 'Repeated failed logins temporarily lock an account to slow brute-force attempts.',
  },
];

interface Milestone {
  tag: string;
  name: string;
  status: 'done' | 'current' | 'planned';
}

const roadmap: Milestone[] = [
  { tag: 'v0.1.0', name: 'Project foundation', status: 'done' },
  { tag: 'v0.2.0', name: 'Auth, roles, and demo users', status: 'done' },
  { tag: 'v0.3.0', name: 'Public bank website and branding', status: 'current' },
  { tag: 'v0.4.0', name: 'Customer banking dashboard', status: 'planned' },
  { tag: 'v0.5.0', name: 'Operations simulator core', status: 'planned' },
  { tag: 'v0.6.0', name: 'Onboarding and account opening', status: 'planned' },
  { tag: 'v0.7.0', name: 'Money movement', status: 'planned' },
  { tag: 'v0.8.0', name: 'Cards, fraud, disputes', status: 'planned' },
  { tag: 'v0.9.0', name: 'Loans, CDs, simulated time', status: 'planned' },
  { tag: 'v1.0.0', name: 'Polish, hardening, retrospective', status: 'planned' },
];

const statusStyles: Record<Milestone['status'], { label: string; className: string }> = {
  done: { label: 'Complete', className: 'bg-emerald-100 text-emerald-700' },
  current: { label: 'In progress', className: 'bg-brand-teal/15 text-brand-teal-dark' },
  planned: { label: 'Planned', className: 'bg-slate-100 text-slate-500' },
};

export function About() {
  return (
    <div>
      <PageHero
        eyebrow="About Meridian"
        title="A bank you can read like a book"
        lead="Meridian is a local-first, fully simulated consumer bank — and an experiment in building a larger software project across many milestones. Every feature is documented, transparent, and clearly fictional."
        ctas={[{ to: '/open-account', label: 'Explore the simulation', variant: 'primary' }]}
        image={{
          src: '/images/about-operations.jpg',
          alt: 'An abstract illustration of a calm, modern banking operations workspace',
          label: 'Behind the scenes',
        }}
      />

      <Section>
        <SectionHeading
          eyebrow="What it is"
          title="Two apps, one transparent system"
          subtitle="A customer experience and the bank-side operations that support it — both simulated, so you can see how a bank works from both angles."
        />
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-brand-mist text-brand-teal-dark">
              <Icon name="phone" />
            </span>
            <h3 className="mt-4 text-lg font-semibold text-brand-navy">The customer app</h3>
            <p className="mt-1.5 text-sm text-slate-600">
              This site and a secure portal where simulated customers sign in, view accounts with
              ledger-derived balances, and — over time — move money and manage cards.
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-brand-mist text-brand-teal-dark">
              <Icon name="shield" />
            </span>
            <h3 className="mt-4 text-lg font-semibold text-brand-navy">The operations console</h3>
            <p className="mt-1.5 text-sm text-slate-600">
              A separate staff app that simulates the bank-side of things — request queues,
              approvals, and the external events (SMS, email, identity checks) a real bank handles.
            </p>
          </div>
        </div>
      </Section>

      {/* Security (anchored from the home page + footer) */}
      <Section tone="muted" id="security">
        <SectionHeading
          eyebrow="Security"
          title="Protection built in from the start"
          subtitle="Authentication, access control, and audit logging landed in the second milestone — so security is structural, not an afterthought."
        />
        <FeatureGrid features={securityFeatures} />
        <p className="mt-6 text-xs text-slate-500">
          Meridian models real security practices for realism. Because it is a simulation, it
          protects only fake, seeded demo data — never real credentials, money, or personal
          information.
        </p>
      </Section>

      {/* Roadmap snapshot */}
      <Section>
        <SectionHeading
          eyebrow="Roadmap"
          title="Shipped milestone by milestone"
          subtitle={`Each milestone ends in a runnable state with a human review. You are viewing ${MILESTONE}.`}
        />
        <ol className="mt-8 space-y-2">
          {roadmap.map((milestone) => {
            const style = statusStyles[milestone.status];
            return (
              <li
                key={milestone.tag}
                className={cnRow(milestone.status)}
              >
                <span className="font-mono text-xs text-slate-500">{milestone.tag}</span>
                <span className="flex-1 text-sm font-medium text-brand-navy">{milestone.name}</span>
                <span
                  className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${style.className}`}
                >
                  {style.label}
                </span>
              </li>
            );
          })}
        </ol>
      </Section>

      {/* Simulation disclaimer */}
      <Section tone="muted">
        <div className="rounded-2xl border border-brand-gold/40 bg-brand-gold/10 p-6 text-center">
          <h2 className="text-lg font-bold text-brand-navy">This is a simulation</h2>
          <p className="mx-auto mt-2 max-w-2xl text-sm text-brand-ink">
            Meridian is a local-first simulated banking environment for development and demos only.
            It is not a real bank, is not FDIC insured, and never handles real money, real accounts,
            or real financial integrations.
          </p>
        </div>
      </Section>

      <CTASection />
    </div>
  );
}

/** Row styling for the roadmap list, emphasizing the current milestone. */
function cnRow(status: Milestone['status']): string {
  const base =
    'flex items-center gap-3 rounded-lg border px-4 py-3';
  return status === 'current'
    ? `${base} border-brand-teal/40 bg-white shadow-sm`
    : `${base} border-slate-200 bg-white`;
}

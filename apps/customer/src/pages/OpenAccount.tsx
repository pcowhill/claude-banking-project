import { Link } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Icon, PageHero, Section, SectionHeading } from '../components/marketing';

const steps = [
  {
    icon: 'compass' as const,
    title: 'Tell us about you',
    description: 'A short simulated application — name, contact, and the account you want.',
  },
  {
    icon: 'shield' as const,
    title: 'Identity verification',
    description: 'A simulated identity check, handled by the bank-operations console.',
  },
  {
    icon: 'receipt' as const,
    title: 'Fund your account',
    description: 'Choose a simulated opening deposit to get your first ledger entry.',
  },
  {
    icon: 'sparkles' as const,
    title: 'Start banking',
    description: 'Your accounts appear in the portal with balances derived from the ledger.',
  },
];

export function OpenAccount() {
  return (
    <div>
      <PageHero
        eyebrow="Open an account"
        title="Account opening is coming in v0.6.0"
        lead="The full self-service onboarding flow — application, identity verification, and initial funding — arrives in the onboarding milestone. In the meantime, you can explore the whole experience with seeded demo customers."
        ctas={[
          { to: '/login', label: 'Explore with a demo login', variant: 'primary' },
          { to: '/checking', label: 'Compare accounts', variant: 'ghost' },
        ]}
      />

      <Section>
        <SectionHeading
          eyebrow="What to expect"
          title="How opening an account will work"
          subtitle="A preview of the simulated onboarding journey planned for milestone v0.6.0."
        />
        <ol className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, index) => (
            <li key={step.title} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-brand-mist text-brand-teal-dark">
                  <Icon name={step.icon} />
                </span>
                <span className="text-2xl font-bold text-slate-200">{index + 1}</span>
              </div>
              <h3 className="mt-4 text-base font-semibold text-brand-navy">{step.title}</h3>
              <p className="mt-1.5 text-sm text-slate-600">{step.description}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section tone="muted">
        <Card className="mx-auto max-w-2xl text-center">
          <h2 className="text-lg font-semibold text-brand-navy">Want to look around now?</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
            Sign in with a seeded, non-secret demo customer to see accounts, ledger-derived balances,
            and recent sign-in activity — no real details required.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <Link to="/login">
              <Button>Go to the demo login</Button>
            </Link>
            <Link to="/savings">
              <Button variant="ghost">Browse products</Button>
            </Link>
          </div>
          <p className="mt-5 rounded-lg bg-brand-gold/15 px-3 py-2 text-xs text-brand-ink">
            Reminder: Meridian is a simulation. Opening an account here will never involve real
            money, real identity data, or a real financial institution.
          </p>
        </Card>
      </Section>
    </div>
  );
}

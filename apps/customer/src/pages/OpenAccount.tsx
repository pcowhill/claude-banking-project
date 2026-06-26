import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  ONBOARDING_FUNDING,
  ONBOARDING_PRODUCTS,
  ONBOARDING_PRODUCT_LABELS,
  formatMinor,
  toMinor,
  validateOpenAccount,
  type OnboardingProduct,
  type OpenAccountField,
  type OpenAccountResponse,
} from '@simbank/shared';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Icon, PageHero, Section, SectionHeading } from '../components/marketing';
import { cn } from '../lib/cn';
import { submitApplication } from '../lib/onboarding';

/**
 * Open-account application (v0.6.0, task N-09). A real, clearly-SIMULATED
 * self-service onboarding form that posts to the public
 * `POST /api/onboarding/applications`. Submitting only QUEUES a fake work item —
 * an operator must approve it before any user/account/money is created — so the
 * confirmation panel sets that expectation and points the applicant at /login.
 *
 * Validation runs client-side through the shared `validateOpenAccount` (the very
 * same validator the server uses) so field errors show before submit; the
 * server's 400 `fields` are merged in for things the client can't know (e.g. a
 * duplicate email). Degrades gracefully on network/offline failures.
 */

/** The intro "how it works" steps (kept from the previous placeholder). */
const steps = [
  {
    icon: 'compass' as const,
    title: 'Tell us about you',
    description: 'A short simulated application — name, email, and the account you want.',
  },
  {
    icon: 'shield' as const,
    title: 'Operator review',
    description: 'A simulated identity/eligibility check in the bank-operations console.',
  },
  {
    icon: 'receipt' as const,
    title: 'Funded on approval',
    description: 'Your opening deposit posts as an explicit bank-originated ledger entry.',
  },
  {
    icon: 'sparkles' as const,
    title: 'Start banking',
    description: 'Sign in and your accounts appear with balances derived from the ledger.',
  },
];

/** Per-field error map keyed by the shared field names. */
type FieldErrors = Partial<Record<OpenAccountField, string>>;

/** Shared input/label classes, matching the sign-in form. */
const inputClass =
  'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal';
const labelClass = 'block text-sm font-medium text-slate-700';

/** A small, accessible field error line. */
function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1 text-xs text-rose-600">
      {message}
    </p>
  );
}

/** Confirmation panel shown after a successful submission. */
function Confirmation({ result }: { result: OpenAccountResponse }) {
  return (
    <Card className="mx-auto max-w-xl">
      <div className="flex items-start gap-3">
        <span
          className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600"
          aria-hidden="true"
        >
          <Icon name="sparkles" className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-lg font-semibold text-brand-navy">
            Application received (simulated)
          </h2>
          <p className="mt-1 text-sm text-slate-600">{result.message}</p>
        </div>
      </div>

      <dl className="mt-5 rounded-lg border border-slate-200 bg-brand-mist px-4 py-3 text-sm">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-slate-500">Reference</dt>
          <dd className="font-mono font-semibold text-brand-navy">{result.reference}</dd>
        </div>
        <div className="mt-2 flex items-center justify-between gap-3">
          <dt className="text-slate-500">Account requested</dt>
          <dd className="font-medium text-brand-navy">
            {ONBOARDING_PRODUCT_LABELS[result.product]}
          </dd>
        </div>
      </dl>

      <div className="mt-5">
        <h3 className="text-sm font-semibold text-brand-navy">What happens next</h3>
        <ol className="mt-2 space-y-1.5 text-sm text-slate-600">
          <li>1. A bank operator reviews your simulated application.</li>
          <li>
            2. Once approved, your account is provisioned and any opening deposit posts as a
            bank-originated ledger entry.
          </li>
          <li>
            3. Sign in with the{' '}
            <span className="font-medium text-slate-700">email and password</span> you chose to see
            your accounts.
          </li>
        </ol>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link to="/login">
          <Button>Go to sign in</Button>
        </Link>
        <Link to="/">
          <Button variant="ghost">Back to home</Button>
        </Link>
      </div>

      <p className="mt-5 rounded-lg bg-brand-gold/15 px-3 py-2 text-xs text-brand-ink">
        Reminder: Meridian is a simulation. No real money, identity, or financial institution is
        involved — and no account or money exists until an operator approves this request.
      </p>
    </Card>
  );
}

/** The application form itself. */
function ApplicationForm({ onSuccess }: { onSuccess: (result: OpenAccountResponse) => void }) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [product, setProduct] = useState<OnboardingProduct>('checking');
  // Opening deposit is entered in DOLLARS; converted to cents on submit.
  const [deposit, setDeposit] = useState('0');
  const [jointInviteEmail, setJointInviteEmail] = useState('');
  const [consent, setConsent] = useState(false);

  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const maxDollars = ONBOARDING_FUNDING.maxMinor / 100;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setFormError(null);

    // Parse the dollar amount → integer cents. An unparseable value becomes NaN,
    // which the shared validator rejects as "valid opening-deposit amount".
    const parsedDollars = Number.parseFloat(deposit);
    const initialFundingMinor = Number.isFinite(parsedDollars) ? toMinor(parsedDollars) : NaN;

    const result = validateOpenAccount({
      fullName,
      email,
      password,
      product,
      initialFundingMinor,
      consent,
      jointInviteEmail: jointInviteEmail.trim() === '' ? null : jointInviteEmail,
    });

    if (!result.ok || !result.value) {
      setErrors(result.errors);
      return;
    }

    setErrors({});
    setSubmitting(true);
    // Submit the NORMALIZED value (trimmed, lowercased, cents) — the same shape
    // the server expects. `consent` is true here by construction.
    const response = await submitApplication({ ...result.value, consent: true });
    if (response.ok) {
      onSuccess(response.data);
      return;
    }
    // Map any server-side field errors back onto the inputs, plus a summary.
    if (response.fields) setErrors(response.fields as FieldErrors);
    setFormError(response.message);
    setSubmitting(false);
  }

  return (
    <Card className="mx-auto max-w-2xl">
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        <div>
          <label htmlFor="fullName" className={labelClass}>
            Full name
          </label>
          <input
            id="fullName"
            type="text"
            autoComplete="name"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Alex Rivera"
            aria-invalid={!!errors.fullName}
            aria-describedby={errors.fullName ? 'fullName-error' : undefined}
            className={inputClass}
          />
          <FieldError id="fullName-error" message={errors.fullName} />
        </div>

        <div>
          <label htmlFor="email" className={labelClass}>
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="alex.rivera@example.com"
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? 'email-error' : undefined}
            className={inputClass}
          />
          <FieldError id="email-error" message={errors.email} />
        </div>

        <div>
          <label htmlFor="password" className={labelClass}>
            Choose a password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            aria-invalid={!!errors.password}
            aria-describedby={errors.password ? 'password-error' : 'password-hint'}
            className={inputClass}
          />
          {errors.password ? (
            <FieldError id="password-error" message={errors.password} />
          ) : (
            <p id="password-hint" className="mt-1 text-xs text-slate-500">
              You’ll use this with your email to sign in once approved. Simulated — never reuse a
              real password.
            </p>
          )}
        </div>

        <fieldset>
          <legend className={labelClass}>Account to open</legend>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {ONBOARDING_PRODUCTS.map((p) => {
              const selected = product === p;
              return (
                <label
                  key={p}
                  className={cn(
                    'flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 transition-colors',
                    'focus-within:ring-2 focus-within:ring-brand-teal focus-within:ring-offset-1',
                    selected
                      ? 'border-brand-teal bg-brand-mist'
                      : 'border-slate-200 hover:border-brand-teal/60',
                  )}
                >
                  <input
                    type="radio"
                    name="product"
                    value={p}
                    checked={selected}
                    onChange={() => setProduct(p)}
                    className="mt-1 h-4 w-4 text-brand-teal focus:ring-brand-teal"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-brand-navy">
                      {p === 'checking' ? 'Checking' : 'Savings'}
                    </span>
                    <span className="block text-xs text-slate-500">
                      {ONBOARDING_PRODUCT_LABELS[p]}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
          <FieldError id="product-error" message={errors.product} />
        </fieldset>

        <div>
          <label htmlFor="deposit" className={labelClass}>
            Opening deposit (simulated)
          </label>
          <div className="mt-1 flex items-center">
            <span className="inline-flex h-[38px] items-center rounded-l-lg border border-r-0 border-slate-300 bg-slate-50 px-3 text-sm text-slate-500">
              $
            </span>
            <input
              id="deposit"
              type="number"
              inputMode="decimal"
              min={0}
              max={maxDollars}
              step="0.01"
              value={deposit}
              onChange={(e) => setDeposit(e.target.value)}
              aria-invalid={!!errors.initialFundingMinor}
              aria-describedby={errors.initialFundingMinor ? 'deposit-error' : 'deposit-hint'}
              className={cn(inputClass, 'mt-0 rounded-l-none')}
            />
          </div>
          {errors.initialFundingMinor ? (
            <FieldError id="deposit-error" message={errors.initialFundingMinor} />
          ) : (
            <p id="deposit-hint" className="mt-1 text-xs text-slate-500">
              Between {formatMinor(ONBOARDING_FUNDING.minMinor)} and{' '}
              {formatMinor(ONBOARDING_FUNDING.maxMinor)}. Enter $0 to fund later.
            </p>
          )}
        </div>

        <div>
          <label htmlFor="jointInviteEmail" className={labelClass}>
            Invite a joint owner <span className="font-normal text-slate-400">(optional)</span>
          </label>
          <input
            id="jointInviteEmail"
            type="email"
            autoComplete="off"
            value={jointInviteEmail}
            onChange={(e) => setJointInviteEmail(e.target.value)}
            placeholder="partner@example.com"
            aria-invalid={!!errors.jointInviteEmail}
            aria-describedby={
              errors.jointInviteEmail ? 'jointInviteEmail-error' : 'jointInviteEmail-hint'
            }
            className={inputClass}
          />
          {errors.jointInviteEmail ? (
            <FieldError id="jointInviteEmail-error" message={errors.jointInviteEmail} />
          ) : (
            <p id="jointInviteEmail-hint" className="mt-1 text-xs text-slate-500">
              We’ll send them a simulated invitation to join the account once it’s approved.
            </p>
          )}
        </div>

        <div className="rounded-lg border border-slate-200 bg-brand-mist/60 p-3">
          <label className="flex items-start gap-3 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              aria-invalid={!!errors.consent}
              aria-describedby={errors.consent ? 'consent-error' : undefined}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-teal focus:ring-brand-teal"
            />
            <span>
              I understand this is a <strong>simulation</strong> — no real money, identity, or
              financial institution is involved — and I accept the simulated terms.
            </span>
          </label>
          <FieldError id="consent-error" message={errors.consent} />
        </div>

        {formError && (
          <p
            role="alert"
            className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700"
          >
            {formError}
          </p>
        )}

        <Button type="submit" size="lg" className="w-full" disabled={submitting}>
          {submitting ? 'Submitting application…' : 'Submit simulated application'}
        </Button>

        <p className="text-center text-xs text-slate-500">
          Already have a simulated account?{' '}
          <Link to="/login" className="font-medium text-brand-teal-dark hover:underline">
            Sign in
          </Link>
        </p>
      </form>
    </Card>
  );
}

export function OpenAccount() {
  const [confirmation, setConfirmation] = useState<OpenAccountResponse | null>(null);

  return (
    <div>
      <PageHero
        eyebrow="Open an account"
        title="Open a simulated account"
        lead="Apply for a simulated Checking or Savings account. Submitting only queues a request for a bank operator to review — nothing real, and no money moves until it’s approved."
      />

      <Section>
        {confirmation ? (
          <Confirmation result={confirmation} />
        ) : (
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
            <div>
              <SectionHeading
                eyebrow="What to expect"
                title="How opening an account works"
                subtitle="A short, fully simulated onboarding journey reviewed in the bank-operations console."
              />
              <ol className="mt-8 space-y-4">
                {steps.map((step, index) => (
                  <li key={step.title} className="flex gap-4">
                    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-mist text-brand-teal-dark">
                      <Icon name={step.icon} className="h-5 w-5" />
                    </span>
                    <div>
                      <h3 className="text-sm font-semibold text-brand-navy">
                        {index + 1}. {step.title}
                      </h3>
                      <p className="mt-0.5 text-sm text-slate-600">{step.description}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <p className="mt-8 rounded-lg border border-brand-gold/40 bg-brand-gold/10 px-4 py-3 text-xs text-brand-ink">
                Meridian is a simulation. This application will never involve real money, real
                identity data, or a real financial institution — and no account exists until an
                operator approves the request.
              </p>
            </div>

            <div>
              <ApplicationForm onSuccess={setConfirmation} />
            </div>
          </div>
        )}
      </Section>
    </div>
  );
}

import { useMemo, useState, type FormEvent } from 'react';
import {
  ADMIN_CREATABLE_ROLES,
  ONBOARDING_PRODUCTS,
  ONBOARDING_PRODUCT_LABELS,
  toMinor,
  validateAdminCreateUser,
  type AdminCreateUserField,
  type AdminCreateUserResponse,
  type OnboardingProduct,
  type UserRole,
} from '@simbank/shared';
import { ApiError } from '../lib/api';
import { createAdminUser } from '../lib/adminApi';
import { useAuth } from '../lib/auth-context';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { RoleBadge } from '../components/RoleBadge';
import { cn } from '../lib/cn';

/** Human label for a creatable role (reuse the role-badge meta indirectly). */
const ROLE_LABELS: Record<(typeof ADMIN_CREATABLE_ROLES)[number], string> = {
  customer: 'Customer',
  joint_customer: 'Joint customer',
  ops_agent: 'Operations agent',
  admin: 'Administrator',
};

/** Parse the dollars input into integer cents, or null when empty/invalid. */
function parseDollarsToMinor(raw: string): number {
  const trimmed = raw.trim();
  if (trimmed === '') return 0;
  const dollars = Number(trimmed);
  if (!Number.isFinite(dollars)) return Number.NaN; // surfaces as a validation error
  return toMinor(dollars);
}

const inputClass = cn(
  'mt-1 w-full rounded-md border border-white/10 bg-brand-navy-deep px-3 py-2 text-sm text-white',
  'placeholder:text-slate-500 focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal',
);

const labelClass = 'block text-sm font-medium text-slate-300';
const errorClass = 'mt-1 text-xs text-rose-300/90';

/**
 * Admin-only "Create demo user" page (v0.6.0). Provisions a SIMULATED user and,
 * optionally, an account with an opening deposit. Funding > 0 requires both a
 * product and an audited reason (the constitution's adjustment rule), enforced
 * client-side via the shared `validateAdminCreateUser` and again on the server.
 *
 * SIMULATION ONLY: no real person, account, or money. The returned demo password
 * is NON-SECRET by design so the admin can share the seeded credential.
 */
export function AdminUsers() {
  const { user } = useAuth();

  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<UserRole>('customer');
  const [product, setProduct] = useState<OnboardingProduct | ''>('');
  const [funding, setFunding] = useState(''); // dollars, as typed
  const [reason, setReason] = useState('');

  const [fieldErrors, setFieldErrors] = useState<Partial<Record<AdminCreateUserField, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<AdminCreateUserResponse | null>(null);

  const fundingMinor = useMemo(() => parseDollarsToMinor(funding), [funding]);
  const reasonRequired = Number.isFinite(fundingMinor) && fundingMinor > 0;

  // Non-admin operators must never see the form (defence in depth — the nav link
  // is already admin-only and the backend enforces the role too).
  if (user?.role !== 'admin') {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold text-white">Create demo user</h1>
        <Card className="border-amber-400/30 bg-amber-400/10">
          <p className="text-sm text-amber-100">
            Not authorized. Provisioning demo users requires an administrator account.
          </p>
        </Card>
      </div>
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setResult(null);

    const draft = {
      email,
      displayName,
      role,
      product: product || null,
      initialFundingMinor: fundingMinor,
      reason: reason || null,
    };
    const validation = validateAdminCreateUser(draft);
    if (!validation.ok || !validation.value) {
      setFieldErrors(validation.errors);
      return;
    }
    setFieldErrors({});

    setSubmitting(true);
    try {
      const created = await createAdminUser({
        email: validation.value.email,
        displayName: validation.value.displayName,
        role: validation.value.role,
        product: validation.value.product,
        initialFundingMinor: validation.value.initialFundingMinor,
        reason: validation.value.reason,
      });
      setResult(created);
      // Reset the form so the admin can provision another user.
      setEmail('');
      setDisplayName('');
      setRole('customer');
      setProduct('');
      setFunding('');
      setReason('');
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(
          err.code === 'email_taken' || err.status === 409
            ? 'A user with that email already exists.'
            : err.message,
        );
      } else {
        setFormError('Could not create the demo user. Is the simulated backend running?');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Create demo user</h1>
        <p className="mt-1 text-sm text-slate-400">
          Provision a <span className="font-semibold text-amber-200">simulated</span> user — and,
          optionally, an account with an opening deposit. Funding a new account is an audited
          adjustment and requires a reason. SIMULATION: no real person, account, or money is
          created; any opening deposit enters via a bank-originated ledger event.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card>
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <label htmlFor="admin-email" className={labelClass}>
                Email
              </label>
              <input
                id="admin-email"
                name="email"
                type="email"
                autoComplete="off"
                placeholder="demo.user@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={fieldErrors.email ? true : undefined}
                aria-describedby={fieldErrors.email ? 'admin-email-error' : undefined}
                className={inputClass}
              />
              {fieldErrors.email && (
                <p id="admin-email-error" className={errorClass}>
                  {fieldErrors.email}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="admin-name" className={labelClass}>
                Display name
              </label>
              <input
                id="admin-name"
                name="displayName"
                type="text"
                autoComplete="off"
                placeholder="Demo User"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                aria-invalid={fieldErrors.displayName ? true : undefined}
                aria-describedby={fieldErrors.displayName ? 'admin-name-error' : undefined}
                className={inputClass}
              />
              {fieldErrors.displayName && (
                <p id="admin-name-error" className={errorClass}>
                  {fieldErrors.displayName}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="admin-role" className={labelClass}>
                Role
              </label>
              <select
                id="admin-role"
                name="role"
                value={role}
                onChange={(e) => setRole(e.target.value as UserRole)}
                aria-invalid={fieldErrors.role ? true : undefined}
                aria-describedby={fieldErrors.role ? 'admin-role-error' : undefined}
                className={inputClass}
              >
                {ADMIN_CREATABLE_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
              {fieldErrors.role && (
                <p id="admin-role-error" className={errorClass}>
                  {fieldErrors.role}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="admin-product" className={labelClass}>
                Open an account <span className="text-slate-500">(optional)</span>
              </label>
              <select
                id="admin-product"
                name="product"
                value={product}
                onChange={(e) => setProduct(e.target.value as OnboardingProduct | '')}
                aria-invalid={fieldErrors.product ? true : undefined}
                aria-describedby={fieldErrors.product ? 'admin-product-error' : undefined}
                className={inputClass}
              >
                <option value="">No account</option>
                {ONBOARDING_PRODUCTS.map((p) => (
                  <option key={p} value={p}>
                    {ONBOARDING_PRODUCT_LABELS[p]}
                  </option>
                ))}
              </select>
              {fieldErrors.product && (
                <p id="admin-product-error" className={errorClass}>
                  {fieldErrors.product}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="admin-funding" className={labelClass}>
                Opening deposit <span className="text-slate-500">(USD, optional)</span>
              </label>
              <div className="relative mt-1">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-slate-500">
                  $
                </span>
                <input
                  id="admin-funding"
                  name="initialFundingMinor"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={funding}
                  onChange={(e) => setFunding(e.target.value)}
                  aria-invalid={fieldErrors.initialFundingMinor ? true : undefined}
                  aria-describedby={
                    fieldErrors.initialFundingMinor ? 'admin-funding-error' : 'admin-funding-hint'
                  }
                  className={cn(inputClass, 'mt-0 pl-7')}
                />
              </div>
              {fieldErrors.initialFundingMinor ? (
                <p id="admin-funding-error" className={errorClass}>
                  {fieldErrors.initialFundingMinor}
                </p>
              ) : (
                <p id="admin-funding-hint" className="mt-1 text-xs text-slate-500">
                  Posted as a simulated opening deposit (max $25,000). Requires a product and a
                  reason.
                </p>
              )}
            </div>

            <div>
              <label htmlFor="admin-reason" className={labelClass}>
                Reason{' '}
                {reasonRequired ? (
                  <span className="text-rose-300/90">(required to fund)</span>
                ) : (
                  <span className="text-slate-500">(optional)</span>
                )}
              </label>
              <textarea
                id="admin-reason"
                name="reason"
                rows={2}
                maxLength={280}
                placeholder="Why this account is being funded (audited adjustment)…"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                aria-invalid={fieldErrors.reason ? true : undefined}
                aria-describedby={fieldErrors.reason ? 'admin-reason-error' : undefined}
                className={inputClass}
              />
              {fieldErrors.reason && (
                <p id="admin-reason-error" className={errorClass}>
                  {fieldErrors.reason}
                </p>
              )}
            </div>

            {formError && (
              <div
                role="alert"
                className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200"
              >
                {formError}
              </div>
            )}

            <Button type="submit" variant="primary" className="w-full" disabled={submitting}>
              {submitting ? 'Creating…' : 'Create demo user'}
            </Button>
          </form>
        </Card>

        <div className="lg:sticky lg:top-6 lg:self-start">
          {result ? (
            <Card className="border-emerald-400/30 bg-emerald-400/10">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-white">Demo user created</h2>
                <RoleBadge role={result.user.role} />
              </div>
              <dl className="mt-3 space-y-1.5 text-xs">
                <div>
                  <dt className="inline text-slate-400">Name: </dt>
                  <dd className="inline text-slate-100">{result.user.displayName}</dd>
                </div>
                <div>
                  <dt className="inline text-slate-400">Email: </dt>
                  <dd className="inline font-mono text-slate-100">{result.user.email}</dd>
                </div>
                <div>
                  <dt className="inline text-slate-400">Status: </dt>
                  <dd className="inline text-slate-100">{result.user.status}</dd>
                </div>
                {result.account && (
                  <div>
                    <dt className="inline text-slate-400">Account: </dt>
                    <dd className="inline text-slate-100">
                      {result.account.name} ({result.account.type})
                    </dd>
                  </div>
                )}
              </dl>

              <div className="mt-3 rounded-md border border-white/10 bg-brand-navy-deep/60 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    Demo password
                  </span>
                  <span className="rounded bg-brand-gold/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-gold-soft">
                    Simulated · non-secret
                  </span>
                </div>
                <p className="mt-1 select-all font-mono text-sm text-white">
                  {result.demoPassword}
                </p>
                <p className="mt-1 text-[11px] text-slate-500">
                  Share so they can sign in to the customer app. Non-secret by design (simulation).
                </p>
              </div>
            </Card>
          ) : (
            <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-xs text-slate-500">
              The created user and their demo password will appear here so you can share the
              credential.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

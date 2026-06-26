import { useState, type FormEvent } from 'react';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Logo } from '../components/Logo';
import { SimulationBanner } from '../components/SimulationBanner';
import { ApiError } from '../lib/api';
import { isOperatorRole, useAuth } from '../lib/auth-context';
import { cn } from '../lib/cn';

/**
 * Demo operator/admin credentials. NON-SECRET by design — this is a local
 * simulation seeded with fake users, and surfacing the logins makes the console
 * easy to explore. Click a card to fill the form.
 */
const DEMO_LOGINS = [
  {
    label: 'Operations agent',
    email: 'sam.operator@example.com',
    password: 'Operator123!',
    note: 'Day-to-day queue + scenario work',
  },
  {
    label: 'Administrator',
    email: 'riley.admin@example.com',
    password: 'Admin123!',
    note: 'Full operations + admin controls',
  },
] as const;

/** Map a backend error code (or local rejection) to operator-facing copy. */
function messageForCode(code: string): string {
  switch (code) {
    case 'invalid_credentials':
      return 'Email or password is incorrect.';
    case 'account_locked':
      return 'This account is temporarily locked after too many failed attempts. Try again later.';
    case 'account_disabled':
      return 'This account is disabled. Contact an administrator.';
    case 'invalid_request':
      return 'Enter a valid email and password.';
    case 'not_operator':
      return 'This console is for bank staff only. Customers use the customer app.';
    default:
      return 'Could not sign in. Check that the simulated backend is running and try again.';
  }
}

/**
 * Operator sign-in screen for the bank-operations simulator. Renders the
 * simulation banner + console chrome itself (it shows BEFORE the authenticated
 * layout). On success it verifies the role: only ops_agent / admin may proceed;
 * a customer login is immediately signed back out and rejected.
 */
export function Login() {
  const { login, logout, sessionEnded } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorCode(null);
    setSubmitting(true);
    try {
      const user = await login(email, password);
      if (!isOperatorRole(user.role)) {
        // Valid credentials, wrong audience. Drop the session and reject.
        await logout();
        setErrorCode('not_operator');
        return;
      }
      // Success: AuthProvider now holds an operator user, so App swaps to the
      // console automatically. Nothing else to do here.
    } catch (err) {
      setErrorCode(err instanceof ApiError ? err.code : 'unknown_error');
    } finally {
      setSubmitting(false);
    }
  }

  function fillDemo(demo: (typeof DEMO_LOGINS)[number]) {
    setEmail(demo.email);
    setPassword(demo.password);
    setErrorCode(null);
  }

  const inputClass = cn(
    'mt-1 w-full rounded-md border border-white/10 bg-brand-navy-deep px-3 py-2 text-sm text-white',
    'placeholder:text-slate-500 focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal',
  );

  return (
    <div className="flex min-h-screen flex-col">
      <SimulationBanner />
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="mb-6 flex flex-col items-center text-center">
            <Logo className="h-9" />
            <span className="mt-3 rounded bg-white/10 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-slate-300">
              Operations Simulator
            </span>
            <h1 className="mt-4 text-xl font-bold text-white">Operator sign-in</h1>
            <p className="mt-1 text-sm text-slate-400">
              Internal bank-staff console. This <strong>simulates</strong> bank operations — no real
              accounts or money.
            </p>
          </div>

          {sessionEnded && !errorCode && (
            <div
              role="status"
              className="mb-4 rounded-md border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-sm text-amber-100"
            >
              Your operator session has ended (it expired or you were signed out). Please sign in
              again to continue — your queues and actions will load once you do.
            </div>
          )}

          <Card>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-slate-300">
                  Work email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="username"
                  autoFocus
                  placeholder="sam.operator@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-slate-300">
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={inputClass}
                />
              </div>

              {errorCode && (
                <div
                  role="alert"
                  className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200"
                >
                  {messageForCode(errorCode)}
                </div>
              )}

              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>
          </Card>

          <Card className="mt-4 bg-white/[0.03]">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Demo logins
              </h2>
              <span className="rounded bg-brand-gold/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-gold-soft">
                Simulated · non-secret
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Seeded demo accounts. Click one to fill the form.
            </p>
            <div className="mt-3 space-y-2">
              {DEMO_LOGINS.map((demo) => (
                <button
                  key={demo.email}
                  type="button"
                  onClick={() => fillDemo(demo)}
                  className={cn(
                    'flex w-full flex-col rounded-md border border-white/10 bg-white/5 px-3 py-2 text-left transition-colors',
                    'hover:border-brand-teal/50 hover:bg-white/10',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2 focus-visible:ring-offset-brand-navy-deep',
                  )}
                >
                  <span className="text-sm font-semibold text-white">{demo.label}</span>
                  <span className="font-mono text-xs text-slate-300">{demo.email}</span>
                  <span className="font-mono text-xs text-slate-400">{demo.password}</span>
                  <span className="mt-0.5 text-[11px] text-slate-500">{demo.note}</span>
                </button>
              ))}
            </div>
          </Card>

          <p className="mt-6 text-center text-xs text-slate-500">
            Not bank staff? The customer app is a separate sign-in.
          </p>
        </div>
      </main>
    </div>
  );
}

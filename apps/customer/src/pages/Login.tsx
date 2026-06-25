import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { cn } from '../lib/cn';
import { useAuth } from '../lib/auth-context';

/**
 * Simulated sign-in. Posts the credentials through the auth context, then on
 * success redirects to the originally-requested protected page (or /dashboard).
 * Maps the backend error `code` to a specific, friendly message and keeps the
 * always-on simulation framing front and centre.
 */

interface DemoLogin {
  label: string;
  email: string;
  password: string;
}

/** Non-secret seeded demo customers (by design — shown in the UI). */
const demoLogins: DemoLogin[] = [
  { label: 'Customer', email: 'avery.customer@example.com', password: 'Customer123!' },
  { label: 'Joint customer', email: 'jordan.joint@example.com', password: 'Joint123!' },
];

/** Friendly message per backend error code from POST /api/auth/login. */
function messageForCode(code: string, fallback: string): string {
  switch (code) {
    case 'invalid_credentials':
      return 'That email and password do not match. Double-check and try again.';
    case 'account_locked':
      return 'This account is temporarily locked after too many failed attempts. Please wait a few minutes and try again.';
    case 'account_disabled':
      return 'This account has been disabled. Contact support (simulated) for help.';
    case 'invalid_request':
      return 'Please enter both your email and password.';
    case 'network_error':
      return 'Cannot reach the banking service. Make sure the backend is running (npm run dev).';
    default:
      return fallback || 'Sign-in failed. Please try again.';
  }
}

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Where to go after a successful sign-in (set by RequireAuth), defaulting to
  // the dashboard. Guard against open-redirects by only honouring local paths.
  const fromState = (location.state as { from?: string } | null)?.from;
  const redirectTo = fromState && fromState.startsWith('/') ? fromState : '/dashboard';

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    const result = await login(email.trim(), password);
    if (result.ok) {
      navigate(redirectTo, { replace: true });
      return;
    }
    setError(messageForCode(result.code, result.message));
    setSubmitting(false);
  }

  function fillDemo(demo: DemoLogin) {
    setEmail(demo.email);
    setPassword(demo.password);
    setError(null);
  }

  return (
    <div className="mx-auto flex max-w-md flex-col px-4 py-16">
      <h1 className="text-2xl font-bold text-brand-navy">Log in to Meridian</h1>
      <p className="mt-1 text-sm text-slate-600">Simulated sign-in. No real credentials, ever.</p>

      <Card className="mt-6">
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="avery.customer@example.com"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-700">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal"
            />
          </div>

          {error && (
            <p
              role="alert"
              className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700"
            >
              {error}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Continue'}
          </Button>
        </form>

        <div className="mt-6 border-t border-slate-100 pt-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Demo logins
            </span>
            <span className="text-[10px] text-slate-400">click to fill</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Seeded, non-secret accounts for exploring the simulation.
          </p>
          <div className="mt-3 space-y-2">
            {demoLogins.map((demo) => (
              <button
                key={demo.email}
                type="button"
                onClick={() => fillDemo(demo)}
                className={cn(
                  'flex w-full items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left',
                  'transition-colors hover:border-brand-teal/60 hover:bg-brand-mist',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-1',
                )}
              >
                <span>
                  <span className="block text-sm font-medium text-brand-navy">{demo.label}</span>
                  <span className="block text-xs text-slate-500">{demo.email}</span>
                </span>
                <span className="rounded bg-brand-mist px-2 py-0.5 font-mono text-[11px] text-slate-600">
                  {demo.password}
                </span>
              </button>
            ))}
          </div>
          <p className="mt-3 rounded-lg bg-brand-gold/15 px-3 py-2 text-[11px] text-brand-ink">
            Bank staff (operations &amp; admin) sign in to the separate Operations console, not here.
          </p>
        </div>
      </Card>
    </div>
  );
}

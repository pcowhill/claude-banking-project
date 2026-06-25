import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';

/**
 * Placeholder login screen. Real authentication (password hashing, sessions,
 * MFA, lockout) lands in v0.2.0 — this shell only collects input and explains
 * that it is not yet wired up.
 */
export function Login() {
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
  }

  return (
    <div className="mx-auto flex max-w-md flex-col px-4 py-16">
      <h1 className="text-2xl font-bold text-brand-navy">Log in to Meridian</h1>
      <p className="mt-1 text-sm text-slate-600">Simulated sign-in. No real credentials, ever.</p>

      <Card className="mt-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="username"
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
              placeholder="••••••••"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal"
            />
          </div>
          <Button type="submit" className="w-full">
            Continue
          </Button>
        </form>

        {submitted && (
          <p className="mt-4 rounded-lg bg-brand-gold/15 px-3 py-2 text-xs text-brand-ink">
            Authentication is not implemented yet. It arrives in milestone <strong>v0.2.0</strong>{' '}
            (password hashing, sessions, MFA, and seeded demo users).
          </p>
        )}
      </Card>

      <div className="mt-4 text-center text-sm text-slate-500">
        Just exploring?{' '}
        <Link to="/dashboard" className="font-semibold text-brand-teal-dark hover:underline">
          Preview the dashboard shell
        </Link>
      </div>
    </div>
  );
}

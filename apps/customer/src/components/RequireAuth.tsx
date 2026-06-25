import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth-context';

/**
 * Gate for authenticated routes. While the session is still hydrating it shows a
 * small loading state (so the login page never flashes for an already-signed-in
 * user). Once resolved, unauthenticated visitors are redirected to /login, with
 * the attempted path stashed in router state so login can send them back.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
        <span
          className="h-6 w-6 animate-spin rounded-full border-2 border-brand-mist border-t-brand-teal"
          aria-hidden="true"
        />
        <p className="mt-4 text-sm text-slate-500">Checking your session…</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}

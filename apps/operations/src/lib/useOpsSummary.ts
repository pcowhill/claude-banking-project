import { useEffect, useState } from 'react';
import { ApiError, fetchOpsSummary, type OpsSummary } from './api';

export interface OpsSummaryState {
  loading: boolean;
  summary: OpsSummary | null;
  /** Human-readable error when the fetch failed (e.g. API offline, forbidden). */
  error: string | null;
}

/**
 * Fetch the operations overview counts (`GET /api/ops/summary`) once on mount.
 * Used by the dashboard; the call carries the session cookie via the api client.
 */
export function useOpsSummary(): OpsSummaryState {
  const [state, setState] = useState<OpsSummaryState>({
    loading: true,
    summary: null,
    error: null,
  });

  useEffect(() => {
    let active = true;
    fetchOpsSummary()
      .then((summary) => {
        if (active) setState({ loading: false, summary, error: null });
      })
      .catch((err: unknown) => {
        if (!active) return;
        const error =
          err instanceof ApiError
            ? err.message
            : 'Could not load summary — is the simulated backend running?';
        setState({ loading: false, summary: null, error });
      });
    return () => {
      active = false;
    };
  }, []);

  return state;
}

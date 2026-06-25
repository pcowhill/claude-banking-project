import { useEffect, useState } from 'react';
import type { StatusResponse } from '@simbank/shared';
import { fetchStatus } from './api';

export interface ApiStatusState {
  loading: boolean;
  status: StatusResponse | null;
}

/** React hook that polls the backend /status endpoint once on mount. */
export function useApiStatus(): ApiStatusState {
  const [state, setState] = useState<ApiStatusState>({ loading: true, status: null });

  useEffect(() => {
    let active = true;
    void fetchStatus().then((status) => {
      if (active) setState({ loading: false, status });
    });
    return () => {
      active = false;
    };
  }, []);

  return state;
}

import { parseBooleanFlag } from '@simbank/shared';
import { useApiStatus } from './useApiStatus';

/**
 * Is this a SHARED, DISPOSABLE public demo? Two signals, either is enough:
 *  - the build-time flag `VITE_PUBLIC_DEMO=true` (so the warning is present
 *    from the first paint, even while the backend is still being reached), and
 *  - the backend's `/status` → `publicDemo` (the authoritative runtime flag, so
 *    a deployment that only sets the backend env var still shows the notice).
 * Neither is set in ordinary local development, so nothing changes there.
 */
export const PUBLIC_DEMO_BUILD: boolean = parseBooleanFlag(import.meta.env.VITE_PUBLIC_DEMO);

/** React hook: true when the shared-public-demo warning should be shown. */
export function usePublicDemo(): boolean {
  const { status } = useApiStatus();
  return PUBLIC_DEMO_BUILD || status?.publicDemo === true;
}

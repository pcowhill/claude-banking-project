import { parseBooleanFlag } from '@simbank/shared';
import { useApiStatus } from './useApiStatus';

/**
 * Is this console part of a SHARED, DISPOSABLE public demo? Either signal is
 * enough: the build-time flag `VITE_PUBLIC_DEMO=true` (present from the first
 * paint) or the backend's `/status` → `publicDemo` (the authoritative runtime
 * flag). Neither is set in ordinary local development.
 */
export const PUBLIC_DEMO_BUILD: boolean = parseBooleanFlag(import.meta.env.VITE_PUBLIC_DEMO);

/** React hook: true when the shared-public-demo warning should be shown. */
export function usePublicDemo(): boolean {
  const { status } = useApiStatus();
  return PUBLIC_DEMO_BUILD || status?.publicDemo === true;
}

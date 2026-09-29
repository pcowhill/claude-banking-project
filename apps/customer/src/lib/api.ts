import { LOCAL_URLS, resolveApiBaseUrl, type StatusResponse } from '@simbank/shared';

/**
 * Where this app talks to the backend.
 *
 *  - Local development: `http://localhost:3000` (unchanged default).
 *  - Production build (the eventual public demo): the page's OWN origin — the
 *    reverse proxy serves this built app and forwards `/api/*`, `/health`,
 *    `/status` and `/socket.io/*` to the private backend on the same hostname,
 *    so there is no separate API host (`https://banking.cowhill.dev/api/...`).
 *  - `VITE_API_URL` (and `VITE_WS_URL` for Socket.IO) explicitly override either.
 *
 * The rule itself lives in `@simbank/shared` (`resolveApiBaseUrl`) so both apps
 * and the tests share one definition.
 */
const API_URL = resolveApiBaseUrl({
  explicit: import.meta.env.VITE_API_URL,
  mode: import.meta.env.MODE,
  origin: typeof window !== 'undefined' ? window.location.origin : undefined,
  fallback: LOCAL_URLS.backend,
});

/** Socket.IO base (falls back to the API base, i.e. same origin in production). */
const WS_URL = resolveApiBaseUrl({
  explicit: import.meta.env.VITE_WS_URL,
  mode: import.meta.env.MODE,
  origin: undefined,
  fallback: API_URL,
});

/** Share one in-flight/recent `/status` fetch across the components that read it. */
let statusCache: { at: number; promise: Promise<StatusResponse | null> } | null = null;
const STATUS_CACHE_MS = 15_000;

/**
 * Fetch backend status. Returns null (rather than throwing) when the API is
 * unreachable so the UI can degrade gracefully — the shell must render even
 * with the backend stopped. Cached briefly so the banner, the status pill, and
 * the sign-in pages do not each issue their own request on mount.
 */
export async function fetchStatus(): Promise<StatusResponse | null> {
  const now = Date.now();
  if (statusCache && now - statusCache.at < STATUS_CACHE_MS) return statusCache.promise;
  const promise = (async () => {
    try {
      const res = await fetch(`${API_URL}/status`);
      if (!res.ok) return null;
      return (await res.json()) as StatusResponse;
    } catch {
      return null;
    }
  })();
  statusCache = { at: now, promise };
  return promise;
}

export { API_URL, WS_URL };

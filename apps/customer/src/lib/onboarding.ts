import type { OpenAccountRequest, OpenAccountResponse } from '@simbank/shared';
import { API_URL } from './api';
import { csrfHeaders } from './csrf';

/**
 * Onboarding API client for the customer app (v0.6.0, task N-09).
 *
 * Submitting an open-account application is a PUBLIC action — no session cookie
 * is required (an unauthenticated visitor is applying). Like the auth client,
 * helpers return typed, discriminated results and NEVER throw on network
 * failure, so the form can show field-level errors, a friendly server message,
 * or an offline notice without a try/catch at the call site.
 *
 * SIMULATION NOTE: an application is a fake, queued work item. It never creates a
 * user, account, or money on its own — an operator must approve it first.
 */

/**
 * Result of submitting an open-account application.
 *  - `ok: true`  → the application was queued; `data` carries the reference.
 *  - `ok: false` → `fields` maps field→message for per-field errors (from the
 *    server's 400 body), and `message` is a single human-readable summary.
 */
export type SubmitApplicationResult =
  | { ok: true; data: OpenAccountResponse }
  | { ok: false; fields?: Record<string, string>; message: string };

/** Shape of the backend's 400 validation body for onboarding. */
interface OnboardingErrorBody {
  error?: string;
  code?: string;
  fields?: Record<string, string>;
}

/** Safely parse a JSON body, tolerating empty/non-JSON responses. */
async function readJson<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/**
 * POST /api/onboarding/applications (public). The body is already validated +
 * normalized client-side via `validateOpenAccount`, but the server validates
 * again and may return a 400 with `fields` (e.g. a duplicate email) the client
 * couldn't know about. Network failures surface as a generic offline message.
 *
 * This endpoint is PUBLIC and CSRF-exempt (a logged-out visitor is applying, so
 * there is no session cookie to protect). We still spread `csrfHeaders()` for
 * uniformity with the authenticated clients — it is simply empty here.
 */
export async function submitApplication(
  input: OpenAccountRequest,
): Promise<SubmitApplicationResult> {
  try {
    const res = await fetch(`${API_URL}/api/onboarding/applications`, {
      method: 'POST',
      headers: { ...csrfHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });

    if (res.ok) {
      const body = await readJson<OpenAccountResponse>(res);
      if (body?.reference) return { ok: true, data: body };
      return { ok: false, message: 'Unexpected response from the server. Please try again.' };
    }

    const err = await readJson<OnboardingErrorBody>(res);
    return {
      ok: false,
      fields: err?.fields,
      message: err?.error ?? 'We could not submit your application. Please try again.',
    };
  } catch {
    return {
      ok: false,
      message: 'Cannot reach the banking service. Is the backend running (npm run dev)?',
    };
  }
}

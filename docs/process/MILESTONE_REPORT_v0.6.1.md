# MILESTONE REPORT — v0.6.1 (Operations console fixes)

A focused **patch release** that fixes the two Meridian Operations bugs from the
v0.6.0 human review. No new product scope; **v0.7.0 was not started.** Local
SIMULATION throughout — no real money/providers, ledger discipline untouched.

## Scope (re-scoped by human feedback)

The v0.6.0 review (`feedback/FEEDBACK_v0.6_2026-06-26_1710.md`) explicitly
**re-scoped this session away from v0.7.0** to a patch release that addresses only
the reported bugs. Both reported issues were confirmed as **real bugs** and fixed.

| Item | Summary | Result |
| --- | --- | --- |
| **B-03** | On a narrow window the left nav disappears with no alternative, so sections are unreachable | **Fixed** — responsive top-bar menu (☰) on narrow widths; desktop sidebar unchanged |
| **B-04** | Request queues show "Not authenticated"; the submitted application can't be approved | **Fixed** — console now reconciles a rejected/expired session and routes the operator back to sign-in (with a clear notice) instead of stranding them; recovery verified end-to-end |
| **B-05** | Regression coverage for both fixes | **Done** — 2 new Playwright e2e tests; `npm run verify` green |
| **DOC-061** | v0.6.1-named handoff docs + tag | **Done** — this report + human review + next-session prompt + state/next/board/changelog/experiment-log/quality-report; version 0.6.1; annotated tag `v0.6.1` |

## What changed (code)

All changes are confined to the **operations app** + the shared version string —
no backend, schema, ledger, or contract changes.

- **B-03 — `apps/operations/src/components/OpsLayout.tsx`:** extracted the nav links
  into a shared `NavList`, added a `lg:hidden` menu toggle (☰/✕) in the header that
  opens the same links in a panel, auto-closes on navigation and on route change,
  and is accessible (`aria-label`/`aria-expanded`/`aria-controls`). The desktop
  `lg:block` sidebar now also renders `NavList`, so the two surfaces can't drift.
- **B-04 — session reconciliation:**
  - `apps/operations/src/lib/api.ts`: a `setSessionInvalidHandler` hook; `toApiError`
    invokes it on **401 with `unauthenticated` / `session_expired`** only (so a
    failed login's `invalid_credentials` does **not** trigger it).
  - `apps/operations/src/lib/AuthContext.tsx` + `auth-context.ts`: registers the
    handler to clear the user and set a `sessionEnded` flag; cleared on a successful
    login/logout. With the user cleared, the existing gate renders the sign-in screen
    (and tears down the data provider + socket).
  - `apps/operations/src/pages/Login.tsx`: shows an amber "your session has ended"
    notice when `sessionEnded` is set.
- **Version:** `packages/shared/src/version.ts` → `0.6.1` / `v0.6.1` /
  "Operations console fixes"; all five `package.json` versions → `0.6.1`.
- **README.md:** current-milestone line updated to v0.6.1.

## How the diagnosis was done (B-04)

Because the v0.6.0 e2e suite (which loads the queue as an operator) had passed
30/30, the bug had to be environment/state-sensitive. I reproduced it from the
ground up:

1. **Backend over HTTP (curl cookie jar, ops origin):** login → `mer_ops_session`
   set; `/api/auth/me` **200**; `/api/ops/requests` **200** with the full queue.
   → backend auth path is correct.
2. **Full onboarding loop over HTTP:** submit application → operator approve →
   provisioned user/account → new customer signs in to the funded account.
   → approval path is correct.
3. **Real Chromium, clean profile:** login → queue renders all cards, every
   `/api/ops/*` call sends the cookie and returns 200. → no bug in a clean session.
4. **Real Chromium, invalid session mid-use** (cookie cleared / session deleted
   server-side): the console kept showing the authenticated shell while data calls
   returned 401 — **reproducing the user's "Not authenticated"** dead-end. This is
   the defect the fix targets; after the fix the same scenario routes back to
   sign-in and recovers on re-login (verified deterministically via route
   interception forcing `/api/ops/**` → 401).

## Verification

- **`npm run verify` ✅** — lint (0/0) + typecheck (×4) + **189** Vitest tests
  (unchanged; no regression) + build (backend tsup + customer/operations vite).
- **`npm run test:e2e` ✅ — 32 passed** (was 30; **+2**):
  - "an expired/rejected ops session returns the operator to sign-in (no dead
    'Not authenticated')" — forces `/api/ops/**` → 401, asserts the bounce +
    "session has ended" notice + **no** dead error, then re-logs-in and loads the
    queue.
  - "the menu toggle reveals navigation and can switch sections" — at a 600px
    viewport, asserts the sidebar links are hidden, the ☰ toggle works, navigates to
    Request queues, and the menu auto-closes.
- **Manual (real browser):** both fixes confirmed, plus the clean-session
  regression (queue still loads with all cards on a normal login).

## Money / safety

No money-path code changed. Money still moves only via bank-originated, audited
ledger entries; balances stay derived; the simulation disclaimer remains visible in
both apps and the README. No secrets added; `.env` still ignored.

## Git / tag

- Branch (Claude Code Cloud session branch, used as the patch branch):
  `claude/dreamy-maxwell-njcxe7`. Intended name: `milestone/v0.6.1-ops-fixes`.
- Annotated tag **`v0.6.1`** created locally on the patch commit. As in prior
  sessions, **pushing tags is blocked by this environment's git policy (HTTP 403)**,
  so the human (re)creates/pushes the tag on merge to `main`:
  ```bash
  git tag -a v0.6.1 -m "v0.6.1 — Operations console fixes (B-03 nav, B-04 session)"
  git push origin v0.6.1
  ```
- **No pull request opened** (per the constitution — only on explicit request).

## Sandbox note (Claude Code Cloud only)

Same Prisma engine-download block as Sessions 1–6 (ECONNRESET to
`binaries.prisma.sh` from Prisma's fetcher; curl reaches it). Resolved the
documented way — `npm install --ignore-scripts`, curl-mirror the query-engine
library + schema-engine for `debian-openssl-3.0.x`, point Prisma at them via
`PRISMA_QUERY_ENGINE_LIBRARY` + `PRISMA_SCHEMA_ENGINE_BINARY`
(+ `PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING`). Prisma 5.22.0, engine
`605197351a3c8bdd595af2d2a9bc3025bca48ea2`. Playwright used the pre-installed
Chromium via `PLAYWRIGHT_CHROMIUM_PATH`. None of this affects normal machines or CI.

## Stop point

Stopped at the patch gate per the human's instruction. **Did not start v0.7.0.**
Awaiting the human's review of v0.6.1 before Money movement proceeds.

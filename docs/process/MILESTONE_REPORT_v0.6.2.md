# MILESTONE REPORT — v0.6.2 (Operations sign-in fix)

A focused **patch release** that fixes the single blocking Meridian Operations
sign-in bug reported in the v0.6.1 review. No new product scope; **v0.7.0 was not
started.** Local SIMULATION throughout — no real money/providers, ledger discipline
untouched.

## Scope (re-scoped by human feedback)

The v0.6.1 review (`feedback/FEEDBACK_v0.6.1_2026-06-26_1852.md`) explicitly
**re-scoped this session away from v0.7.0** to a patch release that fixes only one
new, blocking regression: operators could no longer sign in to the Meridian
Operations console at all (the dashboard flashed, then bounced back to the sign-in
screen with the v0.6.1 "session has ended" notice, looping forever and surviving a
cookie clear; both seeded staff users affected). The bug was confirmed **real**,
root-caused, fixed, and proven.

| Item | Summary | Result |
| --- | --- | --- |
| **B-06** | Operator sign-in loop: the console shows the dashboard for a split second, then bounces back to sign-in with the v0.6.1 notice; loops forever; survives clearing cookies; both Sam and the Administrator affected | **Fixed** — each front-end app now declares its surface with an explicit header (`x-meridian-surface`) the backend trusts ahead of `Origin`, so the operator's authenticated GETs resolve to the ops session even when the browser omits `Origin` (same-origin deployments) |
| **DOC-062** | v0.6.2-named handoff docs + tag | **Done** — this report + human review + next-session prompt + state/next/board/changelog/experiment-log/quality-report; version 0.6.2; annotated tag `v0.6.2` |

## Branch-history fix (important context)

When this fresh session branch (`claude/gracious-fermi-5cfomj`) was provisioned, it
was cut from `main` (**v0.6.0**) and did **not** contain the v0.6.1 work: that work
turned out to be a **single commit (`52347db`) on an UNMERGED branch**
(`origin/claude/dreamy-maxwell-njcxe7`) that was never merged to `main`. So the
v0.6.1 fixes (the narrow-width ☰ menu and the session-recovery handler) were absent
from the starting point. We **fast-forwarded** this branch to include the v0.6.1
commit, so the branch now contains **v0.6.0 + v0.6.1 + v0.6.2** and v0.6.2 builds on
v0.6.1 (the bug being fixed here is literally the v0.6.1 recovery handler escalating
a pre-existing 401 into a loop — so it had to sit on top of v0.6.1).

## Root cause (B-06) — confirmed by reproduction

The backend picks the per-surface session cookie — `mer_session` (customer portal)
vs `mer_ops_session` (operations console) — **from the request `Origin` header**,
defaulting to the **customer** surface whenever `Origin` is absent or unrecognized
(`apps/backend/src/auth/cookies.ts` → `sessionAudienceForOrigin`).

But **browsers omit the `Origin` header on same-origin GET requests** — they send it
on the login `POST`, but **not** on subsequent safe-method GETs. In a deployment
where the console and the API share one origin, the operator's authenticated GETs to
`/api/ops/*` therefore arrived with **no `Origin`**, were treated as the *customer*
surface, read the empty `mer_session` cookie, and returned **401**. v0.6.0 surfaced
that exact 401 as the "Not authenticated" dead-end (the original B-04 report); the
v0.6.1 recovery handler then escalated the same 401 into an **unrecoverable login
loop** (login POST sets the ops cookie and returns 200 → the app mounts the
dashboard → the first authenticated GET arrives with no `Origin` → 401 → the v0.6.1
handler signs the operator out and shows the "session has ended" notice → repeat).

The standard cross-origin dev setup (`:5174` → `:3000`) **always** sends `Origin`,
which is exactly why local runs, the v0.6.1 curl checks (which set an ops `Origin`
header), and the cross-origin Playwright suite all passed while the human's
same-origin environment failed — that was the blind spot.

## What changed (code)

Scoped to surface-resolution: each app states which app it is; the backend trusts
that ahead of `Origin` (which remains a fallback). **No money-path, schema,
migration, ledger, or money-contract change.**

- **`packages/shared/src/auth.ts`:** added `AUTH.surfaceHeader = 'x-meridian-surface'`
  and an `isSessionAudience` type guard, so both the client and the backend share one
  definition of the surface header and the valid surface values.
- **`apps/backend/src/auth/cookies.ts`:** new `sessionAudienceFromHeader()`;
  `sessionAudienceForRequest()` now returns **header ?? Origin-fallback** (so the
  Socket.IO handshake, cross-origin dev, and the existing Origin-based tests are
  unchanged — Origin is still honoured when no header is present).
- **`apps/backend/src/realtime.ts`:** the Socket.IO ops-room handshake also **prefers
  the surface header** (falling back to `Origin`), so operators join the ops room in a
  same-origin deployment too.
- **`apps/operations/src/lib/api.ts`:** sends `x-meridian-surface: operations` on
  **every** authenticated call (`apiRequest`, `login`, `logout`, `fetchMe`,
  `fetchOpsSummary`). **`apps/operations/src/lib/useOpsSocket.ts`:** passes it as
  socket `extraHeaders` on the (polling) handshake.
- **The customer app was deliberately NOT changed:** its requests already resolve to
  the `customer` cookie via the backend's least-privileged default, so it isn't
  affected; adding a custom header to its GETs would reintroduce CORS preflights its
  design note deliberately avoids. Session isolation (the v0.3.0 fix) stays covered by
  the existing Origin-based tests and remains green.
- **Version:** `packages/shared/src/version.ts` → `0.6.2` / `v0.6.2` /
  "Operations sign-in fix"; all five `package.json` versions → `0.6.2`.

**Security note:** the surface header only selects **which cookie is read**; it
cannot grant access — the RBAC role checks (`requireRole`) are unchanged, so a client
self-declaring `operations` with no valid ops cookie still gets 401/403. Trusting the
client's self-declared surface is therefore safe.

## How the diagnosis was done (B-06)

Because the v0.6.1 cross-origin e2e and curl checks had all passed, the bug had to be
specific to the **same-origin** request shape (no `Origin` on GETs). I reproduced it
empirically and locked it down with a test that fails on the pre-fix backend:

1. **Backend `app.inject` with an explicit ops `Origin`:** login → `mer_ops_session`
   set; `/api/auth/me` and `/api/ops/*` GETs **200**. → the Origin path is correct.
2. **Backend `app.inject` with NO `Origin` on the GET (the same-origin browser
   shape):** the authenticated GET resolved to the **customer** cookie and returned
   **401** — **reproducing the loop's trigger.** Adding `x-meridian-surface:
   operations` to that same request returns **200** — the fix.
3. **Real Chromium, route-rewriting the same-origin browser behavior:** strip the
   `Origin` header on GET/HEAD only (keeping it on the login POST, exactly how a
   same-origin browser behaves) and forward to the real backend; the operator reaches
   the dashboard, the live queue loads, and a reload restores the session instead of
   bouncing.

## Verification

- **`npm run verify` ✅** — lint (0 errors / 0 warnings) + typecheck (×4 workspaces) +
  **201** Vitest unit/integration tests (was 189; **+12**) + build (backend tsup +
  customer/operations vite).
- **`npm run test:e2e` ✅ — 33 passed** in **real Chromium** (was 32; **+1**):
  - `e2e/operations.spec.ts` — "stays signed in when the browser omits Origin on API
    GETs (same-origin deployment)": routes `**/api/**`, **strips `Origin` on GET/HEAD
    only** (keeping it on the login POST), forwards to the real backend; asserts the
    operator reaches the dashboard, the live queue loads, and a reload restores the
    session (not bounced). A self-validating `sawOriginlessOpsGet` guard ensures the
    test actually exercised an Origin-less ops GET, so it can't pass trivially.
  - The v0.3.0 **session-isolation** bleed test stays green (isolation NOT regressed),
    and the v0.6.1 **B-03** narrow-nav + **B-04** session-recovery e2e stay green (no
    regression).
- **New tests added this patch (+12 unit/integration, +1 e2e):**
  - `apps/backend/src/routes/ops-session-origin.test.ts` — **5** integration tests
    (`app.inject`): ops login sets the ops cookie; an **Origin-less GET carrying the
    surface header → 200** (the fix); `GET /api/auth/me` with the header and no Origin
    → 200; an explicit ops `Origin` with **no** header still works (fallback
    unchanged); **no Origin AND no header → 401** (documents the latent customer
    default the bug rode on). The two header tests **failed against the pre-fix
    backend** and pass after — the empirical reproduction.
  - `apps/backend/src/auth/cookies.test.ts` — **7** unit tests for
    `sessionAudienceFromHeader`, `sessionAudienceForOrigin`, and the
    **header-over-Origin precedence** in `sessionAudienceForRequest`.
- **CORS note:** the real-browser WebServer logs showed `OPTIONS` preflights returning
  **204** for the new `x-meridian-surface` header on `/api/ops/*` GETs —
  `@fastify/cors` reflects requested headers by default, so **no CORS config change
  was needed**; the cross-origin path is unaffected.

## Money / safety

No money-path code changed. Money still moves only via bank-originated, audited
ledger entries; balances stay **derived**; the simulation disclaimer remains visible
in both apps and the README. No secrets added; `.env` still ignored.

## Git / tag

- Branch (Claude Code Cloud session branch, used as the patch branch):
  `claude/gracious-fermi-5cfomj`. Intended name: `milestone/v0.6.2-ops-signin`. The
  branch was fast-forwarded to include the unmerged v0.6.1 commit `52347db`, so it now
  carries v0.6.0 + v0.6.1 + v0.6.2.
- Annotated tag **`v0.6.2`** to be created locally on the patch commit. As in prior
  sessions, **pushing tags is blocked by this environment's git policy (HTTP 403)**,
  so the human (re)creates/pushes the tag on merge to `main`:
  ```bash
  git tag -a v0.6.2 -m "v0.6.2 — Operations sign-in fix (B-06: surface-header session resolution)"
  git push origin v0.6.2
  ```
- **No pull request opened** (per the constitution — only on explicit request).

## Sandbox note (Claude Code Cloud only)

Same Prisma engine-download block as Sessions 1–7 (ECONNRESET to
`binaries.prisma.sh` from Prisma's fetcher; curl reaches it). Resolved the
documented way — `npm install --ignore-scripts`, curl-mirror the query-engine
library + schema-engine for `debian-openssl-3.0.x`, point Prisma at them via
`PRISMA_QUERY_ENGINE_LIBRARY` + `PRISMA_SCHEMA_ENGINE_BINARY`
(+ `PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING`). Prisma 5.22.0, engine
`605197351a3c8bdd595af2d2a9bc3025bca48ea2`. Playwright used the pre-installed
Chromium via `PLAYWRIGHT_CHROMIUM_PATH`
(`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`). None of this affects normal
machines or CI.

## Stop point

Stopped at the patch gate per the human's instruction. **Did not start v0.7.0.**
Awaiting the human's review of v0.6.2 before Money movement proceeds.

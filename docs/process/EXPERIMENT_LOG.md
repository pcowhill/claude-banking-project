# EXPERIMENT_LOG

A chronological, append-only log of the AI-development experiment: what each
session set out to do, key decisions, surprises, and outcomes. Newest entries at
the top within each milestone. **Append; do not rewrite history.**

---

## Session 3 — v0.3.0 Public bank website and branding — 2026-06-25

**Goal:** Complete only `v0.3.0 — Public bank website and branding` (polished home
page, product marketing pages, image placeholders + prompts, login/open-account
entry points, responsive + accessible polish), **and** address the v0.2.0 review
feedback: a cross-app session-bleed bug. Human approved starting v0.3.0.

**Execution mode:**
- The **bug fix (W-00)** touches auth + routing — a **risky shared area** — so it
  was done **first and serially**, locked behind the full test suite, then
  re-verified at the browser level before any website work.
- The **public-site work** is single-app (`apps/customer`) and was built on a
  shared marketing-component contract for brand consistency.

**The reported bug had TWO root causes (both fixed):**
1. **Shared host-only cookie.** Both apps hit the same backend origin; the session
   cookie had no `Domain`, so it was a host-only `localhost` cookie shared across
   ports — one session for both apps. Fixed with **per-surface cookies**
   (`mer_session` / `mer_ops_session`) selected by request `Origin` (also matched
   by the ops port for LAN hosts).
2. **Logout returned 400 and never revoked.** The customer logout sent a `POST`
   with `Content-Type: application/json` and **no body**; Fastify rejects an empty
   JSON body with 400, so the handler never ran — session not revoked, cookie not
   cleared. The client cleared its own state best-effort, which **masked** it (no
   v0.2.0 test navigated to a protected route after logout). Fixed by not declaring
   a JSON content-type on bodyless requests, plus a backend empty-JSON-body
   tolerance. Found by writing a browser-level e2e that reproduced the exact
   two-tab scenario — a good argument for testing the *server-side* effect of
   logout, not just the client UI state.

**Key decisions:**
- **Per-surface cookies keyed by Origin** instead of a schema/audience column — the
  smallest correct fix, no migration, minimal blast radius.
- **Reusable `components/marketing.tsx` kit** + `lib/nav.ts` (nav split out so the
  presentational module stays component-only and react-refresh-clean).
- **Coming-soon pages** for Cards and Loans/CDs now (clearly tagged) so the nav and
  product story are complete ahead of v0.8.0/v0.9.0.
- **Accessibility baked in**: skip link, landmarks, labelled mobile-menu toggle,
  alt text on every image slot; disclaimer visible site-wide.

**Surprises / environment friction (sandbox only — not a product issue):**
- Same Prisma engine-download block as Sessions 1–2 (ECONNRESET to
  `binaries.prisma.sh` from Prisma's own fetcher, though curl reaches it). Resolved
  by `npm install --ignore-scripts` then **curl-mirroring** the query-engine
  library + schema-engine for `debian-openssl-3.0.x` (note: the remote gz names are
  `libquery_engine.so.node.gz` / `schema-engine.gz`) and pointing Prisma at them via
  `PRISMA_QUERY_ENGINE_LIBRARY` + `PRISMA_SCHEMA_ENGINE_BINARY` (+
  `PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING`). Prisma is now **5.22.0** (engine
  `605197351a3c8bdd595af2d2a9bc3025bca48ea2`).
- Same Playwright/Chromium build mismatch — used the pre-installed Chromium
  (`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`) via the existing
  `PLAYWRIGHT_CHROMIUM_PATH` hook (executablePath bypasses the build-version check).
- The first cut of the browser-level isolation e2e raced (clicked Log out then
  navigated immediately, aborting the in-flight logout). Fixed by waiting for the
  logged-out header before navigating — but that wait is *also* what surfaced the
  real logout-400 bug above.

**Outcome:** `npm run verify` passes; **70** unit/integration + **14** Playwright
e2e green (up from 65 + 8). No schema change. Milestone complete; annotated tag
`v0.3.0` created locally (tag push blocked by env policy — HTTP 403 — so the human
pushes it on merge; see the milestone report). Session branch pushed. Stopped at
the gate; did **not** begin v0.4.0.

**Carried forward / open items:** marketing images are placeholders until real
files are dropped in; `/open-account` is a placeholder pending v0.6.0 onboarding;
security follow-ups (CSRF, config-driven cookie `secure`, helmet + rate-limit) and
dev-tooling audit advisories still tracked in `QUALITY_REPORT.md`.

---

## Session 2 — v0.2.0 Auth, roles, and demo users — 2026-06-25

**Goal:** Complete only `v0.2.0 — Auth, roles, and demo users`: real password
hashing, cookie sessions + lockout, seeded demo users per role, role-based
access control (ownership), login history/audit, and initial Playwright login
tests. Human feedback was an explicit approval to start v0.2.0 with no re-scope.

**Execution mode:** Controlled multi-agent, as the project rules intend.
- The **backend auth core is a risky shared area** (schema, auth, routing), so it
  was implemented **serially** by the orchestrator: shared auth contracts →
  Prisma schema + migration → password/token/lockout/session/access/guard
  modules → routes → seed → backend tests. Locked and verified green first.
- The **two frontend apps are independent**, so once the API contract was locked
  they were built **in parallel** by the Frontend Customer and Frontend
  Operations subagents against a precise written contract, then reviewed.
- A read-only **Security/Permissions** subagent audited the result before the
  gate; the **Testing/QA** work (Playwright login journeys) and **Process Scribe**
  handoff docs closed it out.

**Key decisions:**
- **bcryptjs** (pure-JS) for hashing rather than native bcrypt/argon2 — a real,
  standard library that needs no native toolchain, matching the project's
  cross-platform, zero-friction ethos. Argon2 noted as a future hardening option.
- **Opaque cookie sessions**: a random token in an httpOnly `SameSite=Lax`
  cookie; the DB stores only its **SHA-256 hash**, with a sliding idle timeout.
  Standard-library crypto only — no custom cryptography.
- **`AccountAccess` table as the RBAC backbone**: every owner gets an `owner`
  grant and joint users get scoped grants, so "who can see what" has one source
  of truth and the ownership tests rest on real data (Jordan ⊂ Avery's checking
  only).
- **Two trails**: `LoginEvent` (every attempt → login history + lockout source)
  and `AuditLog` (notable events: login, logout, lockout), mirroring how admin
  actions are audited elsewhere.
- **Login defenses**: lockout after 5 failures (15-min window, fresh after
  expiry) and a decoy-hash comparison so unknown-email and wrong-password
  responses are indistinguishable (no user enumeration).
- **Isolated test DB**: backend integration tests run in a single fork against a
  dedicated `prisma db push` SQLite file, so they never touch the dev DB and
  never race on the shared file.

**Surprises / environment friction (sandbox only — not a product issue):**
- Same Prisma engine-download block as Session 1 (ECONNRESET to
  `binaries.prisma.sh`). Resolved the same way — curl-mirror the engine binaries
  and point Prisma at them via the `PRISMA_*` env vars. Normal machines / CI
  download engines normally.
- Same Playwright/Chromium build mismatch (pre-installed 1194 vs Playwright
  1.61's expected build). Used the existing opt-in `PLAYWRIGHT_CHROMIUM_PATH`
  hook pointing at the pre-installed Chromium.
- Vitest `fileParallelism: false` alone did **not** serialize the two DB-touching
  integration files in the workspace; they raced on the shared SQLite file
  (unique-constraint error). Fixed by also forcing the backend project into a
  single fork (`poolOptions.forks.singleFork`).
- Two initial Playwright selectors were too loose (strict-mode "resolved to 2
  elements" — a duplicate "Log in" CTA on the home page and the operator name in
  both header and intro). Scoped them to the header `banner` role.

**Outcome:** `npm run verify` passes; **65** unit/integration + **8** Playwright
e2e tests green (up from 20 + 3). Milestone complete; annotated tag `v0.2.0`
created locally (tag push blocked by the environment's git policy — HTTP 403 —
so the human pushes it on merge; see the milestone report). Session branch
pushed. Stopped at the gate; did **not** begin v0.3.0.

**Carried forward / open items:** MFA / password-reset / device-trust deferred
within the auth theme to later milestones; CSRF noted as a future hardening item
(mitigated for now by `SameSite=Lax` + a CORS allowlist); dev-tooling audit
advisories and deferred frontend component tests still tracked in
`QUALITY_REPORT.md`.

---

## Session 1 — v0.1.0 Project Foundation — 2026-06-25

**Goal:** Initialize the repo and complete only `v0.1.0 — Project Foundation`:
durable foundation, docs/process framework, local dev setup, and CI.

**Execution mode:** Emulated-sequential. The controlled multi-agent roles
(Planner, Backend, Frontend ×2, Testing/QA, Security, Process Scribe) are defined
in `.claude/agents/`, but v0.1.0 is almost entirely *risky shared area* work
(schema, routing, architecture, CI, repo structure) which the project rules say
to **serialize**. So a single session performed the plan → implement → test →
review → scribe steps in sequence and authored the agent definitions for future
parallelizable milestones.

**What was built:** see `CHANGELOG.md` [0.1.0] and `docs/PROJECT_STATE.md`.
Monorepo, shared money/ledger library, Fastify+Socket.IO+Prisma backend, two
React+Vite apps, branding, tests, CI, and the full docs/process framework.

**Key decisions (see ADR-0001):**
- Stack pinned to stable, mainstream versions for future-session ergonomics.
- **Disciplined ledger from day one** — derived balances, integer minor units,
  conservation tests — even though no real transactions exist yet, so the
  discipline is structural rather than retrofitted.
- **Fastify 5** (not 4): the audit flagged the Fastify-4 → `fast-uri` chain;
  Fastify 5.8.5 is patched, so the backend runtime has **0 audit
  vulnerabilities**. APIs used are v5-compatible.
- **No committed `.env`:** a small `prisma-cli.mjs` wrapper provides the local
  SQLite URL cross-platform; Prisma resolves relative `file:` paths against the
  schema dir for both CLI and client, so `file:./dev.db` is unambiguous.

**Surprises / environment friction (sandbox only — not a product issue):**
- Prisma's engine downloader could not reach `binaries.prisma.sh` through the
  Claude Code Cloud egress proxy (ECONNRESET). Resolved by hosting a **local
  mirror** of the engine binaries (curl works through the proxy) and pointing
  Prisma at it via `PRISMA_ENGINES_MIRROR` + `PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING`.
  Normal machines and GitHub Actions download engines normally — no project
  change needed.
- The pre-installed Chromium (1194) didn't match Playwright 1.61's expected
  build (1228). Added an **opt-in** `PLAYWRIGHT_CHROMIUM_PATH` config hook (no-op
  for normal users/CI) and pointed it at the pre-installed browser.
- Initial seed invariant was too strict (treated a legitimate external
  *payment* outflow as "missing money"). Reframed to the correct invariants:
  transfers net to zero, and every settled credit is bank-originated or a
  transfer leg.

**Outcome:** `npm run verify` passes; 20 unit/integration + 3 smoke tests green;
runtime audit clean. Milestone complete; annotated tag `v0.1.0` created locally
(tag push is blocked by the environment's git policy — HTTP 403 — so the human
pushes it on merge to `main`; see the milestone report for commands). The
session branch was pushed. Stopped at the gate; did **not** begin v0.2.0.

**Carried forward / open items:** dev-tooling audit advisories (vite, vitest,
esbuild); deferred frontend component tests. Tracked in `QUALITY_REPORT.md`.

---

## Blocker-handling policy (applies every session)

If a required task genuinely fails after real attempts: try to fix it; if still
blocked, write a file under `docs/process/blockers/` containing what failed, what
was attempted, remaining errors, likely cause, options (retry / simplify / defer
/ remove / replace), a recommendation, and an exact suggested prompt for the next
session. Then **do not** mark the milestone complete or tag it; stop with a
truthful blocker report. Prioritize truthful project state over appearing done.

_No blockers were filed for v0.1.0, v0.2.0, or v0.3.0._

# PROJECT_STATE

> Snapshot of where the project actually is right now. Read this second (after
> `CLAUDE.md`) at the start of every session. Keep it current at every
> milestone end.

## At a glance

- **Current version / tag:** `v0.4.0` — Customer banking dashboard (complete).
  The annotated tag `v0.4.0` was created locally on the milestone commit; pushing
  tags is blocked by this environment's git policy (HTTP 403), so the tag must be
  (re)created/pushed by the human on merge to `main` — see the milestone report
  for the exact command.
- **Next milestone:** `v0.5.0` — Operations simulator core (not started).
- **Working branch (this session):** `claude/dreamy-allen-p2zd8w` (the Claude
  Code Cloud session branch, used as the milestone branch; intended milestone
  name `milestone/v0.4-dashboard`).
- **Gate status:** `npm run verify` ✅ passes. **93** unit/integration tests + **22**
  Playwright e2e tests green. **No schema change** and no new runtime audit
  advisories. Security review of v0.4.0: PASS (no new findings).
- **Runnable:** backend `:3000`, customer `:5173`, operations `:5174` via
  `npm run dev`. Browse the public site at `:5173`; sign in with the seeded demo
  accounts (see `README.md`) to reach the dashboard.
- **v0.3.0 review feedback addressed:** scroll-to-top on every navigation + a
  "Security" deep-link to `/about#security` (R-01), and session-aware entry points
  — "Visit your Dashboard" when signed in + an "already signed in" `/login` page
  (R-02). See `docs/process/HUMAN_REVIEW_v0.4.md`.

## What exists today

### Monorepo & tooling
- npm workspaces, shared `tsconfig.base.json`, ESLint 9 flat config, Prettier.
- Root scripts: `dev`, `dev:*`, `build`, `lint`, `typecheck`, `test`,
  `test:e2e`, `verify`, `clean`, `db:generate|migrate|reset|seed`.
- CI: `.github/workflows/ci.yml` (verify job + Playwright job).

### packages/shared (`@simbank/shared`)
- `version.ts` (APP_VERSION 0.4.0, milestone meta, `IS_SIMULATION`), `brand.ts`
  (Meridian tokens), `constants.ts` (ports, socket events), `types.ts` (roles,
  account/ops enums-as-unions, API DTOs), `money.ts`, `ledger.ts`,
  **`auth.ts`** (v0.2.0: `AUTH` policy constants, `ACCOUNT_RELATIONSHIPS`,
  `LOGIN_REASONS`, and auth DTOs — `SessionUser`, `AccountSummary`, etc.), and
  **`transactions.ts`** (v0.4.0: `TransactionDTO`, `AccountTransactionsResponse`,
  `TransactionQuery`, and pure helpers `toTransactionDTOs` / `filterTransactions` /
  `groupForStatus` / `originLabel` / `signedMinor`).
- **Money/ledger + transaction-derivation logic is the tested core** (see
  TEST_STRATEGY).

### apps/backend (Fastify 5 + Socket.IO + Prisma/SQLite)
- `buildServer()` (testable; now also registers `@fastify/cookie`), `index.ts`
  runtime entry, `realtime.ts`, routes `/`, `/health`, `/status`, `/api/meta`.
- **Auth (v0.2.0)** under `src/auth/`: `password.ts` (bcryptjs), `tokens.ts`
  (crypto token + SHA-256), `lockout.ts` (pure), `sessions.ts`, `access.ts`
  (RBAC; v0.4.0 adds `listAccountTransactions`), `guards.ts`
  (`requireAuth`/`requireRole`), `cookies.ts`, `audit.ts`.
  Routes: `/api/auth/{login,logout,me,login-history}`, `/api/accounts`,
  `/api/accounts/:id`, **`/api/accounts/:id/transactions`** (v0.4.0; access-scoped,
  derived, `?q=&group=&origin=`), `/api/ops/summary`, `/api/admin/users`.
- Prisma schema: `User` (now with password hash, status, lockout fields) +
  `Account`, `LedgerEntry`, `SimulationClock`, `AuditLog`, `OperationsRequest`,
  and **new** `Session`, `AccountAccess`, `LoginEvent`; two migrations (`init`,
  `auth_roles_sessions`).
- Seed: `prisma/seed.ts` → shared `src/seed-apply.ts` + pure `src/seed-plan.ts`
  (4 demo users across roles, hashed passwords, owner+joint access grants, and
  **~3 months of dated transaction history — 56 ledger entries** incl. current
  pending/held items, built via paired helpers so transfers balance) with money +
  access invariant guards. `npm run db:reset` works.

### apps/customer (React + Vite + Tailwind)
- **Public marketing site (v0.3.0):** `/` (polished home), `/checking`, `/savings`,
  `/cards` + `/borrow` (coming-soon overviews), `/about` (story + `#security` +
  roadmap), `/open-account` (onboarding placeholder → login). A reusable
  `components/marketing.tsx` kit (Section/PageHero/FeatureGrid/FAQ/RateTable/
  CTASection/icons), `lib/nav.ts`, a responsive sticky header + accessible mobile
  menu, a skip-to-content link, and a footer with real links.
- **Authenticated dashboard (v0.4.0):** `/dashboard` (**protected** accounts
  **overview** — combined total + per-account cards + recent sign-in activity),
  `/accounts/:id` (**protected** account detail — derived balances + transaction
  history with **pending vs posted**, running balance, search + status/category
  filter), `/statements` (**protected** statements placeholder). Built on
  `lib/account-display.ts`, `components/TransactionList.tsx`, and
  `fetchAccountTransactions`.
- **Auth surface (v0.2.0, extended v0.4.0):** `/login` (**real** sign-in; shows an
  **"already signed in"** panel when authenticated — R-02), `*` (404). Auth
  context/provider, session-aware nav + CTAs (`lib/cta.ts` → "Visit your
  Dashboard" when signed in), `components/ScrollToTop.tsx` (scroll-to-top + hash
  deep-link — R-01), logo, simulation banner/footer, backend-status pill, drop-in
  `ImagePlaceholder` (9 image slots + prompts).
- **Sessions are per-app (v0.3.0 fix):** the customer portal uses the `mer_session`
  cookie, the operations console uses `mer_ops_session`; the backend selects the
  cookie per request by Origin, so the two apps' sessions are independent.

### apps/operations (React + Vite + Tailwind)
- **Operator login** (staff-only; customer logins rejected) gating a dark
  operator console: live operations-summary strip, operator identity + role in
  the header, placeholder queues with approve/reject/hold/request-info buttons,
  scenario controls, simulated external-response panels, sidebar nav, status
  indicator, simulation banner.

### Branding & assets
- `assets/brand/` logo SVGs (horizontal/mark/mono-light) + README.
- `assets/prompts/IMAGE_GENERATION_PROMPTS.md` (5 marketing prompts).
- Per-app favicons; drop-in image folder `apps/customer/public/images/`.

### Process framework
- `docs/process/` fully populated (task board, experiment log, roadmap history,
  feedback log, agent handoffs, quality report, retrospective, milestone report,
  human review, next-session prompt, ADR-0001, feedback/ + blockers/ folders).
- `.claude/agents/` role definitions for the controlled multi-agent workflow.

## NOT built yet (by design — future milestones)
- **Live operations queues / WebSocket-driven workflows** (approve/reject/hold/
  request-info, audit, simulated SMS/email/MFA/identity events) — **v0.5.0 (next)**.
- **MFA, password reset, remember-device, new-device alerts** (deferred within
  the auth theme; planned alongside the operations queues that service them).
- **Money movement** (transfers, ACH, wires, deposit, bill pay) — which is what
  will create *new* transactions; today's transaction history is seeded (v0.7.0).
- Cards, fraud, loans, CDs, simulated time + real statement cycles (v0.8.0–v0.9.0).
- Frontend component unit tests (still deferred; auth + dashboard UIs are covered
  by build + Playwright journeys for now — see QUALITY_REPORT).

## Known issues / watch items
- **Dev-tooling npm audit advisories** (vite, vitest, esbuild) remain; runtime
  is clean. Tracked in `docs/process/QUALITY_REPORT.md` for a hardening pass.
- **Sandbox-only friction:** in the Claude Code Cloud sandbox, Prisma engine
  downloads required a local mirror + `PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING`,
  and Playwright used the pre-installed Chromium via `PLAYWRIGHT_CHROMIUM_PATH`.
  **None of this affects normal machines or GitHub Actions** (standard installs
  work). Documented in the milestone report and EXPERIMENT_LOG.

## How to run (summary)
```
npm install
npm run db:reset
npm run verify     # the gate
npm run dev        # backend :3000, customer :5173, operations :5174
```
Full per-OS instructions: `README.md` and `docs/process/HUMAN_REVIEW_v0.1.md`.

## Source of truth
Markdown wins. `docs/process/TASK_BOARD.md` is the authoritative task list;
GitHub Issues (if present) are a mirror only.

# PROJECT_STATE

> Snapshot of where the project actually is right now. Read this second (after
> `CLAUDE.md`) at the start of every session. Keep it current at every
> milestone end.

## At a glance

- **Current version / tag:** `v0.5.0` — Operations simulator core (complete).
  The annotated tag `v0.5.0` was created locally on the milestone commit; pushing
  tags is blocked by this environment's git policy (HTTP 403), so the tag must be
  (re)created/pushed by the human on merge to `main` — see the milestone report
  for the exact command.
- **Next milestone:** `v0.6.0` — Onboarding and account opening (not started).
- **Working branch (this session):** `claude/epic-noether-wk05jc` (the Claude
  Code Cloud session branch, used as the milestone branch; intended milestone
  name `milestone/v0.5-operations-core`).
- **Gate status:** `npm run verify` ✅ passes. **145** unit/integration tests + **25**
  Playwright e2e tests green. Additive `operations_core` migration (first since
  v0.2.0; money/auth tables untouched); no new runtime audit advisories. Security
  review of v0.5.0: PASS (its one Medium — a test for the socket-room RBAC — was
  added this milestone).
- **Runnable:** backend `:3000`, customer `:5173`, operations `:5174` via
  `npm run dev`. Sign in to the operations console at `:5174` with a seeded staff
  login (Sam operator / Riley admin — see `README.md`) to work the live queue.
- **Money discipline preserved:** operator actions change a request's workflow
  status + write an audit row — they NEVER post to the ledger (money movement is
  v0.7.0). Balances stay derived; a test asserts no ledger write on action.

## What exists today

### Monorepo & tooling
- npm workspaces, shared `tsconfig.base.json`, ESLint 9 flat config, Prettier.
- Root scripts: `dev`, `dev:*`, `build`, `lint`, `typecheck`, `test`,
  `test:e2e`, `verify`, `clean`, `db:generate|migrate|reset|seed`.
- CI: `.github/workflows/ci.yml` (verify job + Playwright job).

### packages/shared (`@simbank/shared`)
- `version.ts` (APP_VERSION 0.5.0, milestone meta, `IS_SIMULATION`), `brand.ts`
  (Meridian tokens), `constants.ts` (ports, socket events — now incl. the ops
  events + `OPS_REALTIME_ROOM`), `types.ts` (roles, account/ops enums-as-unions,
  API DTOs), `money.ts`, `ledger.ts`,
  **`auth.ts`** (v0.2.0: `AUTH` policy constants, `ACCOUNT_RELATIONSHIPS`,
  `LOGIN_REASONS`, and auth DTOs — `SessionUser`, `AccountSummary`, etc.),
  **`transactions.ts`** (v0.4.0: `TransactionDTO`, `AccountTransactionsResponse`,
  `TransactionQuery`, and pure helpers `toTransactionDTOs` / `filterTransactions` /
  `groupForStatus` / `originLabel` / `signedMinor`), and
  **`operations.ts`** (v0.5.0: ops action/priority/channel enums, the pure action
  **state machine** — `nextStatusForAction` / `isTerminalOpsStatus` /
  `canApplyAction` — `OperationsRequestDTO` + detail + `OperatorActionLogDTO` +
  `SimulatedEventDTO`, the API + socket payload DTOs, and label/`OPS_QUEUES`/
  `countRequestsByStatus` helpers).
- **Money/ledger + transaction-derivation logic is the tested core** (see
  TEST_STRATEGY); the ops contract is likewise pure + unit-tested.

### apps/backend (Fastify 5 + Socket.IO + Prisma/SQLite)
- `buildServer({ opsRealtime? })` (testable; registers `@fastify/cookie`; decorates
  `app.opsRealtime`), `index.ts` runtime entry (binds the Socket.IO publisher),
  `realtime.ts` (Socket.IO + **handshake RBAC** → operators room), routes `/`,
  `/health`, `/status`, `/api/meta`.
- **Auth (v0.2.0)** under `src/auth/`: `password.ts` (bcryptjs), `tokens.ts`
  (crypto token + SHA-256), `lockout.ts` (pure), `sessions.ts`, `access.ts`
  (RBAC; v0.4.0 adds `listAccountTransactions`), `guards.ts`
  (`requireAuth`/`requireRole`), `cookies.ts` (now exports `sessionAudienceForOrigin`),
  `audit.ts`.
- **Operations (v0.5.0)** under `src/ops/`: `requests.ts` (service — list/detail/
  `applyOperatorAction` state machine/`createSimulatedEvent`, mappers, typed
  `OpsActionError`, reuses `AuditLog`; **writes no ledger**) and `realtime.ts`
  (`OpsRealtime` publisher — Socket.IO impl + no-op default + recording double; the
  cookie parser + operator-role helper used by the handshake).
  Routes: `/api/auth/{login,logout,me,login-history}`, `/api/accounts`,
  `/api/accounts/:id`, `/api/accounts/:id/transactions`, **`/api/ops/requests`**
  (+ `:id`, `:id/action`), **`/api/ops/simulate/event`**, **`/api/ops/events`**,
  `/api/ops/summary` (now with per-status counts), `/api/admin/users`. All `/api/ops/*`
  are `requireRole('ops_agent','admin')`.
- Prisma schema: `User`, `Account`, `LedgerEntry`, `SimulationClock`, `AuditLog`,
  `Session`, `AccountAccess`, `LoginEvent`, a **fleshed-out `OperationsRequest`**
  (priority, detail, subject, last-action bookkeeping, `resolvedAt`), and **new
  `SimulatedEvent`**; three migrations (`init`, `auth_roles_sessions`,
  **`operations_core`** — additive; money/auth tables untouched).
- Seed: `prisma/seed.ts` → shared `src/seed-apply.ts` + pure `src/seed-plan.ts`
  (4 demo users, hashed passwords, owner+joint grants, **56 dated ledger entries**
  incl. pending/held, **plus a 10-item dated operations queue + 4 simulated events**
  with intake audit rows) with money + access + **ops-integrity** invariant guards.
  `npm run db:reset` works.

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
  operator console with a **live, WebSocket-driven** workflow (v0.5.0):
  - One `OpsDataProvider` owns a single Socket.IO connection (`useOpsSocket`) +
    the in-memory queue/feed; actions update optimistically and the socket echoes
    idempotently and delivers other operators' changes. `lib/opsApi.ts` is the
    typed client.
  - **Dashboard** (`/`): live overview — open-request count, per-status queue
    snapshot, needs-attention list, recent simulated events, a **Live** indicator.
  - **Request queues** (`/queues`): live cards with status + queue-lane filters,
    approve/reject/hold/request-info quick actions, and a detail panel (history,
    linked events, optional audit note).
  - **Simulated messaging** (`/messaging`): clearly-labelled SMS/email/MFA/identity
    generators + a live event feed (never a real provider).
  - Sidebar nav is real `NavLink`s (Dashboard / Request queues / Simulated
    messaging); simulation banner + footer disclaimer throughout.

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
- **Onboarding / account opening** (open-account flow, identity verification,
  initial funding, joint-account invitation, ops approval feeding the queue,
  admin-created users) — **v0.6.0 (next)**. Today the operations queue is seeded;
  v0.6.0 makes a real customer flow feed it.
- **Money movement** (transfers, ACH, wires, deposit, bill pay) — which is what
  will create *new* transactions and give operator approvals their **ledger**
  effects; today's transaction history is seeded and operator actions are
  workflow-only (v0.7.0).
- **MFA, password reset, remember-device, new-device alerts** (deferred within the
  auth theme; the v0.5.0 queue already models the requests, but the customer-facing
  flows that raise them land later).
- Cards, fraud, loans, CDs, simulated time + real statement cycles (v0.8.0–v0.9.0).
- Frontend component unit tests (still deferred; auth + dashboard + ops console UIs
  are covered by build + Playwright journeys + backend/contract tests for now — see
  QUALITY_REPORT).

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

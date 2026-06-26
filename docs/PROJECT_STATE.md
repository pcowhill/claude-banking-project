# PROJECT_STATE

> Snapshot of where the project actually is right now. Read this second (after
> `CLAUDE.md`) at the start of every session. Keep it current at every
> milestone end.

## At a glance

- **Current version / tag:** `v0.6.2` — Operations sign-in fix (a patch on top of
  v0.6.1). The annotated tag `v0.6.2` was created locally on the patch commit;
  pushing tags is blocked by this environment's git policy (HTTP 403), so the tag
  must be (re)created/pushed by the human on merge to `main` — see
  `docs/process/MILESTONE_REPORT_v0.6.2.md` for the exact command. (The previous
  feature milestone, `v0.6.0` — Onboarding and account opening, remains the last
  feature release; v0.6.1 and v0.6.2 are bug-fix patches on it.)
- **What v0.6.2 fixed (from the v0.6.1 review):** **B-06** — a blocking regression
  from the v0.6.1 B-04 fix: the operator could not sign in at all (the dashboard
  flashed, then the console looped back to the sign-in screen with "Your operator
  session has ended…", for both Sam and the Administrator, even after clearing
  cookies). Root cause: the backend chose the per-surface session cookie from the
  request **`Origin`** header, which browsers **omit on same-origin GETs**, so the
  console's authenticated `/api/ops/*` GETs read the empty customer cookie → 401 →
  the v0.6.1 recovery handler looped. Fix: each app declares its surface via an
  explicit **`x-meridian-surface`** header the backend trusts ahead of `Origin`
  (Origin kept as a fallback); the ops client sends it on every REST call + the
  socket handshake. **No schema / migration / ledger / money-contract change**; the
  v0.3.0 session isolation is preserved. The customer portal was left unchanged.
- **What v0.6.1 fixed (still in place):** **B-03** — narrow-window top-bar menu (☰)
  so all sections stay reachable at any width; **B-04** — the console reconciles a
  genuinely invalid/expired session (HTTP 401) and returns the operator to sign-in
  with a clear notice, recovering on re-login. (v0.6.2 fixes the case where that
  recovery fired on a *valid* session because the cookie was read wrong.)
- **Next milestone:** `v0.7.0` — Money movement (not started; deferred by the human
  until v0.6.2 is reviewed). Carries the v0.5.0 review's **Q-01 acceptance note**:
  approving a deposit-review request must post the pending deposit (pending →
  posted) so the customer's line stops reading *Pending* and the available balance
  updates.
- **Working branch (this session):** `claude/gracious-fermi-5cfomj` (the Claude
  Code Cloud session branch, used as the patch branch; intended name
  `milestone/v0.6.2-ops-signin`). NOTE: this branch was cut from `main` (v0.6.0)
  without the v0.6.1 commit, which lived unmerged on `claude/dreamy-maxwell-njcxe7`;
  this session fast-forwarded it in, so the branch contains v0.6.0 + v0.6.1 + v0.6.2.
- **Gate status:** `npm run verify` ✅ passes. **201** unit/integration tests (was
  189; +12 for the B-06 reproduction + cookie-resolution unit tests) + **33**
  Playwright e2e tests green (was 32; +1 same-origin sign-in regression). No
  schema/migration change this patch; no new runtime audit advisories. (v0.6.0's
  security review remains PASS; v0.6.2 changed the shared auth contract + backend
  session-cookie/real-time resolution + the operations-app client only.)
- **Runnable:** backend `:3000`, customer `:5173`, operations `:5174` via
  `npm run dev`. Try the headline flow: apply at `:5173/open-account`, approve it in
  the ops console at `:5174` as Sam, then sign in as the new customer. (Or approve
  the seeded Taylor Prospect application and sign in with `Prospect123!`.)
- **Money discipline preserved — and first exercised on an approval.** Most operator
  actions still change workflow status + write an audit row only. The new exception
  is an **onboarding approval**, which provisions a user/account and posts the
  opening deposit as an explicit **bank-originated, posted `deposit`** ledger entry
  (audited, atomic, duplicate-email-guarded); admin-funded users post an audited
  `adjustment` requiring a reason. Value enters ONLY via these bank-originated
  events; balances stay derived; a test asserts the settled total moves by exactly
  the funded amount. (Deposit *posting* — pending→posted — is still v0.7.0.)

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
  - **Responsive nav (v0.6.1, B-03):** below the `lg` breakpoint the sidebar is
    replaced by an accessible top-bar menu (☰) opening the same links (shared
    `NavList`), so every section stays reachable at any width.
  - **Session recovery (v0.6.1, B-04):** an authentication failure (HTTP 401
    `unauthenticated`/`session_expired`) on any `/api/ops/*` call signs the operator
    out in the UI and returns them to the sign-in screen with a clear notice
    (`api.ts` `setSessionInvalidHandler` → `AuthContext` `sessionEnded`), instead of
    stranding them on an authenticated-looking console whose data calls all fail.

### Onboarding & account opening (v0.6.0)
- **Open-account flow (customer):** `/open-account` is a real, clearly-simulated
  application (applicant details, product, simulated opening deposit, optional
  joint-owner invite, consent) → public `POST /api/onboarding/applications` →
  confirmation. Submitting **queues** an `onboarding` work item on the v0.5.0 ops
  queue (pushed live) + onboarding `SimulatedEvent`s (application-received /
  identity / MFA); it creates no user/account/money.
- **Approval → provisioning (operator):** approving an `onboarding` request creates
  the `User` + `Account` + owner grant and posts any opening deposit as an explicit
  **bank-originated, posted `deposit`** ledger entry — atomically, audited,
  precondition-guarded (blocked + rolled back if the email already exists).
  Rejecting marks the application declined. Reuses `OperationsRequest` + the action
  service + the real-time channel (no new ops endpoint/socket event).
- **Joint invitations:** owner-only `POST /api/accounts/:id/invitations`;
  `GET /api/invitations`; `accept|decline`. Accepting creates a `joint`
  `AccountAccess` grant. Customer UI: an invite form on account detail + an
  invitations inbox on the dashboard.
- **Admin-created demo users:** `POST /api/admin/users` (admin) creates a user and
  optionally opens + funds an account (funding = audited `adjustment` requiring a
  reason); an admin-only **Create demo user** page in the ops console.
- **Add-note-anytime (B-02):** a non-decision `note` action (audited, no status
  change, allowed on terminal) + an always-available "Add note" button.
- **Detail-panel live sync (B-01 fix):** the ops request detail panel reads the
  live shared queue state, so its status badge + buttons deactivate from anywhere
  (queue card, socket, another operator).
- New models: `OnboardingApplication` (1:1 with its request; bcrypt hash held
  server-side, never in a DTO) + `AccountInvitation` (additive `onboarding`
  migration). Shared `@simbank/shared/onboarding` holds the DTOs + pure validators.

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
- **Money movement** (transfers, ACH, wires, **mobile check deposit posting**, bill
  pay) — what creates *new* transactions and gives most operator approvals their
  **ledger** effects — **v0.7.0 (next)**. Carries the v0.5.0 review's **Q-01**: an
  existing pending deposit does not yet flip to *Posted* on approval (that is money
  movement). v0.6.0 only creates money for **account opening**.
- **MFA / 2FA at login, password reset, remember-device, new-device alerts**
  (deferred within the auth theme). v0.6.0 uses the simulated-messaging seam for
  **onboarding** identity/MFA (the review's **Q-02**); customer-facing login-time
  2FA — which will create a `SimulatedEvent` OTP per the same seam — lands later.
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

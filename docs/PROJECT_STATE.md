# PROJECT_STATE

> Snapshot of where the project actually is right now. Read this second (after
> `CLAUDE.md`) at the start of every session. Keep it current at every
> milestone end.

## At a glance

- **Current version / tag:** `v1.0.0` — Polish, hardening, loans/CDs/interest, final
  retrospective (the **final** milestone; re-scoped by the human at the v0.9.0 review
  into a combined feature + hardening + polish capstone). An annotated tag `v1.0.0` is
  created locally on the milestone commit; **pushing tags is blocked by this
  environment's git policy (HTTP 403)**, so the human (re)creates/pushes the tag on merge
  to `main` — see `docs/process/MILESTONE_REPORT_v1.0.0.md` for the exact command.
- **What v1.0.0 added:** **loans / CDs / interest accrual** (pulled in by the human now
  that the clock exists) — a `cd`/`loan` Account + 1:1 `LendingProduct` (terms only); open
  CD / open loan / pay loan / withdraw matured CD post **net-zero** `transfer` pairs (a
  loan is a NEGATIVE owed balance); **interest accrues on clock advance** as
  bank-originated `interest` entries (savings + CD credits, loan debits), monthly +
  bounded + idempotent; customer **`/loans`** portal + operations **`/lending`** view.
  **Simulated-date correctness:** every money/business timestamp now reads the simulation
  clock (fixing the clock-fired bill-pay approve-date bug); auth/operational stay
  wall-clock (ADR-0003, supersedes ADR-0002 #2). **CSRF (SEC-1)** enforced (double-submit
  token). **Marketing placeholders** corrected (Cards + Loans & CDs are live). **First
  frontend unit tests** added. One **additive** migration (`lending`).
- **Earlier feature milestone:** `v0.9.0` — Simulation clock & scheduled payments
  (controllable forward-only clock + clock-driven scheduler + statement cycles). Still
  fully in place.
- **What v0.9.0 added:** a controllable **simulation clock** (`GET /api/clock`;
  ops/admin `POST /api/ops/clock/advance` — **forward-only**, audited — which then
  **fires** due schedules; `GET /api/ops/schedules`). **Recurring/scheduled payments**
  (the `M-09` item carried from v0.7.0): a customer schedules a one-off-future or
  recurring (`once`/`weekly`/`monthly`) **internal transfer** or **bill pay**
  (`POST/GET /api/schedules`, `POST /api/schedules/:id/cancel`); when the clock passes
  the due date a **scheduler** fires it through the v0.7.0 money service (transfer posts
  both legs → nets to zero; bill pay → a pending entry + a reviewable ops item).
  **Statement cycles** (`GET /api/accounts/:id/statements`) derive monthly periods from
  the simulated date. Customer UI at **/scheduled-payments** + an upgraded **/statements**;
  operations **Simulation clock** page at **/clock**. **One additive Prisma migration**
  (`PaymentSchedule`). The `sim:heartbeat` event now also carries `simulationTime`
  (backward-compatible; no new socket event). Design: `docs/process/decisions/ADR-0002`.
- **Earlier feature milestone:** `v0.8.0` — Cards, fraud, disputes (card lifecycle at
  **/wallet**; `fraud_alert` confirm/deny + operator confirm→reverse+freeze; disputes
  uphold→reverse / deny→posted; the R-03 **"Reversed"** tag). Still fully in place.
- **Earlier feature milestone:** `v0.7.0` — Money movement (the first where an
  operator approval MOVES money; internal transfers, reviewable external movements,
  approve→post / reject→fail / reverse). Still fully in place.
- **Tag-history note:** the prior session's v0.6.2 tag was a *local-only* sandbox tag
  that was never pushed; **no v0.6.2 tag exists in-repo** (the human confirmed they
  had not tagged it). Earlier docs that said v0.6.2 was "tagged" referred to that
  local tag — corrected here and in the task board.
- **What v0.7.0 added:** customer **money movement** where an operator approval first
  has a true **ledger** effect. **Internal transfers** (`POST /api/transfers`) post
  BOTH `transfer` legs and net to zero. **Reviewable external movements**
  (`POST /api/movements` — mobile check deposit, external ACH, wire, bill pay) write
  a **pending** ledger entry + a linked ops-queue item; an operator **approve** posts
  it (pending→posted), **reject** fails it (pending→failed, releasing reserved
  funds), **hold/request-info** leave it pending. A **reversal**
  (`POST /api/ops/movements/:id/reverse`, ops/admin, reason required) flips a posted
  entry to `reversed`. Customer **/move-money** UI (tabbed) + operator
  money-movement context + reverse affordance. **Closes the carried Q-01:** approving
  the seeded mobile-check deposit flips the customer's line Pending→Posted and updates
  available. **No Prisma migration** (the ledger + `OperationsRequest.payload` already
  sufficed).
- **What v0.6.x fixed (still in place):** **B-03** narrow-width ☰ nav; **B-04**
  expired-session recovery; **B-06** the surface-header session resolution (operator
  sign-in). All green.
- **Next milestone:** none planned — **v1.0.0 is the final milestone.** Future work is
  the explicitly deferred set (clock auto-advance by a speed multiplier; a dedicated
  credit-card account product; customer-facing login 2FA; the Vite/Vitest major upgrade
  clearing the dev-tooling audit advisories), at the human's direction.
- **Working branch (this session):** `claude/elegant-pascal-lg8lcr` (the Claude Code
  Cloud session branch; intended milestone name `milestone/v1.0.0-polish-hardening-lending`).
- **Gate status:** `npm run verify` ✅ passes (lint 0 warnings, typecheck ×4,
  unit/integration, build ×4) + Playwright e2e green. <!-- GATE_TBD: exact counts
  finalized at tag (332 → +shared lending + backend lending/accrual + CSRF + date
  regression + first frontend component tests; e2e 44 → +lending, dashboard/marketing
  updated). See QUALITY_REPORT.md / MILESTONE_REPORT_v1.0.0.md. --> One **additive**
  migration (`lending`); **runtime `npm audit` = 0** (dev-tooling advisories accepted with
  an upgrade path). Security review **PASS-with-findings** (no Critical/High/Medium; the
  CSRF session-presence gate + the lending owner-scoped boundary confirmed sound; Low/Info
  acted on or accepted). SEC-1 CSRF is now **enforced** (double-submit token).
- **Runnable:** backend `:3000`, customer `:5173`, operations `:5174` via
  `npm run dev`. v1.0.0 headline flow: as **Avery** at `:5173/loans` open a **CD** or a
  **loan** (and see the seeded CD + loan); then as **Sam** at `:5174` open **Simulation
  clock** and **fast-forward** — due schedules fire AND **interest accrues** (savings/CD
  credits, loan debits), shown in the accrual summary; approve the fired **City Power and
  Light** bill pay and it posts on the **simulated** date (the v0.9.0-review fix). Back as
  Avery, balances reflect interest + payments. (All of v0.7.0–v0.9.0 still works the same.)
- **Money discipline — now exercised on real movement.** Money moves ONLY via explicit
  `LedgerEntry` rows; **no balance is ever stored or edited.** Transfers post both legs
  and net to zero; external value enters only via a bank-originated posted `deposit`
  credit and leaves only via a posted `payment` debit; failures/reversals are ledger
  **status** changes (`failed`/`reversed`), never balance edits; reversal requires a
  reason + audit. Balances stay DERIVED; a test asserts the system settled total moves
  by exactly the posted amount (and is unchanged by a transfer).

## What exists today

### Monorepo & tooling
- npm workspaces, shared `tsconfig.base.json`, ESLint 9 flat config, Prettier.
- Root scripts: `dev`, `dev:*`, `build`, `lint`, `typecheck`, `test`,
  `test:e2e`, `verify`, `clean`, `db:generate|migrate|reset|seed`.
- CI: `.github/workflows/ci.yml` (verify job + Playwright job).

### packages/shared (`@simbank/shared`)
- `version.ts` (APP_VERSION 0.9.0, milestone meta, `IS_SIMULATION`), `brand.ts`
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
  `countRequestsByStatus` helpers; v0.7.0 adds the `bill_pay` type), and
  **`money-movement.ts`** (v0.7.0: movement kinds, direction/origin mapping, bounds,
  the `MovementPayload` + `asMovementPayload`, and the pure `validateTransfer` /
  `validateExternalMovement` validators + `movementOpsType`),
  **`cards.ts`** + **`risk.ts`** (v0.8.0: card + fraud/dispute enums, DTOs, validators,
  masking; `isRequestReversed`), and
  **`clock.ts`** / **`schedules.ts`** / **`statements.ts`** (v0.9.0: the simulation-clock
  advance bounds + `validateAdvance` + `SimHeartbeatPayload`; schedule kinds/frequencies/
  statuses, DTOs, `validateCreateSchedule`, the calendar-safe `addInterval`,
  `ScheduleFireSummary`; and the pure `buildStatementPeriods` / `summarizeStatementPeriod`).
- **Money/ledger + transaction-derivation logic is the tested core** (see
  TEST_STRATEGY); the ops + money-movement + clock/schedule/statement contracts are
  likewise pure + unit-tested.

### apps/backend (Fastify 5 + Socket.IO + Prisma/SQLite)
- `buildServer({ opsRealtime? })` (testable; registers `@fastify/cookie`; decorates
  `app.opsRealtime`), `index.ts` runtime entry (binds the Socket.IO publisher),
  `realtime.ts` (Socket.IO + **handshake RBAC** → operators room), routes `/`,
  `/health`, `/status`, `/api/meta`.
- **Auth (v0.2.0)** under `src/auth/`: `password.ts` (bcryptjs), `tokens.ts`
  (crypto token + SHA-256), `lockout.ts` (pure), `sessions.ts`, `access.ts`
  (RBAC; v0.4.0 adds `listAccountTransactions`), `guards.ts`
  (`requireAuth`/`requireRole`), `cookies.ts` (now exports `sessionAudienceForOrigin`),
  `audit.ts`, and **`csrf.ts` (v1.0.0 — SEC-1 enforced)**: a global double-submit hook —
  a non-httpOnly `mer_csrf` cookie is set on safe GETs + login, and any mutating request
  **that carries a session cookie** must echo a matching `x-meridian-csrf` header
  (constant-time compare) or it is rejected 403; login/logout/public-onboarding are
  exempt, and unauthenticated mutating requests fall through to the honest 401.
  `SameSite=Lax` + the CORS allowlist remain as defense in depth. Both apps' `lib/api.ts`
  clients read the cookie and send the header.
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
  `SimulatedEvent`**, and **`Card` + `CardTravelNotice` (v0.8.0)**; five migrations
  (`init`, `auth_roles_sessions`, `operations_core`, `onboarding`, **`cards`** — each
  additive; money/auth tables untouched).
- Seed: `prisma/seed.ts` → shared `src/seed-apply.ts` + pure `src/seed-plan.ts`
  (4 demo users, hashed passwords, owner+joint grants, **58 dated ledger entries**
  incl. pending/held + a `disputed` charge, **an 11-item dated operations queue + 4
  simulated events**, **2 simulated cards (v0.8.0)**, with intake audit rows — incl.
  v0.7.0 reviewable money movements each linked to its pending entry, and v0.8.0 a
  **fraud alert** linked to a card + its charge and an **open dispute** on the disputed
  charge) with money + access + **ops** + **movement** + **card** integrity invariant
  guards. `npm run db:reset` works.

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

### Money movement (v0.7.0)
- **Internal transfers (immediate):** `POST /api/transfers` posts BOTH `transfer`
  legs (debit source + credit destination) atomically so a transfer **nets to
  zero**; validated for non-viewer access to both accounts + sufficient available.
- **Reviewable external movements:** `POST /api/movements` (mobile check deposit /
  external ACH in-out / wire / bill pay) writes a **pending** `LedgerEntry` (a
  bank-originated `deposit` credit for inbound, a `payment` debit for outbound) + a
  linked `OperationsRequest` whose `payload` carries the movement context + the
  `ledgerEntryIds`. A pending debit reserves available immediately (a hold).
- **Approval has a ledger effect:** `applyOperatorAction` posts the linked pending
  entries on **approve** (pending→posted), fails them on **reject**
  (pending→failed), leaves them pending on **hold/request-info** — reusing the
  v0.6.0 approval→ledger pattern, atomic + audited. **Reversal:**
  `POST /api/ops/movements/:requestId/reverse` (ops/admin, **reason required**)
  flips posted entries to `reversed`.
- **Customer UI:** `/move-money` (tabbed: Transfer / Deposit a check / Send money /
  Pay a bill), reached from the dashboard quick links + account detail; reviewable
  movements then show as **Pending** in the transaction list until posted.
- **Operator UI:** the request detail panel shows the money-movement context
  (type/amount/direction/counterparty/memo + a "Reversed" indicator) and a
  **Reverse movement** affordance for an approved+posted movement.
- **No schema change** — the disciplined ledger (`status`/`origin`/`reason`) +
  `OperationsRequest.payload` already sufficed. Shared `@simbank/shared/money-movement`
  holds the kinds, the `MovementPayload`, and the pure `validateTransfer` /
  `validateExternalMovement` validators; `bill_pay` was added to the ops types.
- **The carried Q-01 is closed:** the seeded "Mobile check deposit" is linked to its
  review item, so approving it flips the customer's line **Pending → Posted** and
  updates the available balance.

### Cards, fraud & disputes (v0.8.0)
- **Cards (customer self-service):** a new `Card` model + lifecycle service —
  `issueCard` (`POST /api/accounts/:id/cards`), `freeze`/`unfreeze`, `report`
  lost/stolen (terminates the old card, issues a **replacement** linked via
  `replacesCardId`), and travel notices (`/travel-notices`, `/cancel`). `GET /api/cards`
  + `GET /api/accounts/:id/cards`. All `requireAuth`, access-scoped (owner/joint/
  authorized, not viewer), audited — and **never write the ledger**. Customer UI at
  **`/wallet`** (masked number, brand/type, expiry, status; gated lifecycle actions).
  Shared `@simbank/shared/cards` holds the enums, pure validators, masking + labels.
- **Fraud:** a `fraud_alert` ops item. Customer: `GET /api/fraud-alerts` +
  `POST /api/fraud-alerts/:id/respond` (confirm/deny, scoped to the alert subject;
  records the response + an inbound SimulatedEvent, does not resolve). Operator (via the
  existing `/api/ops/requests/:id/action`): **approve = confirm fraud** → reverse the
  linked entry + freeze the linked card; **reject = dismiss**. Dashboard confirm/deny UI.
- **Disputes:** `POST /api/disputes` flags a **posted** entry `disputed` (still counts
  as posted, shown flagged) + queues a `dispute` item. Operator **approve = uphold** →
  `disputed`→`reversed` (a refund as a ledger status change); **reject = deny** →
  `disputed`→`posted`. A **transfer leg is not disputable** (must net to zero). Customer
  UI: a **Dispute** affordance + "Disputed" badge in the transaction list.
- **Generalized reversal:** one `reverseLedgerEntries` core (`posted`/`disputed`→
  `reversed`) backs the v0.7.0 movement reversal **and** dispute/fraud reversals.
  `applyOperatorAction` gained `dispute` + `fraud_alert` branches (atomic + audited).
  **No new ops endpoint or socket event** — resolution reuses the existing action route
  and `ops:request_changed`.
- **R-03 — "Reversed" tag:** `isRequestReversed(payload)` (shared) drives a `ReversedBadge`
  shown beside the **Approved** badge on the ops queue cards, dashboard lists, and detail
  panel whenever `payload.reversed` is set. The request stays terminal-approved.
- **Schema:** one **additive** migration `cards` (`Card` + `CardTravelNotice`); no
  existing table altered. Shared `@simbank/shared/risk` holds the fraud/dispute payloads
  + validators.

### Simulation clock, scheduled payments & statements (v0.9.0)
- **Simulation clock:** a controllable, operator-driven "now". `src/clock/clock.ts`
  exposes `simulationNow` + a **forward-only**, audited `advanceClock`. `GET /api/clock`
  (any signed-in user — display) and `POST /api/ops/clock/advance` (ops/admin) which
  advances the clock and then **fires** due schedules; `GET /api/ops/schedules` lists all.
  The clock is **reset to seed time** on every seed (deterministic demo/tests).
- **Scheduler:** `src/scheduler/scheduler.ts` `runDueSchedules(upTo)` fires every active
  schedule whose `nextRunAt` has been passed, REUSING the v0.7.0 money service — an
  **internal transfer** posts both `transfer` legs at the due date (nets to zero); a
  **bill pay** writes a **pending** `payment` debit + a linked reviewable ops item. It
  **claims** each occurrence (advances `nextRunAt`) before the money moves so an
  interruption can't double-fire; **catch-up** is bounded per advance; a fire that fails
  its funds/access check is **skipped** (no entry) + audited (never silently dropped, and
  never rethrown after claim — the per-schedule loop is guarded).
- **Schedules:** `src/scheduler/schedules.ts` — `createSchedule` (access-checked) /
  `listSchedulesForUser` / `listAllSchedules` / `cancelSchedule` (owner-only). Customer
  routes `POST/GET /api/schedules`, `POST /api/schedules/:id/cancel` (`routes/schedules.ts`).
- **Statement cycles:** `GET /api/accounts/:id/statements` (access-scoped, in
  `routes/accounts.ts` via `auth/access.ts` `getAccountStatements`) derives monthly
  periods from the simulated date read-only over the posted ledger (opening/closing +
  credits/debits + count). No stored statement, no real PDF.
- **Real-time:** the `sim:heartbeat` event now also carries `simulationTime` (best-effort
  clock read; **backward-compatible — no new socket event**); fired bill-pay reviews reuse
  the existing `ops:request_changed` channel.
- **Customer UI:** `/scheduled-payments` (create/list/cancel + the simulated date) +
  an upgraded `/statements`. **Operations UI:** a **Simulation clock** page at `/clock`
  (live date, fast-forward + fired summary, all-schedules table).
- **Schema:** one **additive** migration `scheduled_payments` (`PaymentSchedule` only);
  no existing table altered. The time model + decisions are recorded in
  **`docs/process/decisions/ADR-0002-simulation-clock-and-scheduler.md`**.

### Loans, CDs & interest accrual (v1.0.0)
- **Model:** a CD or a loan is a dedicated `cd`/`loan` **`Account`** (both already in
  `ACCOUNT_TYPES`) paired 1:1 with a **`LendingProduct`** row that holds only the **terms**
  (`kind`, `status`, `principalMinor`, `apyBps`, `termMonths`, `openedAt`, `maturesAt`,
  `lastAccruedAt`, nullable `paymentMinor` for loans). A **loan carries a NEGATIVE (owed)
  balance**; balances stay DERIVED from the ledger as always.
- **Movements (all net-zero):** `apps/backend/src/lending/lending.ts` — `openCd` (funding
  account → CD), `openLoan` (loan account −principal + checking +principal, with an
  amortized `paymentMinor`), `makeLoanPayment` (checking → loan; insufficient → typed
  error), `withdrawMaturedCd` (CD → checking at/after maturity). Each posts paired
  `transfer` legs that **net to zero** (no money created); the only new money is interest.
- **Interest accrual on clock advance:** `apps/backend/src/lending/accrual.ts`
  `runInterestAccrual(upTo)` posts a **bank-originated `interest`** credit for each active
  savings (default APY) + CD (product APY) and an `interest` debit on each active loan's
  outstanding balance — **monthly cadence, bounded catch-up, idempotent** via a per-target
  bookmark (`lastAccruedAt` / `Account.interestAccruedThrough`), each entry **dated at the
  simulated period end**. It is **wired into `POST /api/ops/clock/advance` right after
  `runDueSchedules`** (no background timer — accrual happens on advance, like the
  scheduler). Ledger-only; audited.
- **Shared** `@simbank/shared/lending`: `LENDING_KINDS` (`cd`/`loan`), `LENDING_STATUSES`
  (`active`/`matured`/`paid_off`/`closed`), the default savings APY + bounds, the lending
  DTOs, and the PURE math (`monthlyAccrualMinor`, `amortizedPaymentMinor`,
  `projectCdMaturityMinor`, calendar-safe period iteration) + validators
  (`validateOpenCd` / `validateOpenLoan` / `validateLoanPayment`) — reused client + server,
  unit-tested.
- **Routes** `apps/backend/src/routes/lending.ts` (customer, `requireAuth`, access-scoped):
  `POST /api/lending/cds`, `POST /api/lending/loans`, `GET /api/lending` (the user's
  lending products with derived balances + product terms),
  `POST /api/lending/loans/:id/pay`, `POST /api/lending/cds/:id/withdraw`; ops read-only
  `GET /api/ops/lending`.
- **Customer UI:** a `/loans` portal (open/list/pay/withdraw, simulated-date aware); the
  dashboard now **groups** accounts into cash (checking/savings — the headline total) vs.
  Loans & CDs (a loan shown as an amount owed) so a loan's negative balance can't distort
  the headline total, plus a savings-APY note. **Operations UI:** a read-only `/lending`
  view + an interest-accrual summary on the Simulation clock page alongside fired schedules.
- **Schema:** one **additive** migration `lending` (`LendingProduct` + the nullable
  `Account.interestAccruedThrough` column); no existing table altered. **Seed:** Avery has
  a 6-month CD ($2,000) + a Personal loan ($6,000 owed); savings accrues at 1.50% APY
  (`assertSeedLendingIntegrity`). Design recorded in
  **`docs/process/decisions/ADR-0003-lending-and-simulated-date-everywhere.md`**.

### Simulated-date correctness (v1.0.0)
- **The simulation clock is now the single authoritative "now" for every money/business
  timestamp.** Every money/ops/business route threads `simulationNow(prisma)` — transfers,
  external movements, **operator approvals & reversals** (the reported clock-fired bill-pay
  approve-date bug), simulate-event, admin funding, onboarding submit/invite/accept/decline,
  disputes + fraud responses, and card lifecycle — and scheduled fires + interest accrual
  already date at the simulated time. **Auth/operational timestamps stay wall-clock by
  design** (session expiry, lockout, login history, the heartbeat/status `serverTime`) —
  they track real elapsed time. `toTransactionDTOs` gained a deterministic **`id`
  tiebreak** so same-simulated-instant entries order stably (cuid is timestamp-prefixed →
  newest-first within a shared instant). This **supersedes ADR-0002 decision #2** and is
  recorded in **ADR-0003**; a regression test reproduces the "City Power and Light approved
  on the simulated date, not the wall clock" scenario across a ~300-day advance.

### Branding & assets
- `assets/brand/` logo SVGs (horizontal/mark/mono-light) + README.
- `assets/prompts/IMAGE_GENERATION_PROMPTS.md` (5 marketing prompts).
- Per-app favicons; drop-in image folder `apps/customer/public/images/`.

### Process framework
- `docs/process/` fully populated (task board, experiment log, roadmap history,
  feedback log, agent handoffs, quality report, retrospective, milestone report,
  human review, next-session prompt, ADR-0001, feedback/ + blockers/ folders).
- `.claude/agents/` role definitions for the controlled multi-agent workflow.

## NOT built yet (by design — the deferred set; v1.0.0 is the final planned milestone)
- **Recurring / scheduled payments + the simulation clock + statement cycles are DONE in
  v0.9.0.** One-off money movement is done in v0.7.0; cards / fraud / disputes in v0.8.0;
  **loans / CDs / interest accrual are DONE in v1.0.0** (the rest of the broader "simulated
  time" theme — see the subsection above and `ROADMAP_HISTORY.md`).
- **Auto-advance of the clock by a "speed" multiplier** — still out of scope (the clock
  moves only on an explicit operator advance; the `speed` column is informational). A
  deferred future item, at the human's direction.
- **A dedicated `credit_card` account product** — v0.8.0 cards attach to existing
  checking/savings accounts (the `Card.cardType` distinguishes debit/credit) and v1.0.0's
  lending adds `cd`/`loan` accounts, but a real **credit-card account product** (with a
  revolving credit line) is still a deferred future item.
- **MFA / 2FA at login, password reset, remember-device, new-device alerts**
  (deferred within the auth theme). v0.6.0 uses the simulated-messaging seam for
  **onboarding** identity/MFA (the review's **Q-02**); customer-facing login-time
  2FA — which will create a `SimulatedEvent` OTP per the same seam — remains deferred.
- **The Vite/Vitest major upgrade** that would clear the remaining **dev-tooling** npm-audit
  advisories — deferred past the 1.0 tag rather than forcing a destabilizing bump (runtime
  audit is already 0; see "Known issues / watch items").
- **Frontend component unit tests now EXIST as a first/starter set** (v1.0.0 — the customer
  app joined the Vitest workspace: pure customer helpers + a `TransactionList` component
  test under jsdom + Testing Library). Coverage is intentionally a **starter**; broader
  component coverage (operations console, more customer screens) is still future work — the
  apps otherwise stay covered by build + Playwright journeys + backend/contract tests (see
  QUALITY_REPORT).

## Known issues / watch items
- **SEC-1 CSRF is now ENFORCED (v1.0.0)** — no longer the "SameSite=Lax + CORS-mitigated"
  accepted item it was across v0.2.0–v0.9.0. A global double-submit token (`mer_csrf`
  cookie + `x-meridian-csrf` header, session-presence gated, constant-time compare,
  login/logout/public-onboarding exempt) now backs every authenticated state-changing
  request; `SameSite=Lax` + CORS remain as defense in depth. See `auth/csrf.ts` + ADR-0003.
- **Dev-tooling npm audit advisories** (vite, vitest, esbuild) remain **dev-only**; runtime
  `npm audit --omit=dev` = **0**. **Accepted disposition with a documented upgrade path**
  (no non-breaking fix; the Vite/Vitest major upgrade is deferred past the 1.0 tag rather
  than forcing a destabilizing bump). Tracked in `docs/process/QUALITY_REPORT.md`.
- **Ledger/scheduler TOCTOU + bookkeeping (v0.7.0 F-2, v0.9.0 L-2/L-3)** — **accepted as
  benign residual risk** for a single-user local simulation: balances are DERIVED, SQLite
  serializes writers, and the worst case is a transient, auditable negative-available —
  **never a lost or created dollar**. Dispositioned in `QUALITY_REPORT.md` + ADR-0003.
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

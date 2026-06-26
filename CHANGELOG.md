# Changelog

All notable changes to this project are documented here. The format is loosely
based on [Keep a Changelog](https://keepachangelog.com/), and the project uses
milestone-based [Semantic Versioning](https://semver.org/) tags (`vX.Y.0`).

> Reminder: this is a **local banking simulation**, not a real bank.

## [Unreleased]

- Next milestone: **v0.7.0 — Money movement** (not started). Carries an explicit
  acceptance note from the v0.5.0 review: approving a deposit-review request must
  post the pending deposit (pending → posted) so the customer's line stops reading
  *Pending* and the available balance updates — within ledger discipline.

## [0.6.1] — 2026-06-26 — Operations console fixes

A focused **patch release** fixing the two Meridian Operations bugs from the
v0.6.0 review. No new product scope; **v0.7.0 was not started.** Changes are
confined to the operations app (+ the shared version string) — no backend, schema,
ledger, contract, auth, public-site, dashboard, or onboarding changes. Still a
local SIMULATION; money discipline untouched (balances stay derived).

### Fixed

- **Navigation disappears on a narrow window (B-03).** The operations console's
  left sidebar was shown only at the `lg` breakpoint and simply hidden below it,
  with no replacement — so on a narrow window there was no way to switch between
  Dashboard / Request queues / Simulated messaging. Added an accessible **top-bar
  menu (☰)** that opens the same navigation on narrow widths (auto-closing on
  navigation; `aria-expanded`/`aria-controls`); the desktop sidebar is unchanged.
  The nav links are now shared between both surfaces so they can't drift.
- **"Not authenticated" in Request queues; approvals unreachable (B-04).** The
  backend and the onboarding-approval path were verified correct end-to-end
  (submit → operator approve → provisioned user/account → new customer signs in).
  The defect was in the operations web app: it rendered the signed-in console from
  its own in-memory state and **never reconciled an API authentication failure**,
  so an invalid/expired/stale operator session left every `/api/ops/*` call
  returning "Not authenticated" with no way forward. The console now detects a
  **401** (`unauthenticated` / `session_expired`) on any ops call, **returns the
  operator to the sign-in screen** with a clear "your session has ended" notice,
  and **recovers on re-login** (the queue then loads and applications can be
  approved). A failed login (`invalid_credentials`) is unaffected.

### Tests

- **+2 Playwright e2e** (30 → **32**): an expired/rejected ops session returns the
  operator to sign-in (no dead "Not authenticated") and recovers on re-login; and
  the narrow-width menu toggle reveals navigation and switches sections.
- **189** Vitest unit/integration tests unchanged (no regression); `npm run verify`
  green.

## [0.6.0] — 2026-06-26 — Onboarding and account opening

A real, clearly-**simulated** account-opening flow that **feeds the v0.5.0
operations queue**, and the first time an operator **approval has real effects**:
approving an onboarding request provisions a `User` + `Account` + initial funding.
Money discipline holds — initial funding enters only via an explicit
**bank-originated** ledger event (audited; balances stay derived). Also folds in
two v0.5.0 review fixes (B-01, B-02). Still a local SIMULATION; no real money,
identity, or providers.

### Added

- **Open-account flow** (customer `/open-account`): a real simulated application
  (applicant details, product, simulated opening deposit, optional joint-owner
  invite, consent) → `POST /api/onboarding/applications` (public) → a confirmation
  with a reference. Submitting creates a **pending `onboarding` work item in the
  operations queue** (pushed live) and onboarding **simulated events**
  (application-received email, identity verification, MFA enrollment). It creates
  no user/account/money on its own.
- **Approval → provisioning:** approving an `onboarding` request creates the
  `User` + `Account` + owner grant and, for any opening deposit, posts a
  **bank-originated, posted `deposit`** ledger entry — atomically, audited,
  precondition-guarded (blocked + rolled back if the email already exists).
  Rejecting marks the application declined and creates nothing.
- **Joint-account invitations:** `POST /api/accounts/:id/invitations` (owner only),
  `GET /api/invitations`, `POST /api/invitations/:id/accept|decline`. Accepting
  creates a `joint` `AccountAccess` grant (the same grant RBAC reads); the invite
  is "delivered" only as a clearly-labelled simulated email. Customer UI: an
  invite form on account detail + an invitations inbox on the dashboard.
- **Admin-created demo users:** `POST /api/admin/users` (admin only) creates a
  user and optionally opens + funds an account; funding is an **audited
  bank-originated `adjustment` requiring a reason**. An admin-only **Create demo
  user** page in the operations console shows the non-secret demo credentials.
- **Add-note-anytime (B-02):** a non-decision **`note`** operator action records an
  audit note **without** changing status and is allowed **even on resolved
  requests** — surfaced as an always-available "Add note" button in the request
  detail panel. Reuses the v0.5.0 action service + route + real-time + audit.
- **Shared onboarding contract** (`@simbank/shared/onboarding`): products /
  statuses / invitation enums, funding bounds, the `OpenAccount` / invitation /
  admin-create DTOs, and PURE validators (`validateOpenAccount`,
  `validateInvitation`, `validateAdminCreateUser`) reused by client and server.

### Changed

- **Operations detail panel (B-01 fix):** the request detail panel now reads the
  **live** shared queue state, so its status badge + action buttons deactivate the
  moment a request is resolved — whether acted on from the queue card, the panel,
  or another operator over the socket; it reloads history when the live copy
  advances.
- **Prisma schema** (second additive migration, `onboarding`): new
  `OnboardingApplication` (1:1 with its `OperationsRequest`; holds the bcrypt
  password hash server-side, never in any DTO) + `AccountInvitation` models +
  relations. Money/auth tables unchanged; `npm run db:reset` rebuilds everything.
- **Seed** now backs an onboarding queue item with a real, **approvable**
  application (Taylor Prospect → Everyday Checking, $250 opening deposit) and a
  **pending** joint invitation (Avery → Jordan on savings), guarded by new
  onboarding-integrity invariants.
- **`note` added to the shared ops action vocabulary** without adding a fifth
  decision button; `nextStatusForAction('note')` is `null` and
  `canApplyAction(..., 'note')` is always true.
- Platform version bumped to **0.6.0**.

### Security / money discipline

- Initial funding (onboarding `deposit`) and admin funding (`adjustment`, reason
  required) are the only new ways money enters — both are posted, bank-originated,
  audited ledger entries; a test asserts the system-wide settled total moves by
  exactly the funded amount. Balances stay derived; submit/note/invite move no
  money. Applicant passwords are hashed immediately and never serialized.

## [0.5.0] — 2026-06-25 — Operations simulator core

The bank-side operations console comes alive: live request queues, audited
operator actions, real-time updates over WebSockets, and clearly-labelled
simulated external events. Money discipline is preserved — operator actions
change workflow state only and never post to the ledger (that arrives with money
movement in v0.7.0). Still a local SIMULATION; no real money, no real providers.

### Added

- **Live operations queues** in the console: real pending work items
  (`GET /api/ops/requests`) replacing the placeholders, with status + queue-lane
  filters and live status counts.
- **Operator actions** — approve / reject / hold / request-more-info — via a pure
  action **state machine**, each writing an `AuditLog` row (actor, note,
  from/to status); `request_info` auto-generates a linked simulated email.
- **Real-time updates** over Socket.IO: `ops:request_changed` and
  `ops:external_event` push to an operators-only room so connected consoles update
  without a refresh.
- **Simulated external events** (`SimulatedEvent`): an SMS / email / MFA / identity
  generator + a live feed, clearly labelled simulated — no real provider is ever
  contacted.
- **Request detail** with the operator-action history (from the audit trail), the
  linked simulated events, and an optional note recorded in the audit log.
- **Shared operations contract** (`@simbank/shared/operations`): action / priority
  / channel enums, the action state machine (`nextStatusForAction`,
  `isTerminalOpsStatus`, `canApplyAction`), request / detail / action-log / event
  DTOs, the API request/response DTOs, socket payload types, and label / queue /
  count helpers. Ops socket-event names + the operators room live in `constants.ts`.
- **Operator API** (RBAC: ops_agent / admin only): `/api/ops/requests` (+counts /
  filters), `/api/ops/requests/:id` (detail + history + events),
  `/api/ops/requests/:id/action`, `/api/ops/simulate/event`, `/api/ops/events`;
  `/api/ops/summary` extended with per-status counts (backward-compatible).

### Changed

- **Prisma schema** (first migration since v0.2.0, `operations_core`, additive):
  `OperationsRequest` fleshed out (priority, detail, subject, last-action
  bookkeeping, `resolvedAt`); new `SimulatedEvent` model. Money/auth tables
  unchanged.
- **Seed** now includes a dated 10-item operations queue + 4 simulated events
  (with intake audit rows), guarded by new ops-integrity invariants.
- **Socket.IO handshake** authenticates the operations session cookie and joins
  only staff roles to the operators room (customers/anonymous never join).
- **Operations console** dashboard reworked into a live overview; sidebar nav
  switched to real links (Dashboard / Request queues / Simulated messaging).
- Platform version bumped to **0.5.0**.

### Security

- Read-only security review: **PASS** (no Critical/High). Its one Medium — the
  socket-room access control lacked an automated test — was addressed this
  milestone with a real-client integration test
  (`apps/backend/src/realtime.test.ts`).

### Tests

- **145** Vitest unit/integration (was 93): the shared operations contract,
  backend ops routes (RBAC matrix, transitions, audit, realtime emissions,
  simulated events, money-discipline), seed invariants, and the socket-room RBAC.
- **25** Playwright e2e (was 22): the operator journey (live dashboard, action a
  queue item, simulated messaging).

## [0.4.0] — 2026-06-25 — Customer banking dashboard

A real customer banking dashboard over the (still fully simulated) data: an
accounts overview, per-account detail with transaction history (pending vs
posted) and search/filter, a statements placeholder, and realistic seeded
transaction history. Balances stay **DERIVED** from the append-only ledger.
Also folds in two v0.3.0-review UX fixes. No schema migration; no real money.

### Added

- **Accounts overview** (`/dashboard`, reworked): every account the user can see,
  with ledger-derived available + current balances, a combined total, and a link
  into each account; recent sign-in activity retained. Degrades on
  loading/empty/offline.
- **Account detail** (`/accounts/:id`, protected): account header with derived
  balances (available/current, pending out, on hold, pending in) and the full
  transaction history. Scoped server-side — a 403/404 shows a friendly
  "no access / not found" without leaking existence.
- **Transaction history** with clear **pending vs posted** grouping, a per-row
  **running settled balance**, category/status badges, and an instant
  **search** (description) + **filter** (status / category) built on a shared
  helper. **Statements & documents** placeholder (`/statements`, protected) —
  clearly "coming soon" (real statements in v0.9.0), no real PDFs.
- **Transaction API** (no schema change): `GET /api/accounts/:id/transactions`
  returns the account header + derived transactions (newest-first, signed
  amounts, running balance), scoped by the SAME access rules as the
  single-account read, with server-side `?q=&group=&origin=` search/filter.
- **Shared transaction contract** (`@simbank/shared/transactions`): `TransactionDTO`,
  `AccountTransactionsResponse`, `TransactionQuery`, and pure helpers
  (`toTransactionDTOs`, `filterTransactions`, `groupForStatus`, `originLabel`,
  `signedMinor`) — one definition reused by the API and the UI.
- **Realistic seeded transaction history**: ~3 months of dated activity on Avery's
  checking & savings (payroll direct deposits, rent, groceries, utilities,
  subscriptions, card spending, an ATM withdrawal, a fee, a refund, internal
  transfers both ways, monthly interest) plus current **pending** and **held**
  items — all bank-originated or balanced transfer legs (money never appears from
  nowhere). Seed grew from 7 → **56** ledger entries.

### Changed (v0.3.0 review follow-ups)

- **Scroll-to-top on navigation (R-01).** Every client-side navigation now lands at
  the top of the destination page — from any control (header, footer, in-page
  CTAs) — via a single router-level `ScrollToTop` effect. A `#hash` destination
  (e.g. the **"Security"** link → `/about#security`) scrolls that section into view
  instead, accounting for the sticky header.
- **Session-aware entry points (R-02).** When signed in, the public "Log in" /
  "Open an account" CTAs collapse to a single **"Visit your Dashboard"** (hero,
  footer, closing CTA band); visiting **`/login`** while authenticated shows an
  **"already signed in"** panel (a dashboard link + a log-out button) instead of
  the login form. Logged-out behavior is unchanged.

### Notes

- `npm run verify` passes (lint, typecheck, **93** unit/integration tests, build);
  **22** Playwright e2e green (up from 70 + 14). The simulation disclaimer remains
  visible site-wide; balances remain derived, never stored.
- **No Prisma schema migration** — a transaction *is* an append-only `LedgerEntry`,
  so v0.4.0 only extended the seed + added a read endpoint and UI.
- Security review: **PASS**, no new findings. The new endpoint reuses the v0.2.0
  access primitive (no IDOR; ops/admin get 403 on customer accounts); query params
  are whitelisted; no secrets. Pre-existing follow-ups (CSRF, config-driven cookie
  `secure`, helmet + rate-limit, dev-tooling audit advisories) remain tracked in
  `docs/process/QUALITY_REPORT.md`.

## [0.3.0] — 2026-06-25 — Public bank website and branding

A polished, multi-page public marketing site for Meridian — built on the existing
brand tokens and logo — plus a fix for the cross-app session-bleed bug reported in
the v0.2.0 review. Still a local simulation: no real money, accounts, or
integrations.

### Fixed

- **Cross-app session isolation (W-00).** The customer portal (`:5173`) and the
  operations console (`:5174`) share one backend origin, and browser cookies are
  not isolated by port, so a single shared session cookie let an operations login
  bleed into the customer portal — after logging out of the customer app,
  `/dashboard` showed the operator/admin instead of redirecting to the customer
  login. Each surface now gets its own session cookie (`mer_session` for the
  customer portal, `mer_ops_session` for the operations console), selected per
  request by Origin (also matched by the ops port for LAN hosts). The two sessions
  are now fully independent. No schema change; the cookie stays httpOnly and
  browser-managed.
- **Customer logout now actually revokes the session.** A second cause of the same
  report: the customer logout sent a `POST` with `Content-Type: application/json`
  but **no body**, so the backend rejected the empty JSON body with **400** and the
  logout handler never ran (the session was never revoked or cleared). The client
  no longer declares a JSON content-type on bodyless requests, and the backend now
  tolerates an empty JSON body (treats it as `{}`; malformed JSON still 400s).

### Added

- **Public marketing pages**: a rebuilt **home page** (hero, value props, product
  highlights, experience cards, security teaser, testimonial, CTA) plus
  **`/checking`**, **`/savings`**, **`/cards`** (coming soon), **`/borrow`** (loans
  & CDs, coming soon), **`/about`** (story, security `#security` anchor, roadmap),
  and an **`/open-account`** onboarding placeholder that routes to the working
  login (full onboarding lands in v0.6.0).
- **Reusable marketing component kit** (`components/marketing.tsx`): `Section`,
  `PageHero`, `SectionHeading`, `FeatureGrid`, `FAQ` (native `<details>`),
  `RateTable` (clearly labelled simulated figures), `CTASection`, inline icon set,
  and milestone tags — so every page stays visually consistent.
- **Responsive header** with the full product nav, a sticky bar, an accessible
  **mobile menu** (hamburger with `aria-expanded`/`aria-controls`), and a
  **skip-to-content** link; **footer** rebuilt with real links to every page.
- **Image system**: four new drop-in `ImagePlaceholder` slots (checking, savings,
  borrow, about) wired across the pages; `assets/prompts/IMAGE_GENERATION_PROMPTS.md`
  and the `public/images/` README extended to cover them (real files drop in with
  no code change).
- **Tests**: backend `session-isolation.test.ts` (4 tests) proving the per-surface
  cookie fix, plus a regression test that a bodyless-JSON logout still revokes, and
  Playwright `public-site.spec.ts` (5) + a browser-level `session-isolation.spec.ts`
  (1) that drives both apps in one shared cookie jar. Suite now **70** Vitest
  unit/integration + **14** Playwright e2e.

### Notes

- `npm run verify` passes (lint, typecheck, 70 tests, build). The simulation
  disclaimer remains visible site-wide (banner on every page + footer notice).
- No schema migration and no new runtime audit advisories; the prior dev-tooling
  advisories remain tracked in `docs/process/QUALITY_REPORT.md`.

## [0.2.0] — 2026-06-25 — Auth, roles, and demo users

Real authentication, sessions, and role-based access control over the (still
fully simulated) data. Customers and bank staff now sign in; what each role can
see is enforced server-side. No real money, accounts, or integrations.

### Added

- **Password hashing** with **bcryptjs** (a real, pure-JS hashing library — no
  custom crypto, no native build) plus a decoy-hash comparison to avoid
  user-enumeration timing leaks.
- **Server-side sessions**: an opaque cookie token whose **SHA-256 hash only** is
  stored (`Session` table), httpOnly + `SameSite=Lax` cookie, and a sliding idle
  timeout. Logout revokes the session.
- **Account lockout**: temporary lock after repeated failed logins (5 attempts →
  15-minute lock), with a fresh window after expiry.
- **Role-based access control**: a new `AccountAccess` table (owner/joint/…)
  scopes what each user sees. `GET /api/accounts` returns only accessible
  accounts; `GET /api/accounts/:id` returns 403/404 otherwise. `/api/ops/summary`
  is ops/admin-only; `/api/admin/users` is admin-only and never returns hashes.
- **Login history & audit**: every attempt is recorded in a new `LoginEvent`
  table (powering the customer's "recent sign-in activity"); notable events
  (login, logout, lockout) also write `AuditLog` rows.
- **Seeded demo users** for each role — customer (Avery), joint customer
  (Jordan, granted only the shared checking), operations agent (Sam), and admin
  (Riley) — with hashed, **non-secret** demo passwords documented in the README.
- **Auth API**: `POST /api/auth/login`, `POST /api/auth/logout`,
  `GET /api/auth/me`, `GET /api/auth/login-history`; `@fastify/cookie` wired in.
- **Customer app**: real login (per-error messaging, click-to-fill demo logins),
  a protected dashboard, session-aware nav, live accounts with server-derived
  balances + relationship badges, and a recent-sign-in-activity card.
- **Operations app**: a dark operator login that admits only `ops_agent`/`admin`
  (a customer login is signed back out), operator identity + role in the header,
  and a live operations-summary strip.
- **Tests**: grew from 20 → **65** Vitest unit/integration tests (pure lockout/
  token/password units; auth + RBAC integration via `app.inject` against an
  isolated test DB) and from 3 → **8** Playwright e2e tests (customer + operator
  login journeys, RBAC, protected-route redirect). New `auth_roles_sessions`
  Prisma migration.

### Notes

- `npm run verify` passes; 65 unit/integration + 8 e2e green. Demo passwords are
  intentionally non-secret (a simulation aid) and documented in `README.md`.
- No new runtime audit advisories from the auth work; the prior dev-tooling
  advisories remain tracked in `docs/process/QUALITY_REPORT.md`.

## [0.1.0] — 2026-06-25 — Project Foundation

First milestone: the durable project foundation, development setup, CI, and the
documentation/process framework. No real banking functionality yet — shells and
scaffolding only.

### Added

- **Monorepo** with npm workspaces: `packages/shared`, `apps/backend`,
  `apps/customer`, `apps/operations`; shared TypeScript config, ESLint 9 (flat) +
  Prettier, and root scripts (`dev`, `build`, `lint`, `typecheck`, `test`,
  `verify`, `clean`, `db:*`).
- **Shared package** (`@simbank/shared`): version/meta, brand tokens, constants,
  domain types, and the **disciplined money + ledger logic** (integer minor
  units; `deriveBalances`; conservation helpers) with unit tests.
- **Backend** (Fastify 5 + Socket.IO + Prisma/SQLite): `buildServer()`,
  `/health`, `/status`, `/api/meta`, root descriptor; real-time welcome +
  heartbeat; initial Prisma schema (`User`, `Account`, `LedgerEntry`,
  `SimulationClock`, `AuditLog`, `OperationsRequest`); initial migration;
  cross-platform DB-URL handling with no committed `.env`; seed/reset scripts
  with money-invariant checks.
- **Customer app** (React + Vite + Tailwind): marketing home, placeholder login,
  dashboard shell with **derived** balances, brand logo, simulation
  banner/footer, drop-in marketing-image placeholders, responsive layout.
- **Operations simulator app** (React + Vite + Tailwind): dark operator console
  with placeholder request queues, scenario controls, simulated external-response
  panels, and a clear "this simulates external/bank operations" notice.
- **Branding:** fictional bank **Meridian**; SVG logo variants
  (horizontal/mark/mono-light); design tokens; `IMAGE_GENERATION_PROMPTS.md`.
- **Tests:** 20 Vitest unit/integration tests + 3 Playwright smoke tests.
- **CI:** GitHub Actions (`verify` job + Playwright job) and `npm run verify`.
- **Docs/process framework:** `CLAUDE.md`, `VISION.md`, `PRODUCT_SPEC.md`,
  `TECHNICAL_ARCHITECTURE.md`, `ROADMAP.md`, `QUALITY_BAR.md`,
  `TEST_STRATEGY.md`, `docs/PROJECT_STATE.md`, `docs/NEXT_SESSION.md`, the full
  `docs/process/` set (experiment log, task board, roadmap history, human
  feedback log, agent handoffs, quality report, retrospective, milestone report,
  human review, next-session prompt, ADR-0001, feedback/blockers folders), and
  `.claude/agents/` subagent role definitions.

### Notes

- `npm run verify` passes. Runtime dependencies report 0 npm audit
  vulnerabilities; some dev/test tooling (vite, vitest, esbuild) has open
  advisories tracked in `docs/process/QUALITY_REPORT.md` for a later hardening
  pass.

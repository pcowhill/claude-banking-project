# Changelog

All notable changes to this project are documented here. The format is loosely
based on [Keep a Changelog](https://keepachangelog.com/), and the project uses
milestone-based [Semantic Versioning](https://semver.org/) tags (`vX.Y.0`).

> Reminder: this is a **local banking simulation**, not a real bank.

## [Unreleased]

- Next milestone: **v0.5.0 — Operations simulator core** (not started).

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

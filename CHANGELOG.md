# Changelog

All notable changes to this project are documented here. The format is loosely
based on [Keep a Changelog](https://keepachangelog.com/), and the project uses
milestone-based [Semantic Versioning](https://semver.org/) tags (`vX.Y.0`).

> Reminder: this is a **local banking simulation**, not a real bank.

## [Unreleased]

- Next milestone: **v0.3.0 — Public bank website and branding** (not started).

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

# Changelog

All notable changes to this project are documented here. The format is loosely
based on [Keep a Changelog](https://keepachangelog.com/), and the project uses
milestone-based [Semantic Versioning](https://semver.org/) tags (`vX.Y.0`).

> Reminder: this is a **local banking simulation**, not a real bank.

## [Unreleased]

- Next milestone: **v0.2.0 — Auth, roles, and demo users** (not started).

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

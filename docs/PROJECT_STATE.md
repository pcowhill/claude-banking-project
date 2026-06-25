# PROJECT_STATE

> Snapshot of where the project actually is right now. Read this second (after
> `CLAUDE.md`) at the start of every session. Keep it current at every
> milestone end.

## At a glance

- **Current version / tag:** `v0.1.0` — Project Foundation (complete).
- **Next milestone:** `v0.2.0` — Auth, roles, and demo users (not started).
- **Working branch (this session):** `claude/stoic-mayer-y1ik2y` (the Claude
  Code Cloud session branch, used as the milestone branch; intended milestone
  name `milestone/v0.1-foundation`).
- **Gate status:** `npm run verify` ✅ passes. 20 unit/integration tests + 3
  Playwright smoke tests green. Runtime deps: 0 npm audit vulnerabilities.
- **Runnable:** backend `:3000`, customer `:5173`, operations `:5174` via
  `npm run dev`.

## What exists today

### Monorepo & tooling
- npm workspaces, shared `tsconfig.base.json`, ESLint 9 flat config, Prettier.
- Root scripts: `dev`, `dev:*`, `build`, `lint`, `typecheck`, `test`,
  `test:e2e`, `verify`, `clean`, `db:generate|migrate|reset|seed`.
- CI: `.github/workflows/ci.yml` (verify job + Playwright job).

### packages/shared (`@simbank/shared`)
- `version.ts` (APP_VERSION 0.1.0, milestone meta, `IS_SIMULATION`), `brand.ts`
  (Meridian tokens), `constants.ts` (ports, socket events), `types.ts` (roles,
  account/ops enums-as-unions, API DTOs), `money.ts`, `ledger.ts`.
- **Money/ledger logic is the tested core** (see TEST_STRATEGY).

### apps/backend (Fastify 5 + Socket.IO + Prisma/SQLite)
- `buildServer()` (testable), `index.ts` runtime entry, `realtime.ts`
  (welcome + heartbeat), routes `/`, `/health`, `/status`, `/api/meta`.
- Prisma schema: `User`, `Account`, `LedgerEntry`, `SimulationClock`,
  `AuditLog`, `OperationsRequest`; one applied migration (`init`).
- Seed: `prisma/seed.ts` + pure `src/seed-plan.ts` (2 users, 2 accounts, 7
  ledger entries) with money-invariant guards. `npm run db:reset` works.

### apps/customer (React + Vite + Tailwind)
- Routes: `/` (marketing), `/login` (placeholder), `/dashboard` (shell with
  derived balances), `*` (404). Logo, simulation banner/footer, backend-status
  pill, drop-in `ImagePlaceholder`.

### apps/operations (React + Vite + Tailwind)
- Dark operator console: placeholder queues with approve/reject/hold/request-info
  buttons, scenario controls, simulated external-response panels, sidebar nav,
  status indicator, simulation banner.

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
- Real authentication, sessions, MFA, RBAC (v0.2.0).
- Real account/transaction data, money movement, cards, fraud, loans, CDs,
  simulated time (v0.4.0+).
- Live operations queues / WebSocket-driven workflows (v0.5.0+).
- Frontend component unit tests (deferred; see QUALITY_REPORT).

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

# PROJECT_STATE

> Snapshot of where the project actually is right now. Read this second (after
> `CLAUDE.md`) at the start of every session. Keep it current at every
> milestone end.

## At a glance

- **Current version / tag:** `v0.2.0` — Auth, roles, and demo users (complete).
  The annotated tag `v0.2.0` was created locally on the milestone commit; pushing
  tags is blocked by this environment's git policy (HTTP 403), so the tag must be
  (re)created/pushed by the human on merge to `main` — see the milestone report
  for the exact command.
- **Next milestone:** `v0.3.0` — Public bank website and branding (not started).
- **Working branch (this session):** `claude/gifted-hawking-x44wtg` (the Claude
  Code Cloud session branch, used as the milestone branch; intended milestone
  name `milestone/v0.2-auth`).
- **Gate status:** `npm run verify` ✅ passes. **65** unit/integration tests + **8**
  Playwright e2e tests green. Runtime deps: no new audit advisories from auth.
- **Runnable:** backend `:3000`, customer `:5173`, operations `:5174` via
  `npm run dev`. Sign in with the seeded demo accounts (see `README.md`).

## What exists today

### Monorepo & tooling
- npm workspaces, shared `tsconfig.base.json`, ESLint 9 flat config, Prettier.
- Root scripts: `dev`, `dev:*`, `build`, `lint`, `typecheck`, `test`,
  `test:e2e`, `verify`, `clean`, `db:generate|migrate|reset|seed`.
- CI: `.github/workflows/ci.yml` (verify job + Playwright job).

### packages/shared (`@simbank/shared`)
- `version.ts` (APP_VERSION 0.2.0, milestone meta, `IS_SIMULATION`), `brand.ts`
  (Meridian tokens), `constants.ts` (ports, socket events), `types.ts` (roles,
  account/ops enums-as-unions, API DTOs), `money.ts`, `ledger.ts`, and
  **`auth.ts`** (v0.2.0: `AUTH` policy constants, `ACCOUNT_RELATIONSHIPS`,
  `LOGIN_REASONS`, and auth DTOs — `SessionUser`, `AccountSummary`, etc.).
- **Money/ledger logic is the tested core** (see TEST_STRATEGY).

### apps/backend (Fastify 5 + Socket.IO + Prisma/SQLite)
- `buildServer()` (testable; now also registers `@fastify/cookie`), `index.ts`
  runtime entry, `realtime.ts`, routes `/`, `/health`, `/status`, `/api/meta`.
- **Auth (v0.2.0)** under `src/auth/`: `password.ts` (bcryptjs), `tokens.ts`
  (crypto token + SHA-256), `lockout.ts` (pure), `sessions.ts`, `access.ts`
  (RBAC), `guards.ts` (`requireAuth`/`requireRole`), `cookies.ts`, `audit.ts`.
  Routes: `/api/auth/{login,logout,me,login-history}`, `/api/accounts`,
  `/api/accounts/:id`, `/api/ops/summary`, `/api/admin/users`.
- Prisma schema: `User` (now with password hash, status, lockout fields) +
  `Account`, `LedgerEntry`, `SimulationClock`, `AuditLog`, `OperationsRequest`,
  and **new** `Session`, `AccountAccess`, `LoginEvent`; two migrations (`init`,
  `auth_roles_sessions`).
- Seed: `prisma/seed.ts` → shared `src/seed-apply.ts` + pure `src/seed-plan.ts`
  (4 demo users across roles, hashed passwords, owner+joint access grants, 7
  ledger entries) with money + access invariant guards. `npm run db:reset` works.

### apps/customer (React + Vite + Tailwind)
- Routes: `/` (marketing), `/login` (**real** sign-in), `/dashboard`
  (**protected**; live accounts + recent sign-in activity), `*` (404). Auth
  context/provider, session-aware nav, logo, simulation banner/footer,
  backend-status pill, drop-in `ImagePlaceholder`.

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
- **MFA, password reset, remember-device, new-device alerts** (deferred within
  the auth theme; planned for v0.5.0+ alongside the operations queues that
  service them).
- Public marketing site polish + product pages (v0.3.0 — next).
- Real account/transaction data, money movement, cards, fraud, loans, CDs,
  simulated time (v0.4.0+).
- Live operations queues / WebSocket-driven workflows (v0.5.0+).
- Frontend component unit tests (still deferred; auth UIs are covered by build +
  Playwright login journeys for now — see QUALITY_REPORT).

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

# TEST_STRATEGY

## Goals

Fast, deterministic feedback that protects the things that matter most — above
all, the **money model**. Tests should fail loudly for real problems and never
be weakened just to go green.

## Test layers

### 1. Unit tests (Vitest, node env)

The base of the pyramid. Pure logic in `packages/shared` and the backend seed
plan:

- `packages/shared/src/money.test.ts` — minor-unit conversion, validation,
  summing, currency formatting.
- `packages/shared/src/ledger.test.ts` — `deriveBalances` for posted/pending/
  held/failed/reversed entries, and the **conservation invariant** (an internal
  transfer keeps the system-wide settled total unchanged).
- `apps/backend/src/seed-plan.test.ts` — seed amounts are positive integers,
  reference real accounts, transfers net to zero, every settled credit is
  bank-originated or a transfer leg, and a **tampered plan that conjures money
  is rejected**.

### 2. Integration tests (Vitest, Fastify inject)

- `apps/backend/src/server.test.ts` — builds the server with `buildServer()` and
  drives it via `app.inject()` (no open ports). Covers `/health`, `/status`
  (version + simulation flag, DB-tolerant), `/api/meta` (disclaimer), and `/`.

### 3. End-to-end / smoke (Playwright, Chromium)

- `e2e/smoke.spec.ts` — starts the full local stack (backend + both apps) and
  asserts each app loads, shows its simulation disclaimer, and renders core
  shell content (e.g. derived dashboard balances; operations overview).

### 4. Deployment pipeline (Vitest project `deploy`, `scripts/deploy/test/`)

- Drive the real deployment scripts against temporary directories — a fake `ssh`
  on `PATH` (real rsync over it), a fake service helper that records whether the
  server lock was held, a fake public verifier, a local HTTP/HTTPS stand-in for
  Caddy. Release validation, publication/reruns, rollback target, locked
  compare-and-swap switch, reset-after-unlock, rollback paths, stale runs,
  pruning, SSH config (`ssh -G`), archive integrity, and the workflows' gates and
  secret exposure (YAML evaluated). **Never** contact a server. Need bash,
  util-linux `flock`, rsync and OpenSSH: skipped where missing, required in CI
  (`REQUIRE_DEPLOY_TESTS=1`).
- The packaged release itself is built and smoke-tested (packaged backend +
  packaged `node_modules`) by the `package-release` CI job on every PR and `main`
  push, and locally by `npm run release:dry-run`.

## What runs where

| Command | Layers | In `verify`? | In CI? |
| --- | --- | --- | --- |
| `npm run test` | unit + integration | ✅ | ✅ (verify job) |
| `npm run build` | compile-time safety net | ✅ | ✅ |
| `npm run test:e2e` | smoke | ❌ (kept fast) | ✅ (separate job) |
| `npm run lint:deploy` | shellcheck of `scripts/deploy` | ❌ | ✅ (verify job) |
| `npm run release:dry-run` | build + packaged smoke test + archive round-trip | ❌ | ✅ (`package-release` job) |

`verify` deliberately excludes Playwright so it stays fast and dependency-light
(no browser download needed to run the gate). CI runs Playwright in its own job
and uploads the report on failure.

## Conventions

- Co-locate unit/integration tests with the code (`*.test.ts`).
- Prefer testing pure functions; extract logic out of side-effectful code so it
  can be unit-tested (e.g. the seed *plan* is separate from the DB *write*).
- Backend tests use `app.inject()`, never a real port.
- Deterministic data; no network, no clocks-by-surprise. (Time-dependent
  simulation features in v0.9.0 will inject a controllable clock.)

## Roadmap for testing

- **v0.2.0:** Playwright login tests; auth/RBAC unit + integration tests
  (ownership checks).
- **v0.4.0+:** seeded transaction data assertions; richer API integration tests.
- **Frontend component tests** (jsdom + Testing Library) are deferred from
  v0.1.0 to keep the gate lean; introduce when interactive components carry real
  logic. Tracked in `docs/process/QUALITY_REPORT.md`.
- **v1.0.0:** coverage expansion, performance checks, and a security review
  (including the outstanding dev-tooling audit advisories).

## Coverage philosophy

Coverage is a guide, not a target. Prioritize meaningful assertions on money,
permissions (from v0.2.0), and critical user journeys over raw percentages.

# QUALITY_REPORT

Quality status per milestone: checks, test results, dependency audit, and known
issues. Updated at every milestone (and whenever status materially changes).

---

## v0.1.0 — Project Foundation — 2026-06-25

### Gate: `npm run verify` ✅ PASS
- **Lint** (ESLint 9 flat) — pass, 0 errors.
- **Typecheck** (`tsc -p` × 4 workspaces) — pass.
- **Unit/integration tests** (Vitest) — **20 passed / 20**:
  - `@simbank/shared`: `money.test.ts` (4), `ledger.test.ts` (6).
  - `@simbank/backend`: `server.test.ts` (4), `seed-plan.test.ts` (6).
- **Build** — backend (tsup) + customer (vite) + operations (vite) all build.

### E2E smoke (Playwright) ✅ PASS
- **3 passed / 3**: customer home (with disclaimer), customer dashboard (derived
  balances), operations console (states it simulates bank operations).
- Not part of `verify` (kept fast); runs in CI as a separate job.

### Database
- `npm run db:reset` works (migrate `init` + seed). Seed writes 2 users, 2
  accounts, 7 ledger entries and self-checks the money invariants.

### Dependency audit

- **Runtime / production dependencies: `npm audit --omit=dev` → 0
  vulnerabilities.** (Fastify upgraded 4 → 5.8.5 to clear the
  Fastify→`fast-uri` chain cleanly.)
- **Dev/test tooling: 5 advisories (1 critical, 1 high, 3 moderate)** — all in
  build/test tools that do **not** ship in any production artifact:

  | Severity | Package | Nature | Disposition |
  | --- | --- | --- | --- |
  | Critical | `vitest` | test-runner API exposure (browser/mocker) | Defer — needs vitest 3 (major). Test-only, local. |
  | High | `vite` | dev-server path traversal in optimized-deps `.map` | Defer — needs vite 6/7 (major). Dev-server only. |
  | Moderate | `@vitest/mocker` | transitive via vitest | Resolves with vitest 3. |
  | Moderate | `vite-node` | transitive via vitest | Resolves with vitest 3. |
  | Moderate | `esbuild` | dev-server request advisory | Resolves with the vite upgrade. |

  **Risk assessment:** Low for this project. These affect the local dev server
  and test runner only, on a developer machine, for a local simulation not
  exposed to untrusted networks. They are **not** in the customer-facing build or
  the backend runtime.

  **Remediation plan:** upgrade Vite (→ 6/7) and Vitest (→ 3) in a dedicated
  dependency/hardening pass (tracked for the v1.0.0 security review, or sooner if
  the human prioritizes it). Deliberately deferred from v0.1.0 to avoid
  destabilizing the foundation with major toolchain bumps. Re-check with
  `npm audit` after upgrading.

### Known limitations / deferred
- **Frontend component unit tests** (jsdom + Testing Library) are deferred; apps
  are covered by build + Playwright smoke for now. Introduce when interactive
  components carry real logic (≈ v0.2.0 login, v0.4.0 dashboard).
- Real auth, RBAC, live data, and operations workflows are intentionally absent
  (future milestones).

### Sandbox-only notes (do not affect users/CI)
- Prisma engine download required a local mirror in the Claude Code Cloud
  sandbox; standard installs work elsewhere.
- Playwright used the pre-installed Chromium via the opt-in
  `PLAYWRIGHT_CHROMIUM_PATH` hook; CI/local use `npx playwright install`.

### Overall
**v0.1.0 meets the quality bar.** Gate green, app runnable, runtime audit clean,
open items documented honestly with a remediation plan. No blockers.

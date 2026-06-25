# QUALITY_REPORT

Quality status per milestone: checks, test results, dependency audit, and known
issues. Updated at every milestone (and whenever status materially changes).

---

## v0.2.0 — Auth, roles, and demo users — 2026-06-25

### Gate: `npm run verify` ✅ PASS
- **Lint** (ESLint 9 flat) — pass, 0 errors.
- **Typecheck** (`tsc -p` × 4 workspaces) — pass.
- **Unit/integration tests** (Vitest) — **65 passed / 65**:
  - `@simbank/shared`: `money.test.ts` (4), `ledger.test.ts` (6).
  - `@simbank/backend`: `server.test.ts` (4), `seed-plan.test.ts` (12),
    `auth/lockout.test.ts` (5), `auth/tokens.test.ts` (4),
    `auth/password.test.ts` (5), `routes/auth.test.ts` (14),
    `routes/rbac.test.ts` (11).
- **Build** — backend (tsup) + customer (vite) + operations (vite) all build.

### E2E (Playwright) ✅ PASS
- **8 passed / 8**: customer marketing home + disclaimer, protected-dashboard
  redirect, operator login surface (smoke); plus customer login → own accounts →
  logout, invalid-credentials error, joint-user RBAC scoping, operator console
  login, and customer-rejected-from-ops (auth journeys).
- Backend integration tests run single-fork against an isolated `prisma db push`
  SQLite test DB (never the dev DB; no cross-file races).

### Database
- `npm run db:reset` works (migrations `init` + `auth_roles_sessions` + seed).
  Seed writes 4 users, 2 accounts, 7 ledger entries, 3 access grants and
  self-checks the money + access invariants.

### Security review (pre-gate, read-only) — ✅ No blockers
A Security/Permissions audit confirmed password handling, session security,
RBAC/ownership (no IDOR), the login flow (lockout, no user enumeration), and
data-exposure controls are all sound and test-backed. Three **Low** hardening
items were raised and are accepted as **tracked follow-ups** (none block v0.2.0):

| ID | Item | Why deferred | Target |
| --- | --- | --- | --- |
| SEC-1 | Add a CSRF token (or `SameSite=Strict` session cookie) | `SameSite=Lax` + CORS allowlist adequately mitigate CSRF while all endpoints are reads/auth on localhost; revisit before real state-mutating endpoints | v0.7.0 (money movement) |
| SEC-2 | Derive cookie `secure` flag from config/HTTPS instead of literal `false` | Correct for local HTTP; no deployment exists | v1.0.0 hardening |
| SEC-3 | Add `@fastify/helmet` + IP-based rate limit on `/api/auth/login` | Per-account lockout already limits single-account stuffing; local sim | v1.0.0 hardening |

### Dependency audit
- **No new runtime advisories** introduced by the auth work (`bcryptjs` +
  `@fastify/cookie`, both clean). The prior **dev/test-tooling advisories**
  (vite, vitest, esbuild — dev-only, not shipped) are unchanged and remain
  tracked in the v0.1.0 section below, for the v1.0.0 hardening pass.

### Known limitations / deferred
- **Frontend component unit tests** remain deferred; the auth UIs are covered by
  build + the Playwright login journeys. Revisit at v0.4.0 (dashboard logic).
- **MFA, password reset, device trust** are deferred within the auth theme to
  later milestones (they pair with the operations queues in v0.5.0+).

### Sandbox-only notes (do not affect users/CI)
- Same as v0.1.0: Prisma engine local mirror and the opt-in
  `PLAYWRIGHT_CHROMIUM_PATH` hook were used in the cloud sandbox; standard
  installs / `npx playwright install` work elsewhere.

### Overall
**v0.2.0 meets the quality bar.** Gate green (65 + 8 tests), apps runnable with
real auth, security review clean (no blockers), open items tracked honestly. No
blockers.

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

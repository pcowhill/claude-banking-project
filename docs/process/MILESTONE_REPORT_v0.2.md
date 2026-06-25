# MILESTONE REPORT — v0.2.0 (Auth, roles, and demo users)

- **Date:** 2026-06-25
- **Status:** ✅ Complete (gate green; tagged `v0.2.0`)
- **Branch:** `claude/gifted-hawking-x44wtg` (session/milestone branch; intended
  name `milestone/v0.2-auth`)
- **Session:** 2 of the experiment (controlled multi-agent)

## Objective

Add real authentication and access control over the (still fully simulated)
data: customer + operations/admin login, real password hashing, sessions +
lockout, seeded demo users per role, role-based access control, login
history/audit, and initial Playwright login tests. Complete **only** v0.2.0.

## Delivered

| Area | Delivered |
| --- | --- |
| Shared | `auth.ts`: `AUTH` policy constants, `ACCOUNT_RELATIONSHIPS`, `LOGIN_REASONS`, and auth DTOs |
| Schema | `User` auth fields + new `Session`, `AccountAccess`, `LoginEvent` models; `auth_roles_sessions` migration |
| Hashing | bcryptjs (real, pure-JS, no native build); decoy hash to defeat user-enumeration timing |
| Sessions | Opaque cookie token, **SHA-256 hash stored**, httpOnly + `SameSite=Lax`, sliding idle timeout, logout revokes |
| Lockout | 5 failed attempts → 15-min lock; fresh window after expiry; not bypassable |
| RBAC | `AccountAccess`-backed ownership; `/api/accounts(/:id)` scoped (403/404); ops/admin role-gated endpoints |
| History/audit | `LoginEvent` per attempt + `AuditLog` on login/logout/lockout |
| Demo users | Avery (customer), Jordan (joint→checking only), Sam (ops), Riley (admin); hashed non-secret passwords |
| Customer UI | Real login, protected dashboard, session-aware nav, live accounts + sign-in activity |
| Operations UI | Staff-only operator login (customer rejected), operator identity + role, live ops summary |
| Tests | 20 → **65** unit/integration; 3 → **8** Playwright e2e |

## Acceptance criteria check

| Criterion (from ROADMAP / NEXT_SESSION) | Status |
| --- | --- |
| Customer login | ✅ |
| Operations/admin login | ✅ (staff-only; customer rejected) |
| Real password hashing (no custom crypto) | ✅ bcryptjs |
| Sessions | ✅ cookie sessions, opaque token, hash-at-rest, idle timeout |
| Account lockout | ✅ 5 fails → 15-min lock (configurable in `AUTH`) |
| Seeded demo users per role | ✅ 4 roles; documented non-secret credentials |
| Role-based access control (own accounts; joint = authorized only) | ✅ enforced + tested (incl. IDOR 403/404) |
| Login history / audit logs | ✅ `LoginEvent` + `AuditLog` |
| Initial Playwright login tests | ✅ 5 auth e2e (+3 smoke) |
| `npm run verify` passes | ✅ |
| Security review before gate | ✅ no blockers (3 Low follow-ups tracked) |
| Docs updated; annotated tag `v0.2.0` | ✅ (tag push blocked by env policy — see below) |
| Stop after v0.2.0; do not start v0.3.0 | ✅ |

## Verification evidence

- `npm run verify` → lint ✓, typecheck ✓ (4 workspaces), test ✓ (**65/65**),
  build ✓ (3 apps).
- `npm run test:e2e` → **8/8** passed (Chromium).
- `npm run db:reset` → migrations `init` + `auth_roles_sessions` + seed (4 users,
  2 accounts, 7 entries, 3 access grants).
- Manual cookie/CORS check: `POST /api/auth/login` from `Origin: :5173` returns
  the user, sets `mer_session` (HttpOnly; SameSite=Lax), and `GET /api/accounts`
  with the cookie returns only the caller's accounts with server-derived balances.

## Notable decisions

- **bcryptjs over native bcrypt/argon2** — a real, standard hashing library with
  no native toolchain, matching the project's cross-platform, zero-friction goal.
  Argon2 noted as a future option.
- **Opaque cookie sessions with hash-at-rest** — random token in the cookie,
  SHA-256 hash in the DB; standard-library crypto only (no custom cryptography).
- **`AccountAccess` table as the single RBAC source of truth** — owners get an
  `owner` grant; joint users get scoped grants; the ownership tests rest on real
  seeded data (Jordan ⊂ Avery's checking only).
- **`LoginEvent` (history) + `AuditLog` (notable events)** — complementary
  trails, consistent with how admin actions are audited elsewhere.
- **Isolated single-fork test DB** for backend integration tests so they never
  touch the dev DB and never race on the shared SQLite file.

## Controlled multi-agent execution

- Backend auth (risky shared area) was implemented **serially** by the
  orchestrator and locked + verified before any UI work.
- The two **independent** frontend apps were built **in parallel** by the
  Frontend Customer and Frontend Operations subagents against a written API
  contract, then reviewed.
- A read-only **Security/Permissions** subagent audited the result pre-gate.
- Testing/QA (Playwright journeys) and Process Scribe (these docs) closed it out.

## Git: branch, tag, and merge (manual steps for the human)

Built and pushed on the Claude Code Cloud session branch
`claude/gifted-hawking-x44wtg` (intended name `milestone/v0.2-auth`). No PR opened
(none requested). The annotated tag `v0.2.0` was created locally on the milestone
commit, but **pushing tags is blocked by this environment's git egress policy
(HTTP 403)** — only the session branch is pushable here. To adopt the milestone,
after reviewing the branch run locally:

```bash
git fetch origin
git checkout main
git merge --no-ff origin/claude/gifted-hawking-x44wtg   # or merge the reviewed PR
git tag -a v0.2.0 -m "v0.2.0 — Auth, roles, and demo users"
git push origin main
git push origin v0.2.0
```

## Deviations / honest caveats

- **Tag push** blocked by environment policy (above) — local tag exists; human
  pushes it on merge.
- **Security follow-ups (Low):** CSRF token before real mutation endpoints
  (SEC-1, ~v0.7.0), config-driven cookie `secure` flag (SEC-2), and
  helmet + login rate-limit (SEC-3) are tracked in `QUALITY_REPORT.md`. None
  block v0.2.0 (SameSite=Lax + CORS allowlist + per-account lockout cover the
  local simulation).
- **Sandbox-only setup:** same Prisma engine mirror and Playwright
  executable-path hook as v0.1.0; neither affects normal machines or CI.
- **Deferred within the auth theme:** MFA, password reset, device trust — moved
  to later milestones (they pair with v0.5.0+ operations queues).

## Blockers

None.

## Handoff

- Review guide: `docs/process/HUMAN_REVIEW_v0.2.md`.
- Next-session prompt: `docs/process/NEXT_SESSION_PROMPT_v0.2.md`.
- Next milestone: **v0.3.0 — Public bank website and branding** (not started).

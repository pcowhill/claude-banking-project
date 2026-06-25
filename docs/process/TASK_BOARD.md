# TASK_BOARD

**This file is the source of truth for tasks.** GitHub Issues, if present, are a
convenient mirror only — when they conflict with this file, trust this file.

**GitHub Issues mirror (optional):** `#1` — Milestone v0.1.0 (closed/Done) ·
`#2` — Milestone v0.2.0 (open/next). Task-level issues for v0.2.0 (A-01…A-10)
may be created when that milestone becomes active.

**Statuses:** Backlog · Ready · In Progress · In Review · Blocked · Done ·
Deferred/Removed

Each task: ID · milestone · title · agent role · acceptance criteria ·
dependencies · status · result/outcome · related commit/tag.

---

## Milestone v0.1.0 — Project Foundation  ✅ Done (tag `v0.1.0`)

| ID | Title | Role | Acceptance criteria | Deps | Status | Result |
| --- | --- | --- | --- | --- | --- | --- |
| F-01 | Monorepo + tooling | Backend/Planner | npm workspaces, TS base config, ESLint/Prettier, root scripts, `.gitignore`, `.env.example` | — | Done | Workspaces `packages/*`,`apps/*`; flat ESLint; `verify` script |
| F-02 | Shared package + money/ledger | Backend | `@simbank/shared` builds & is imported by all; derived-balance logic; unit tests | F-01 | Done | `money.ts`,`ledger.ts`,`types.ts`,`brand.ts`; 10 shared tests |
| F-03 | Backend shell | Backend/API | Fastify `/health`,`/status`,`/api/meta`; Socket.IO; CORS; testable `buildServer()` | F-01,F-02 | Done | Fastify 5 + Socket.IO; inject tests |
| F-04 | Database foundation | Backend/API | Prisma + SQLite schema; migration; seed/reset; cross-platform DB path | F-03 | Done | 6 models; `init` migration; `db:reset` works |
| F-05 | Customer app shell | Frontend Customer | React+Vite+Tailwind; routes (home/login/dashboard/404); brand; disclaimer; responsive | F-01,F-02 | Done | Marketing home, login, dashboard with derived balances |
| F-06 | Operations app shell | Frontend Operations | React+Vite+Tailwind; ops dashboard; queues/controls placeholders; "simulates operations" note | F-01,F-02 | Done | Dark console with queues, scenario controls, sim responses |
| F-07 | Branding & assets | Frontend Customer | Bank name; 3 SVG logo variants; design tokens; image prompt file | F-02 | Done | Meridian; `assets/brand/*`; `IMAGE_GENERATION_PROMPTS.md` |
| F-08 | Tests | Testing/QA | Backend health test; ≥1 unit test; app smoke tests | F-03,F-05,F-06 | Done | 20 unit/integration + 3 Playwright smoke |
| F-09 | CI + verify | Testing/QA | GitHub Actions on PR/push to main; `npm run verify` | F-08 | Done | `ci.yml` (verify + e2e jobs); `verify` green |
| F-10 | Docs/process framework | Process Scribe | All required docs/process files; handoff model | F-01..F-09 | Done | Full `docs/` + `docs/process/` + `.claude/agents/` |
| F-11 | Security/safety pass | Security Reviewer | No secrets; disclaimers; ledger discipline; runtime audit reviewed | F-02..F-06 | Done | Runtime audit 0; dev-tool advisories logged in QUALITY_REPORT |
| F-12 | Milestone handoff | Process Scribe | Milestone report, human review, next-session prompt, state/next updated, tag | F-10 | Done | This board + reports; tag `v0.1.0` |

## Milestone v0.2.0 — Auth, roles, and demo users  ▶️ In Progress

> Approved to start by the human (see `feedback/FEEDBACK_v0.1_2026-06-25_0146.md`).
> No re-scope; building the planned auth milestone. Backend auth is a risky shared
> area (schema + auth + routing), so it is implemented serially and reviewed; the
> two independent frontend apps are parallelized once the API contract is locked.

| ID | Title | Role | Acceptance criteria | Deps | Status |
| --- | --- | --- | --- | --- | --- |
| A-01 | Auth data model | Backend/API | Password hash fields/tables, sessions, account-access, login-history; migration | v0.1.0 | In Progress |
| A-02 | Password hashing | Backend/API | Real lib (bcryptjs — pure-JS, cross-platform, no native build); no custom crypto; tested | A-01 | In Progress |
| A-03 | Sessions + lockout | Backend/API | Cookie sessions (opaque token, stored hashed), idle timeout, lockout after N fails | A-01 | In Progress |
| A-04 | RBAC | Backend + Security | Customers see only own accounts; joint only authorized; ops/admin scoped; ownership checks tested | A-01 | In Progress |
| A-05 | Seeded demo users | Backend | One user per role (customer, joint, ops, admin); documented non-secret demo credentials | A-01 | In Progress |
| A-06 | Login history/audit | Backend/API | `LoginEvent` history rows on every attempt + `AuditLog` rows on notable auth events | A-01 | In Progress |
| A-07 | Customer login UI | Frontend Customer | Real login/logout, session-aware nav, protected routes, error states, live accounts | A-02,A-03 | Ready |
| A-08 | Ops/admin login UI | Frontend Operations | Operator/admin login; role-gated console; non-ops users rejected | A-02,A-03 | Ready |
| A-09 | Auth tests | Testing/QA | Playwright login tests + auth unit/integration (incl. RBAC ownership) | A-02..A-08 | Ready |
| A-10 | Milestone handoff | Process Scribe | Update all handoff docs; tag `v0.2.0` | A-01..A-09 | Backlog |

> Later milestones (v0.3.0–v1.0.0) are summarized in `ROADMAP.md` and will be
> decomposed into tasks here when they become the active milestone.

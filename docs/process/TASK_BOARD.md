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

## Milestone v0.2.0 — Auth, roles, and demo users  ✅ Done (tag `v0.2.0`)

> Approved to start by the human (see `feedback/FEEDBACK_v0.1_2026-06-25_0146.md`).
> No re-scope. Backend auth (risky shared area: schema + auth + routing) was built
> serially and reviewed; the two independent frontend apps were parallelized once
> the API contract was locked; a security review ran before the gate.

| ID | Title | Role | Acceptance criteria | Deps | Status | Result |
| --- | --- | --- | --- | --- | --- | --- |
| A-01 | Auth data model | Backend/API | Password hash fields/tables, sessions, account-access, login-history; migration | v0.1.0 | Done | `User` auth fields + `Session`/`AccountAccess`/`LoginEvent`; `auth_roles_sessions` migration |
| A-02 | Password hashing | Backend/API | Real lib; no custom crypto; tested | A-01 | Done | bcryptjs hash/verify + decoy hash; `password.test.ts` |
| A-03 | Sessions + lockout | Backend/API | Cookie sessions (opaque token, stored hashed), idle timeout, lockout after N fails | A-01 | Done | SHA-256-hashed token, sliding timeout, 5-fail/15-min lock; `lockout.test.ts`, `tokens.test.ts`, `auth.test.ts` |
| A-04 | RBAC | Backend + Security | Customers see only own accounts; joint only authorized; ops/admin scoped; ownership checks tested | A-01 | Done | `AccountAccess` + `access.ts`; `accounts`/`ops` routes; `rbac.test.ts` (incl. IDOR 403/404) |
| A-05 | Seeded demo users | Backend | One user per role; documented non-secret demo credentials | A-01 | Done | Avery/Jordan/Sam/Riley; hashed pw; owner+joint grants; documented in README |
| A-06 | Login history/audit | Backend/API | History rows on attempts + audit rows on notable events | A-01 | Done | `LoginEvent` per attempt + `AuditLog` on login/logout/lockout |
| A-07 | Customer login UI | Frontend Customer | Real login/logout, session-aware nav, protected routes, error states, live accounts | A-02,A-03 | Done | Auth context, `RequireAuth`, live accounts + sign-in activity |
| A-08 | Ops/admin login UI | Frontend Operations | Operator/admin login; role-gated console; non-ops users rejected | A-02,A-03 | Done | Staff-only gate, operator identity, ops-summary strip |
| A-09 | Auth tests | Testing/QA | Playwright login tests + auth unit/integration (incl. RBAC ownership) | A-02..A-08 | Done | 65 unit/integration + 8 e2e (login journeys + RBAC + redirect) |
| A-10 | Milestone handoff | Process Scribe | Update all handoff docs; tag `v0.2.0` | A-01..A-09 | Done | This board + reports; annotated tag `v0.2.0` |

## Milestone v0.3.0 — Public bank website and branding  ✅ Done (tag `v0.3.0`)

> Approved to start by the human (see `feedback/FEEDBACK_v0.2_2026-06-25_0306.md`).
> The v0.2.0 review also reported a **cross-app session-bleed bug**; we agreed it is
> real and folded the fix into this milestone as `W-00` (done first). `W-00` touches
> auth + routing — a **risky shared area** — so it is serialized, tested, and
> reviewed before any of the parallelizable website work. `W-01` (IA + shared
> layout) gates the page work; once it lands, `W-02…W-06` are largely independent
> and may be parallelized across customer-frontend agents.

| ID | Title | Role | Acceptance criteria | Deps | Status | Result |
| --- | --- | --- | --- | --- | --- | --- |
| W-00 | Cross-app session isolation (bug fix) | Backend/API + Security | Customer portal (`:5173`) and Ops console (`:5174`) hold **independent** sessions: per-surface session cookies (`mer_session` / `mer_ops_session`) chosen by request `Origin`; a customer logout (or no customer login) makes `/dashboard` redirect to the customer login regardless of any Ops session; Ops session unaffected by customer login/logout and vice-versa; integration + e2e tests prove isolation; no schema change | v0.2.0 | Done | **Two root causes found & fixed:** (1) shared host-only cookie → per-surface audience cookies (`sessionCookieName(audience)` + `sessionAudienceForRequest`); (2) customer logout returned **400** (bodyless POST with `Content-Type: application/json`) so it never revoked/cleared — fixed the client to omit JSON content-type when bodyless + hardened the backend to tolerate empty JSON bodies. `session-isolation.test.ts` + empty-body logout regression test + browser-level `session-isolation.spec.ts` |
| W-01 | Public site IA, routing & shared layout | Frontend Customer | Marketing route structure + shared public header/footer/nav building on brand tokens + Meridian logo; session-aware nav and protected `/dashboard` NOT regressed | W-00 | Done | `/`, `/checking`, `/savings`, `/cards`, `/borrow`, `/about`, `/open-account` + `PublicNav`/header CTAs |
| W-02 | Polished public home page | Frontend Customer | Hero, value props, product highlights, trust/about teaser, footer; clear login + open-account CTAs; responsive; a11y (headings, alt text) | W-01 | Done | Rebuilt `MarketingHome` (hero, 3 value props, product grid, security/trust, testimonial-as-sim, CTA) |
| W-03 | Product marketing pages (checking & savings) | Frontend Customer | Content-rich, clearly fictional checking + savings pages (features, simulated rates/fees, FAQs, CTAs) | W-01 | Done | `Checking`, `Savings` pages w/ feature grids, sim APY/fee disclaimers, FAQs |
| W-04 | Cards & borrowing overview ("coming soon") | Frontend Customer | Overview page(s) presenting cards/loans/CDs as coming soon with milestone tags; clearly fictional | W-01 | Done | `Cards`, `Borrow` pages with roadmap-tagged "coming soon" product rails |
| W-05 | Image system: realistic placeholders + prompts | Frontend Customer | `ImagePlaceholder` wired across pages (real files drop into `public/images/` with no code change); extend `IMAGE_GENERATION_PROMPTS.md`; descriptive alt text | W-02..W-04 | Done | Named image slots across pages; prompts file extended to cover every slot |
| W-06 | Login / open-account entry points | Frontend Customer | Consistent CTAs from the public site to `/login` and an `/open-account` route (placeholder onboarding until v0.6.0); clearly labelled | W-01 | Done | Header + hero + footer CTAs; `/open-account` placeholder routing to login w/ v0.6.0 note |
| W-07 | Responsive & accessibility polish | Frontend Customer | Breakpoint pass (mobile→desktop); semantic landmarks/headings; labelled controls; visible focus; simulation disclaimer visible site-wide | W-02..W-06 | Done | Mobile nav, fluid grids, skip-link, focus-visible, banner+footer disclaimers on every page |
| W-08 | Tests (unit/integration + e2e + verify) | Testing/QA | Session-isolation integration tests; public-site Playwright smoke (marketing routes, nav, CTAs); `npm run verify` green | W-00..W-07 | Done | 65→**70** Vitest (session-isolation + empty-body-logout regression); 8→**14** e2e (`public-site.spec.ts` + browser-level `session-isolation.spec.ts`); verify green |
| W-09 | Milestone handoff | Process Scribe | Update all handoff docs; annotated tag `v0.3.0` | W-00..W-08 | Done | This board + reports; tag `v0.3.0` |

> Later milestones (v0.4.0–v1.0.0) are summarized in `ROADMAP.md` and will be
> decomposed into tasks here when they become the active milestone.

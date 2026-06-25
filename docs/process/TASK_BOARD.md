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

## v0.3.0 review follow-ups (folded into the v0.4.0 session)  ✅ Done

> From `feedback/FEEDBACK_v0.3_2026-06-25_1053.md` (human review of v0.3.0). Two
> small, accepted public-site UX fixes. `R-01` touches client-side **routing** (a
> risky shared area) so it is done first, serially, and covered by an e2e test.

| ID | Title | Role | Acceptance criteria | Deps | Status | Result |
| --- | --- | --- | --- | --- | --- | --- |
| R-01 | Scroll-to-top on route change + hash deep-link | Frontend Customer | Every client-side navigation lands at the **top** of the destination page (header, footer, AND in-page CTAs alike — e.g. Loans&CDs "See Savings"/"See Checking"); a URL with a `#fragment` (e.g. the "Security" link → `/about#security`) scrolls that section into view allowing for the sticky header; back/forward restores sensibly; the protected dashboard is not regressed | v0.3.0 | Done | `components/ScrollToTop.tsx` mounted at the router root; hash → `scrollIntoView` with `scroll-mt-24` on `Section`; e2e in `dashboard.spec.ts` (scroll-to-top + `/about#security`) |
| R-02 | Session-aware public CTAs + "already logged in" /login | Frontend Customer | When authenticated, public CTAs that say "Log in"/"Open an account" instead read **"Visit your Dashboard"** and route to `/dashboard`; visiting `/login` while authenticated shows an **already-logged-in** panel (dashboard link + log-out button) instead of the form; logged-out behavior unchanged; auth/protected route not regressed | v0.3.0 | Done | `lib/cta.ts` (`resolveCtas`, deduped); `Login` authed branch (panel + log-out); `PageHero`/`CTASection`/`SiteFooter` session-aware; e2e in `dashboard.spec.ts` |

## Milestone v0.4.0 — Customer banking dashboard  ✅ Done (tag `v0.4.0`)

> Approved to start by the human (see `feedback/FEEDBACK_v0.3_2026-06-25_1053.md`).
> **No Prisma schema migration is needed** — the existing append-only `LedgerEntry`
> model already carries transaction `status` (pending/posted/…) and `origin`, so a
> transaction *is* a ledger entry. The **API contract (`D-01`) and the seed/endpoint
> (`D-02`/`D-03`) are the risky shared area** (routing + the data every screen reads):
> they are built first, serially, with invariants + tests, and the contract is locked
> before the dashboard UI (`D-04…D-07`) is built on it. Balances stay DERIVED.

| ID | Title | Role | Acceptance criteria | Deps | Status | Result |
| --- | --- | --- | --- | --- | --- | --- |
| D-01 | Transaction API contract (shared DTOs) | Backend/Shared | `TransactionDTO` (id, accountId, amountMinor, direction, status, origin, description, postedAt/createdAt, running? ) + list response + filter/search query shape, in `@simbank/shared`; pure, dependency-free; documents pending-vs-posted | v0.3.0 | Done | `packages/shared/src/transactions.ts`: `TransactionDTO`, `AccountTransactionsResponse`, `TransactionQuery`, `toTransactionDTOs`, `filterTransactions`, `groupForStatus`, `originLabel`, `signedMinor`; **13** unit tests |
| D-02 | Realistic seeded transaction history | Backend/API | Extend the seed PLAN with a richer, dated set of transactions across Avery's checking & savings (payroll, groceries, utilities, dining, transfers, interest, a fee, plus current **pending** items) — all bank-originated or balanced transfer legs; existing money + access invariants still pass; **no schema change** | D-01 | Done | `seed-plan.ts` rebuilt with paired helpers + `daysAgo`; `seed-apply.ts` dates each entry (`createdAt`/`postedAt`); 7 → **56** entries; invariants + `seed-plan.test.ts` green |
| D-03 | Transaction read endpoint (access-scoped) | Backend/API | `GET /api/accounts/:id/transactions` returns the account's transactions newest-first with derived running balance, scoped by the SAME access rules as `/api/accounts/:id` (owner/joint see it; others 403/404); supports `?status=&q=&origin=` filter/search server-side; pending vs posted distinguished | D-01,D-02 | Done | `listAccountTransactions` in `access.ts` (reuses `getAccountRelationship`); route in `accounts.ts` w/ whitelisted `parseTransactionQuery`; `transactions.test.ts` (**10** tests, full access matrix + filters) |
| D-04 | Accounts overview | Frontend Customer | Dashboard landing shows all accessible accounts grouped (checking/savings), derived available+current balances, a combined total, and links into each account's detail; degrades on loading/empty/offline; disclaimer visible | D-01 | Done | `Dashboard` reworked into an overview: combined total, account cards linking to detail, retained sign-in activity + disclaimer |
| D-05 | Account detail view | Frontend Customer | `/accounts/:id` shows the account header (name, type, derived balances, pending holds) + its transaction history; 403/404 handled; back to overview | D-03,D-04 | Done | `pages/AccountDetail.tsx` + protected `/accounts/:id` route; loading/offline/403/404 states |
| D-06 | Transaction history + pending/posted + search/filter | Frontend Customer | Transactions list shows **pending** vs **posted** clearly (grouping/badges), with running balance, and a basic **search** (description) + **filter** (status/origin); empty/least-noise states | D-03,D-05 | Done | `components/TransactionList.tsx`: pending/posted/other groups, running balance, search + status/category filter via shared `filterTransactions` |
| D-07 | Statements/documents placeholder | Frontend Customer | A clearly-labelled statements/documents placeholder (no real PDFs) reachable from the dashboard/detail, tagged to its future milestone | D-04 | Done | `pages/Statements.tsx` + protected `/statements`; linked from dashboard + detail; "coming soon" (v0.9.0), no real PDFs |
| D-08 | Tests (unit/integration + e2e + verify) | Testing/QA | Shared transaction helpers unit-tested; backend endpoint access + filter integration tests; Playwright: overview → detail → transactions, pending/posted visible, search/filter, statements placeholder; `npm run verify` green | D-01..D-07 | Done | +13 shared +10 backend = **93** Vitest; `e2e/dashboard.spec.ts` (+8) = **22** e2e; verify green |
| D-09 | Milestone handoff | Process Scribe | Update all handoff docs (report, review, next prompt, state/next, board, experiment log, changelog, quality report); annotated tag `v0.4.0` | D-01..D-08 | Done | This board + report/review/next-prompt + state/next/changelog/experiment-log/quality-report; version bumped to 0.4.0; tag `v0.4.0` |

## Milestone v0.5.0 — Operations simulator core  ▶️ In Progress

> Approved to start by the human (see `feedback/FEEDBACK_v0.4_2026-06-25_1228.md` —
> "Everything looks good so far. Keep moving forward toward the next milestone.").
> **No re-scope.** This milestone turns the operations console's placeholders into a
> live, WebSocket-driven workflow. The **risky shared areas** here are the shared
> contract (`O-01`), the **Prisma schema/migration** (`O-02`, the first migration
> since v0.2.0), the **routing** of the new ops endpoints (`O-06`), and the
> **real-time** channel + socket RBAC (`O-05`). These are built **serially, first,
> and reviewed**; the API + socket-event contract is **locked** before the operations
> frontend (`O-07`/`O-08`) is built on it. **Money discipline is preserved:** operator
> actions in v0.5.0 change request *workflow state* + write audit + push real-time
> updates — they do **not** create ledger entries (money movement is v0.7.0). Balances
> stay DERIVED; the simulation disclaimer stays visible; v0.2.0 auth / v0.3.0 site /
> v0.4.0 dashboard are not regressed.

| ID | Title | Role | Acceptance criteria | Deps | Status | Result |
| --- | --- | --- | --- | --- | --- | --- |
| O-01 | Ops contract (shared DTOs + socket events) | Backend/Shared | New `packages/shared/src/operations.ts`: action/priority/channel enums, `OperationsRequestDTO` + detail + `OperatorActionLogDTO` + `SimulatedEventDTO`, API request/response DTOs, socket-event names + payload types, and PURE helpers (`nextStatusForAction`, `isTerminalOpsStatus`, label/`OPS_QUEUES` helpers); dependency-free; unit-tested; **contract locked before UI** | v0.4.0 | In Progress | — |
| O-02 | Schema flesh-out + migration | Backend/API (risky, serial) | Expand `OperationsRequest` (priority, detail, subjectName/email, lastActor\*/lastAction/lastActionNote, resolvedAt) + new `SimulatedEvent` model (channel/direction/kind/status/summary/detail/requestId) + relation; `migrate dev --name operations_core`; **additive only** — no change to money/auth tables; `db:reset` works | O-01 | Ready | — |
| O-03 | Realistic seeded ops queue + initial simulated events | Backend/API | Extend the seed PLAN with a dated, varied set of **pending** ops requests (identity/MFA/password-reset/support/dispute/fraud/onboarding/deposit-review/ACH/external-acct) across the demo users + a few seeded simulated events; new invariants (known type/status/priority/channel); money + access invariants still pass; **no money created** | O-01,O-02 | Ready | — |
| O-04 | Ops domain service + action state machine + audit | Backend/API (risky, serial) | `src/ops/requests.ts`: list (filter by status/type) + detail (with action history from `AuditLog`) + `applyOperatorAction` (validate transition via shared helper, persist, write `AuditLog` row, optionally spawn a simulated event) + `createSimulatedEvent`; mappers to DTOs; invalid transition / unknown id are typed errors | O-01,O-02 | Ready | — |
| O-05 | Real-time: testable publisher + socket RBAC | Backend/API (risky, serial) | `src/ops/realtime.ts`: `OpsRealtime` interface + Socket.IO impl + recording double for tests; `attachRealtime` gains a handshake middleware that resolves the **ops** session cookie and joins operators to an `ops` room; ops events broadcast to that room ONLY (customers never receive them); `buildServer` decoration + `index.ts` wiring | O-01,O-04 | Ready | — |
| O-06 | Ops routes (RBAC-gated) | Backend/API (risky, serial) | `/api/ops/requests` (list+counts), `/api/ops/requests/:id` (detail+history), `POST /api/ops/requests/:id/action` (approve/reject/hold/request_info + note → emits real-time), `POST /api/ops/simulate/event` (+ emits), `/api/ops/events` (feed); all `requireRole('ops_agent','admin')`; extend `/api/ops/summary` (queue counts) backward-compatibly | O-04,O-05 | Ready | — |
| O-07 | Live operations console — queues + operator actions | Frontend Operations | Replace the placeholder queues with **live** data from `/api/ops/requests`; filter by status/type; approve/reject/hold/request-info with an optional note; a `useOpsSocket` hook (socket.io-client, `withCredentials`) applies `ops:request_changed` live; loading/empty/offline states; disclaimer visible | O-01,O-06 | Ready | — |
| O-08 | Simulated external events + activity feed | Frontend Operations | A clearly-labelled **simulated** SMS/email/MFA/identity panel that POSTs `/api/ops/simulate/event` and shows the resulting event feed live (`ops:external_event`); an operator-action activity feed (audit) on request detail; never implies a real provider | O-01,O-06 | Ready | — |
| O-09 | Tests (unit/integration + e2e) + verify | Testing/QA | Shared helpers unit-tested; backend integration: RBAC matrix (customer/joint 403; ops/admin 200), each action transition, invalid action 400, unknown id 404, audit row written, real-time publisher invoked (recording double), simulate event; Playwright operator journey (login → queue → action updates → simulated event); `npm run verify` green | O-01..O-08 | Ready | — |
| O-10 | Security review + milestone handoff | Security Reviewer + Process Scribe | Read-only security/simulation-safety audit (ops RBAC on every route + socket room, no customer-private socket leakage, simulated labels, no secrets, ledger untouched); then update ALL handoff docs (report, review, next prompt, state/next, board, experiment log, changelog, quality report), bump version to 0.5.0, annotated tag `v0.5.0` | O-01..O-09 | Ready | — |

> Later milestones (v0.6.0–v1.0.0) are summarized in `ROADMAP.md` and will be
> decomposed into tasks here when they become the active milestone.

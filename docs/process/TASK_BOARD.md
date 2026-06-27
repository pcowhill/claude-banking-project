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

## Milestone v0.5.0 — Operations simulator core  ✅ Done (tag `v0.5.0`)

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
| O-01 | Ops contract (shared DTOs + socket events) | Backend/Shared | New `packages/shared/src/operations.ts`: action/priority/channel enums, `OperationsRequestDTO` + detail + `OperatorActionLogDTO` + `SimulatedEventDTO`, API request/response DTOs, socket-event names + payload types, and PURE helpers (`nextStatusForAction`, `isTerminalOpsStatus`, label/`OPS_QUEUES` helpers); dependency-free; unit-tested; **contract locked before UI** | v0.4.0 | Done | `operations.ts` (+ ops `SOCKET_EVENTS` & `OPS_REALTIME_ROOM`); **18** unit tests; contract locked first |
| O-02 | Schema flesh-out + migration | Backend/API (risky, serial) | Expand `OperationsRequest` (priority, detail, subjectName/email, lastActor\*/lastAction/lastActionNote, resolvedAt) + new `SimulatedEvent` model (channel/direction/kind/status/summary/detail/requestId) + relation; `migrate dev --name operations_core`; **additive only** — no change to money/auth tables; `db:reset` works | O-01 | Done | `operations_core` migration (additive; SQL reviewed); `OperationsRequest` expanded + `SimulatedEvent` added |
| O-03 | Realistic seeded ops queue + initial simulated events | Backend/API | Extend the seed PLAN with a dated, varied set of **pending** ops requests (identity/MFA/password-reset/support/dispute/fraud/onboarding/deposit-review/ACH/external-acct) across the demo users + a few seeded simulated events; new invariants (known type/status/priority/channel); money + access invariants still pass; **no money created** | O-01,O-02 | Done | 10 dated requests + 4 events + intake audit rows; `assertSeedOpsIntegrity`; 9 new `seed-plan.test.ts` cases |
| O-04 | Ops domain service + action state machine + audit | Backend/API (risky, serial) | `src/ops/requests.ts`: list (filter by status/type) + detail (with action history from `AuditLog`) + `applyOperatorAction` (validate transition via shared helper, persist, write `AuditLog` row, optionally spawn a simulated event) + `createSimulatedEvent`; mappers to DTOs; invalid transition / unknown id are typed errors | O-01,O-02 | Done | `ops/requests.ts` (service + mappers + typed `OpsActionError`); `request_info` auto-spawns a simulated email; writes no ledger |
| O-05 | Real-time: testable publisher + socket RBAC | Backend/API (risky, serial) | `src/ops/realtime.ts`: `OpsRealtime` interface + Socket.IO impl + recording double for tests; `attachRealtime` gains a handshake middleware that resolves the **ops** session cookie and joins operators to an `ops` room; ops events broadcast to that room ONLY (customers never receive them); `buildServer` decoration + `index.ts` wiring | O-01,O-04 | Done | `ops/realtime.ts` publisher; `attachRealtime(server, prisma)` handshake RBAC; `app.opsRealtime` decoration; proven by `realtime.test.ts` |
| O-06 | Ops routes (RBAC-gated) | Backend/API (risky, serial) | `/api/ops/requests` (list+counts), `/api/ops/requests/:id` (detail+history), `POST /api/ops/requests/:id/action` (approve/reject/hold/request_info + note → emits real-time), `POST /api/ops/simulate/event` (+ emits), `/api/ops/events` (feed); all `requireRole('ops_agent','admin')`; extend `/api/ops/summary` (queue counts) backward-compatibly | O-04,O-05 | Done | `routes/ops.ts` extended + registered; mutations emit via `app.opsRealtime`; summary now carries per-status counts |
| O-07 | Live operations console — queues + operator actions | Frontend Operations | Replace the placeholder queues with **live** data from `/api/ops/requests`; filter by status/type; approve/reject/hold/request-info with an optional note; a `useOpsSocket` hook (socket.io-client, `withCredentials`) applies `ops:request_changed` live; loading/empty/offline states; disclaimer visible | O-01,O-06 | Done | `OpsDataProvider` (1 socket + live state), `RequestQueues` + detail panel; status/lane filters; Live indicator |
| O-08 | Simulated external events + activity feed | Frontend Operations | A clearly-labelled **simulated** SMS/email/MFA/identity panel that POSTs `/api/ops/simulate/event` and shows the resulting event feed live (`ops:external_event`); an operator-action activity feed (audit) on request detail; never implies a real provider | O-01,O-06 | Done | `SimulatedMessaging` page + `OpsActivityFeed`; live feed; request history on detail; dashboard reworked live |
| O-09 | Tests (unit/integration + e2e) + verify | Testing/QA | Shared helpers unit-tested; backend integration: RBAC matrix (customer/joint 403; ops/admin 200), each action transition, invalid action 400, unknown id 404, audit row written, real-time publisher invoked (recording double), simulate event; Playwright operator journey (login → queue → action updates → simulated event); `npm run verify` green | O-01..O-08 | Done | **145** Vitest (was 93) incl. socket-RBAC integration test; **25** e2e (`operations.spec.ts`); verify green |
| O-10 | Security review + milestone handoff | Security Reviewer + Process Scribe | Read-only security/simulation-safety audit (ops RBAC on every route + socket room, no customer-private socket leakage, simulated labels, no secrets, ledger untouched); then update ALL handoff docs (report, review, next prompt, state/next, board, experiment log, changelog, quality report), bump version to 0.5.0, annotated tag `v0.5.0` | O-01..O-09 | Done | Security review **PASS** (its Medium closed via `realtime.test.ts`); handoff docs + version 0.5.0 + tag `v0.5.0` |

## v0.5.0 review follow-ups (folded into the v0.6.0 session)  ✅ Done

> From `feedback/FEEDBACK_v0.5_2026-06-26_0155.md` (human review of v0.5.0). Two
> accepted ops-console fixes done alongside the onboarding work, plus two
> documentation answers. `B-02` touches the shared ops contract + the action
> service + routing + real-time — **risky shared areas** — so it is serialized
> through the contract (`N-01`) before the UI is built on it. `B-01` is a
> self-contained ops-frontend fix.

| ID | Title | Role | Acceptance criteria | Deps | Status | Result |
| --- | --- | --- | --- | --- | --- | --- |
| B-01 | Detail-panel action buttons sync to live state (bug fix) | Frontend Operations | On the Request queues page, acting on a request from the **queue card** (or via Socket.IO from another operator) updates the open **detail panel** too: its status badge + action bar reflect the live shared queue state, so approve/reject buttons **deactivate** once the request is terminal regardless of where the action came from; history/events refresh when the live copy advances; e2e regression | v0.5.0 | Done | `RequestDetailPanel` reads the live request from `useOpsData().requests` (status drives badge+`ActionBar`); reloads history when `live.updatedAt` advances; `operations.spec.ts` regression |
| B-02 | Add a note at any time, incl. after the decision | Backend/Shared + Frontend Operations (serial) | A non-decision **`note`** operator action records an `AuditLog` row **without changing workflow status** and is **allowed even on terminal (approved/rejected) requests**; it flows through the SAME `applyOperatorAction` service + `/api/ops/requests/:id/action` route + real-time emit (reuse, not reinvent); the detail panel gains an always-enabled **"Add note"** affordance beside the (terminal-disabled) decision bar; posts **nothing** to the ledger; tested | N-01 | Done | `note` added to the shared action vocab (not to the 4-button bar); service appends audit + touches `updatedAt` + emits; "Add note" button in `RequestDetailPanel`; unit + integration + e2e |
| Q-01 | Doc: deposit pending→posted is deferred to v0.7.0 | Process Scribe | Explain in `HUMAN_REVIEW_v0.6.md` + milestone report **why** approving a Mobile check deposit does not (yet) flip the customer's line from *Pending* to *Posted*: it is a **money-movement / ledger-posting** change (v0.7.0), and what v0.7.0 will do | v0.5.0 | Done | Explanation in review docs (see `Q-01` answer); recorded as a v0.7.0 acceptance note |
| Q-02 | Doc: Simulated Messaging's role (and 2FA) | Process Scribe | Explain in `HUMAN_REVIEW_v0.6.md` what Simulated Messaging is for and how it will play a real role (the simulated provider seam; onboarding identity/MFA in v0.6.0 is its first real use; 2FA-at-login uses it when that auth sub-feature lands) | v0.5.0 | Done | Explanation in review docs (see `Q-02` answer) |

## Milestone v0.6.0 — Onboarding and account opening  ✅ Done (tag `v0.6.0`)

> Approved to start by the human (see `feedback/FEEDBACK_v0.5_2026-06-26_0155.md` —
> "Everything else looks great."). **No re-scope.** This milestone turns the
> `/open-account` placeholder into a real, clearly-simulated application that
> **feeds the v0.5.0 operations queue**, and makes an operator **approval** the
> thing that provisions a real **User + Account + initial funding** — the first
> time an operator action has a **create/ledger** effect. The **risky shared
> areas** are the shared contract (`N-01`), the **Prisma schema/migration**
> (`N-02`), the **ledger** (`N-04` initial funding), and the **routing** of the
> new endpoints + the **real-time** wiring (`N-07`). These are built **serially,
> first, and reviewed**; the API + socket contract is **locked** before the two
> frontends (`N-09…N-11`) are parallelized on it. **MONEY DISCIPLINE:** initial
> funding enters ONLY via an explicit **bank-originated** `LedgerEntry` (a posted
> `deposit`/`adjustment`), audited; admin-funded users require a **reason**;
> balances stay DERIVED. The simulation disclaimer stays visible; v0.2.0 auth /
> v0.3.0 site / v0.4.0 dashboard / v0.5.0 ops console are not regressed.

| ID | Title | Role | Acceptance criteria | Deps | Status | Result |
| --- | --- | --- | --- | --- | --- | --- |
| N-01 | Onboarding/invitation/admin contract (shared DTOs) + `note` action | Backend/Shared (risky, serial) | New `packages/shared/src/onboarding.ts`: products/statuses enums, funding bounds, `OpenAccountRequest`/`OpenAccountResponse`, invitation DTOs, `AdminCreateUserRequest`/response, and PURE validators (`validateOpenAccount`, `validateAdminCreateUser`, product/funding guards); add a non-decision **`note`** to the shared ops action vocab (`nextStatusForAction` → null, `canApplyAction('note')` → true always) WITHOUT adding a 5th button to `OPS_ACTIONS`; dependency-free; unit-tested; **contract locked before UI** | v0.5.0 | Done | `onboarding.ts` (DTOs + pure validators) + `note` added to `operations.ts`; barrel exports; `note` excluded from the 4-button bar |
| N-02 | Schema flesh-out + migration `onboarding` | Backend/API (risky, serial) | Add `OnboardingApplication` (1:1 link to its `OperationsRequest`; holds the bcrypt `passwordHash` server-side, NEVER in any DTO) + `AccountInvitation` (joint invites) models + relations; `migrate dev --name onboarding`; **additive only** — no change to money/auth tables; `db:reset` works | N-01 | Done | `onboarding` migration (additive; SQL reviewed); two models + back-relations on User/Account/OperationsRequest |
| N-03 | Seed: queued onboarding application + pending joint invitation | Backend/API | Extend the seed PLAN so an onboarding queue item has a **linked** `OnboardingApplication` (an operator can approve it end-to-end) and seed a **pending** joint invitation (Avery → Jordan on savings) so accept/decline is demoable; new invariants; money + access + ops invariants still pass; **no money created at seed** | N-01,N-02 | Done | `onboarding-taylor` request now backed by an application; seeded pending invitation; `assertSeedOnboardingIntegrity`; seed version string bumped |
| N-04 | Onboarding service + approval→provisioning (ledger) | Backend/API (risky, serial) | `submitApplication` (public): create application + linked ops request + simulated identity/MFA/email events; **provisioning on approve**: an operator approving an `onboarding` request creates `User` + `Account` + owner `AccountAccess` + (if funded) a **bank-originated, posted `deposit`** `LedgerEntry` for the initial funding, all **audited**, atomically; reject marks the application rejected; precondition-guarded (email free, app still submitted); **balances stay derived; settled-total only moves by the bank-originated deposit** | N-01,N-02 | Done | `ops/onboarding.ts`; provisioning runs inside the ops approve path in a transaction; emits a "Account opened (simulated)" event; money invariant test |
| N-05 | Joint invitation service | Backend/API | `inviteJoint` (owner-only): create `AccountInvitation` + a clearly-labelled simulated **email** event + audit; `acceptInvitation` → create a `joint` `AccountAccess` grant (invitee then sees the account) + audit; `declineInvitation`; typed errors (not owner / wrong invitee / already responded) | N-01,N-02 | Done | `ops/invitations.ts`; accept creates the grant via the same access primitives RBAC reads; audited; simulated email on invite + accept |
| N-06 | Admin user provisioning service | Backend/API | `adminCreateUser` (admin-only): create a `User` (hashed demo password) + optional `Account`; if funded, post a **bank-originated `adjustment`** `LedgerEntry` requiring a **reason** + audit (per the constitution's admin-adjustment rule); returns the created user + its non-secret demo credentials | N-01,N-02 | Done | `ops/admin-users.ts`; funded creation requires a reason → audited `adjustment`; balances derived |
| N-07 | Routes (public + customer + admin) + real-time wiring | Backend/API (risky, serial) | `POST /api/onboarding/applications` (public); `POST /api/accounts/:id/invitations`, `GET /api/invitations`, `POST /api/invitations/:id/accept|decline` (auth); `POST /api/admin/users` (admin); register in `routes/index.ts`; submit + invite + provisioning **emit to the operators room** via `app.opsRealtime` (reuse the v0.5.0 channel); validation via the shared pure validators; **provisioning triggered by the existing ops approve route**, no new ops endpoint | N-04,N-05,N-06 | Done | `routes/onboarding.ts` (+ admin create in `ops.ts`); registered; public submit + invite + approve feed the live queue/feed |
| N-08 | `note` action backend (B-02) | Backend/API (risky, serial) | Extend `applyOperatorAction`: a `note` action writes an audit row, **does not change status**, is allowed on **terminal** requests, touches `updatedAt`, and emits a real-time "updated"; the action route accepts `note` and updates its error copy; never touches the ledger | N-01 | Done | `applyOperatorAction` note branch; route validation widened; integration tests (note on pending + on approved) |
| N-09 | Customer open-account flow (UI) | Frontend Customer | Replace the `/open-account` placeholder with a real, clearly-**simulated** multi-step application (applicant details, product, simulated initial funding, optional joint invite, explicit consent) → submits to the public endpoint → a **confirmation** screen (reference + "operator will review" + how to sign in once approved); loading/error/offline states; disclaimer prominent; does not regress the public site | N-01,N-07 | Done | `pages/OpenAccount.tsx` reworked into a real application form + confirmation; `lib/onboarding.ts` client; shared validators reused |
| N-10 | Customer joint-invitation UI | Frontend Customer | Account detail (owner) gains an **"Invite a joint owner"** form (→ POST invitations, shows pending); the dashboard gains an **"Invitations" inbox** for the signed-in user (GET /api/invitations) with **Accept/Decline**; accepting makes the account appear; clearly simulated; protected routes not regressed | N-01,N-07 | Done | Invite form on `AccountDetail`; invitations inbox on `Dashboard`; accept → account appears; `lib/invitations.ts` client |
| N-11 | Ops console: B-01 fix + B-02 add-note + onboarding/admin UI | Frontend Operations | `B-01` live-sync fix; `B-02` "Add note" affordance; the detail panel shows onboarding **application context** (product/funding/joint-invite) + provisioning feedback (the "account opened" simulated event); an **admin-only** "Create demo user" panel (→ POST /api/admin/users) with the non-secret credentials shown back; disclaimer visible | N-01,N-07 | Done | `RequestDetailPanel` live-sync + Add-note + onboarding context; admin Create-user page gated to `admin`; nav link admin-only |
| N-12 | Tests (unit/integration + e2e) + verify | Testing/QA | Shared: onboarding validators + `note` helpers unit-tested. Backend integration: submit→queue item; **approve→user+account+bank-originated funding** with the money invariant held (settled total moves only by the deposit; balances derived); reject→no user; invite→accept→grant + RBAC (non-owner invite 403); admin create (+funded requires reason); `note` on pending and on terminal; RBAC matrix on the new routes. Playwright: open-account journey, operator approves onboarding, note-after-decision, button-deactivation regression. `npm run verify` green | N-01..N-11 | Done | +shared +backend Vitest; +e2e specs; full RBAC + money-invariant coverage; verify green |
| N-13 | Security review + milestone handoff | Security Reviewer + Process Scribe | Read-only security/simulation-safety audit (public submit can't escalate; password hash never serialized; provisioning + admin funding audited with reason; invite acceptance can't grant arbitrary access; RBAC on every new route; ledger discipline held; no secrets); then update ALL handoff docs (report, review incl. `Q-01`/`Q-02`, next prompt, state/next, board, experiment log, changelog, quality report), bump version to 0.6.0, annotated tag `v0.6.0` | N-01..N-12 | Done | Security review **PASS**; handoff docs + version 0.6.0 + tag `v0.6.0` |

## Milestone v0.6.1 — Operations console fixes (patch)  ✅ Done (tag `v0.6.1`)

> **Re-scoped by the human** (see `feedback/FEEDBACK_v0.6_2026-06-26_1710.md`): do
> NOT start v0.7.0; ship a patch release fixing only the two reported Meridian
> Operations bugs, with v0.6.1-named docs, for the human to test. Both reported
> issues were confirmed **real bugs** and fixed. Changes are confined to the
> **operations app** + the shared version string — **no backend / schema / ledger /
> contract change**, so money discipline, auth, the public site, the customer
> dashboard, and onboarding are untouched. v0.7.0 (and the carried `Q-01`) remain
> deferred to the next session, pending the human's v0.6.1 review.

| ID | Title | Role | Acceptance criteria | Deps | Status | Result |
| --- | --- | --- | --- | --- | --- | --- |
| B-03 | Restore navigation at narrow widths | Frontend Operations | The operations console must let an operator switch between Dashboard / Request queues / Simulated messaging (and, for admins, Create demo user) **at any window width**. Previously the left sidebar was `lg:block`-only and simply hidden below `lg` with no replacement control. Add an accessible responsive menu; desktop sidebar unchanged; nav links shared between both surfaces so they can't drift; e2e at a narrow viewport | v0.6.0 | Done | `OpsLayout.tsx`: shared `NavList`; `lg:hidden` ☰/✕ toggle in the header → panel with the same links; auto-closes on navigate + route change; `aria-expanded`/`aria-controls`; e2e in `operations.spec.ts` |
| B-04 | Recover from an expired/rejected operator session (no dead "Not authenticated") | Frontend Operations | Root-cause the "Not authenticated" in Request queues. Backend + onboarding-approval verified correct end-to-end (submit→approve→provision→customer-sign-in over HTTP, and a clean-browser queue load). Real defect: the console rendered the authenticated shell from optimistic in-memory state and never reconciled an API **401**, stranding the operator. Fix: detect 401 `unauthenticated`/`session_expired` on ops calls → sign out in the UI → return to the sign-in screen with a clear notice → recover on re-login; a failed login (`invalid_credentials`) must NOT trigger it; e2e | v0.6.0 | Done | `api.ts` `setSessionInvalidHandler` + code-guarded trigger; `AuthContext`/`auth-context` reconcile + `sessionEnded`; `Login.tsx` notice; recovery verified in real Chromium; e2e in `operations.spec.ts` |
| B-05 | Regression coverage + gate | Testing/QA | Deterministic e2e for both fixes; `npm run verify` green; no test regression | B-03,B-04 | Done | **+2** e2e (32 total, was 30): narrow-width nav + 401→sign-in recovery (via route interception); **189** Vitest unchanged; verify green |
| DOC-061 | Patch handoff docs + tag | Process Scribe | Save feedback verbatim; v0.6.1-named human review (with the bug explanations the human asked for) + milestone report + next-session prompt; update PROJECT_STATE / NEXT_SESSION / TASK_BOARD / EXPERIMENT_LOG / CHANGELOG / QUALITY_REPORT / README; bump version to 0.6.1; annotated tag `v0.6.1` | B-03,B-04,B-05 | Done | `HUMAN_REVIEW_v0.6.1.md`, `MILESTONE_REPORT_v0.6.1.md`, `NEXT_SESSION_PROMPT_v0.6.1.md`; state/next/board/changelog/experiment-log/quality-report/README updated; version 0.6.1; tag `v0.6.1` |

## Milestone v0.6.2 — Operations sign-in fix (patch)  ✅ Done (tag pending human)

> NOTE (v0.7.0 session): the v0.6.2 commits are present on this branch, but the
> human confirmed at the v0.6.2 review that they have **not tagged** v0.6.2, and no
> tag exists in-repo (`git tag -l` is empty). The earlier "tag `v0.6.2`" wording
> referred to a local-only annotated tag created in the prior sandbox that was never
> pushed (tag push is blocked by this environment's git policy). The human tags on
> merge to `main`.

> **Re-scoped by the human** (see `feedback/FEEDBACK_v0.6.1_2026-06-26_1852.md`): a
> NEW blocking regression from the v0.6.1 B-04 fix made the operator unable to sign
> in at all — the dashboard flashes, then the console bounces back to the sign-in
> screen ("Your operator session has ended…") in an unrecoverable loop, for both Sam
> and the Administrator. Fix ONLY this bug, ship **v0.6.2**, and do **not** start
> v0.7.0 (which waits for the human to test v0.6.2). Confirmed a **real bug**; fixed.
> The change touches the **shared auth contract + backend session-cookie/real-time
> resolution + the operations app client** — no schema / migration / ledger / money
> change, so money discipline, the public site, the customer dashboard, and
> onboarding are untouched, and the v0.3.0 session isolation is preserved.

| ID | Title | Role | Acceptance criteria | Deps | Status | Result |
| --- | --- | --- | --- | --- | --- | --- |
| B-06 | Operator cannot sign in — session lost on Origin-less requests (login loop) | Backend/API + Shared + Frontend Operations (risky, serial) | Root-cause the v0.6.1 login loop and fix it within session/auth discipline. Real defect: the backend picks the per-surface session cookie from the request **`Origin`**, defaulting to the **customer** cookie when `Origin` is absent — but browsers **omit `Origin` on same-origin GETs**, so the console's authenticated `/api/ops/*` GETs read the empty `mer_session` and 401'd; the v0.6.1 recovery handler then looped to sign-in. Fix: each app declares its surface via an explicit **`AUTH.surfaceHeader`** (`x-meridian-surface`) the backend trusts **ahead of** `Origin` (Origin kept as fallback so the socket handshake, cross-origin dev, and existing tests are unchanged); the ops client sends it on every REST call + the socket handshake; the backend resolves the cookie + ops-room from it. **Session isolation (v0.3.0) must stay green.** Reproduce + guard with tests | v0.6.1 | Done | `shared/auth.ts` (`surfaceHeader` + `isSessionAudience`); `backend/auth/cookies.ts` (`sessionAudienceFromHeader`, header-first `sessionAudienceForRequest`); `backend/realtime.ts` (handshake header-first); `operations/lib/api.ts` + `useOpsSocket.ts` (send the header); customer app intentionally unchanged (least-privileged `customer` default already correct) |
| B-06-T | Reproduce + regression coverage | Testing/QA | An empirical reproduction (the surface-header request 401'd pre-fix, 200 post-fix) plus durable guards; `npm run verify` + `npm run test:e2e` green; no regression to auth/dashboard/public-site/onboarding/ops or the session-isolation test | B-06 | Done | `ops-session-origin.test.ts` (5 integration), `auth/cookies.test.ts` (7 unit) → **201** Vitest (was 189); `operations.spec.ts` +1 same-origin e2e (strips `Origin` on GETs in real Chromium, self-validating) → **33** e2e (was 32); CORS preflight for the new header handled by `@fastify/cors` (204), no CORS change |
| DOC-062 | Patch handoff docs + tag | Process Scribe | Save feedback verbatim; v0.6.2-named human review (plain-language bug explanation + exact test steps for Sam + Admin) + milestone report + next-session prompt; update PROJECT_STATE / NEXT_SESSION / TASK_BOARD / EXPERIMENT_LOG / CHANGELOG / QUALITY_REPORT / README; bump version to 0.6.2; annotated tag `v0.6.2` | B-06,B-06-T | Done | `HUMAN_REVIEW_v0.6.2.md`, `MILESTONE_REPORT_v0.6.2.md`, `NEXT_SESSION_PROMPT_v0.6.2.md`; state/next/board/changelog/experiment-log/quality-report/README updated; version 0.6.2; tag `v0.6.2` |

## Milestone v0.7.0 — Money movement  ✅ Done (tag `v0.7.0` created locally; human pushes on merge)

> Approved to start by the human (see `feedback/FEEDBACK_v0.6.2_2026-06-26_2025.md` —
> "The fixes look good to me! We should be good to move onto v0.7.0."). **No
> re-scope** beyond one transparent deferral: **recurring/scheduled payments** are
> deferred to **v0.9.0** because they require the simulation clock / scheduled-event
> processing already roadmapped there (building them now would be a non-functional
> stub) — see `M-09` and the human review. This milestone is where an operator
> **approval first MOVES money**. The **risky shared areas** are the shared contract
> (`M-01`), the **ledger** posting/reversal logic + the **routing** of the new
> endpoints + the **real-time** wiring (`M-02`/`M-03`), and the **seed** linkage
> (`M-04`); these are built **serially, first, and reviewed**, and the API + payload
> contract is **locked** before the two frontends (`M-05`/`M-06`) are parallelized.
>
> **MONEY DISCIPLINE (enforced + tested):** money moves ONLY via explicit
> `LedgerEntry` rows — never a stored/edited balance. Internal transfers post BOTH
> legs (`transfer`, posted) and **net to zero**. External value enters only via a
> bank-originated **posted credit** (`deposit`) and leaves only via a **posted
> debit** (`payment`). An **approval posts** the movement (pending→posted); a
> **rejection fails** it (pending→`failed`); a **reversal** flips a settled entry to
> `reversed` (reason + audit). Balances stay DERIVED. **No Prisma migration** is
> needed — `LedgerEntry` already carries the needed `status`/`origin`/`reason`, and
> the `OperationsRequest.payload` JSON carries the movement context + linked
> `ledgerEntryIds`. The simulation disclaimer stays visible; v0.2.0 auth / v0.3.0
> site / v0.4.0 dashboard / v0.5.0 ops console / v0.6.0 onboarding (incl. v0.6.1 +
> v0.6.2 fixes) are not regressed.

| ID | Title | Role | Acceptance criteria | Deps | Status | Result |
| --- | --- | --- | --- | --- | --- | --- |
| M-01 | Money-movement contract (shared DTOs + validators) | Backend/Shared (risky, serial) | New `packages/shared/src/money-movement.ts`: movement-kind enum (`internal_transfer`/`external_ach`/`wire`/`mobile_check_deposit`/`bill_pay`), per-kind direction + ledger origin, funding bounds, `TransferRequest`/`ExternalMovementRequest` + responses, the `MovementPayload` (carries `kind`/`amountMinor`/`direction`/account ids/counterparty/`ledgerEntryIds`), PURE validators (`validateTransfer`, `validateExternalMovement`) reused client+server, labels, and `movementOpsType(kind)`. Add **`bill_pay`** to `OPS_REQUEST_TYPES` (+ label + the `money` queue lane). Dependency-free; unit-tested; **contract locked before UI** | v0.6.2 | Done | `money-movement.ts` + `bill_pay` type; 16 shared unit tests; locked before UI |
| M-02 | Money-movement service (the ledger heart) | Backend/API (risky, serial) | `apps/backend/src/money/movements.ts`: `createTransfer` (validate ownership of BOTH accounts + sufficient available; post a `transfer` **debit + credit** atomically; nets to zero), `createExternalMovement` (create the **pending** ledger entry — credit for inbound `deposit`, debit for outbound `payment` — + a linked ops request whose payload carries `ledgerEntryIds`; reserves available for outbound), `postApprovedMovement` (pending→`posted`, set `postedAt`, audit), `failMovement` (pending→`failed`, audit), `reverseMovement` (posted→`reversed`, **reason required** + audit). Typed errors; balances stay DERIVED; settled total moves only by bank-originated credit / posted debit | M-01 | Done | `money/movements.ts`; atomic; balances derived; covered by 18 integration tests |
| M-03 | Routes + approval branches + real-time | Backend/API (risky, serial) | Extend `applyOperatorAction`: approving a money-movement request (`deposit`/`ach`/`wire`/`bill_pay`) with a movement payload **posts** the linked pending entries; rejecting **fails** them (atomic, audited) — mirrors the v0.6.0 onboarding branch. New `routes/money.ts`: `POST /api/transfers` (auth; internal transfer), `POST /api/movements` (auth; external reviewable movement, scoped to the user's source account). Ops `POST /api/ops/movements/:requestId/reverse` (ops/admin; reason). Register in `routes/index.ts`; all mutations **emit to the operators room** via `app.opsRealtime`. **API + payload contract locked here** before frontends | M-02 | Done | branches in `applyOperatorAction`; `routes/money.ts` + reverse route; real-time wired; contract locked |
| M-04 | Seed: wire Q-01 + ACH/bill-pay demos | Backend/API | Give the seeded **pending mobile-check deposit** ($320 credit) a key and **link** it to the `deposit-mobilecheck` request (so approving it posts → closes **Q-01**); add a **pending outbound ACH debit** ($450) linked to `ach-outbound`; add a **bill-pay** demo queue item + its pending debit; thread `ledgerEntryIds` into the request payload at apply time (new `key`/`linkLedgerEntryKeys` seed fields). `assertSeedInvariants` (transfers net to zero; settled credits bank-originated/transfer) still green; `db:reset` works | M-01,M-02 | Done | seed links deposit/ACH/bill-pay to pending entries; `assertSeedMovementIntegrity` (+5 tests); 58 entries / 11 ops items |
| M-05 | Customer money-movement UI | Frontend Customer | `lib/money.ts` client (`createTransfer`, `createMovement`, discriminated results, `credentials:'include'`); a **Move money** surface with tabs — Transfer between own accounts (immediate), Mobile check deposit, External ACH/wire, Pay a bill (reviewable) — reusing the shared validators; reachable from the Dashboard quick links + AccountDetail. Confirmation states; an internal transfer updates balances immediately; a reviewable movement shows as **Pending** in `TransactionList` until an operator posts it. Loading/error/offline states; disclaimer prominent; public site + protected routes not regressed | M-03 | Done | `lib/money.ts` + tabbed `/move-money`; wired from dashboard + account detail; e2e covered |
| M-06 | Ops money-movement context + reverse | Frontend Operations | `RequestDetailPanel` shows **money-movement context** (amount, direction, source/destination or biller, instrument) for `deposit`/`ach`/`wire`/`bill_pay` items — following the onboarding-context pattern, lifted defensively from `payload` — with copy that approving **posts** the movement (simulated); a **Reverse movement** affordance (reason required → `POST /api/ops/movements/:id/reverse` via `opsApi`) shown only for an **approved + posted** movement. Live sync + disclaimer not regressed | M-03 | Done | money-movement context + reverse affordance in `RequestDetailPanel`; `opsApi.reverseMovement` |
| M-07 | Tests (unit/integration + e2e) + verify | Testing/QA | Shared: money-movement validators/bounds/`movementOpsType` unit-tested. Backend integration: internal transfer posts both legs & **settled total unchanged** (nets to zero) + RBAC (can't transfer from an unowned account) + **insufficient-funds** rejected; external movement queues + writes a **pending** entry; operator **approve posts** it (incl. the seeded mobile-check deposit: pending→posted, customer line stops reading *Pending*, available updates — **Q-01**) with the money invariant held; **reject→failed**; **reverse→reversed**; audit rows; real-time emits; RBAC on every new route. seed-plan tests for the links. Playwright: a customer transfer journey + an operator approving a deposit so the customer sees it post. `npm run verify` + `npm run test:e2e` green | M-01..M-06 | Done | **240** Vitest (+39) + **37** e2e (+4) green; 0 lint warnings; runtime audit 0 |
| M-08 | Security review + milestone handoff | Security Reviewer + Process Scribe | Read-only security/simulation-safety audit (RBAC on every new route + the reverse endpoint; a customer can only move their own funds; no balance is ever stored/edited; transfers net to zero; reversal requires a reason + audit; no secrets; ledger discipline held). Then update ALL handoff docs (report, review incl. the `M-09` deferral, next prompt, state/next, board, experiment log, changelog, quality report, roadmap history), correct the stale "v0.6.2 tagged" wording, bump version to 0.7.0, annotated tag `v0.7.0` | M-01..M-07 | Done | Security review **PASS-with-findings** (all Low/tracked); all handoff docs updated; version 0.7.0; tag `v0.7.0` |
| M-09 | Recurring/scheduled payments — DEFERRED to v0.9.0 | Milestone Planner | Recurring/scheduled payments require the **simulation clock + scheduled-event processing** that the roadmap already places in **v0.9.0**; building a scheduler now (with no clock to fire it) would be a non-functional stub. Deferred transparently and carried forward; the human can pull it earlier if desired (raised in the v0.7.0 human review) | v0.7.0 | Deferred | Deferred to v0.9.0 (clock-dependent); documented in HUMAN_REVIEW_v0.7.0 + ROADMAP_HISTORY |

## Milestone v0.8.0 — Cards, fraud, disputes  ✅ Done (tag `v0.8.0` created locally; human pushes on merge)

> Approved to start by the human (see `feedback/FEEDBACK_v0.7.0_2026-06-27_0107.md` —
> "Everything looks great"). **One optional UI request accepted** as `R-03`: when an
> operator **Reverses** a money movement the queue badge still reads only "Approved";
> add a secondary **"Reversed"** tag wherever a request is listed (the request stays
> terminal-approved — no state-machine change). Folded in here because v0.8.0
> **disputes** also produce reversals. **No re-scope** otherwise; recurring/scheduled
> payments stay deferred to **v0.9.0** (`M-09`, needs the sim clock).
>
> **Risky shared areas serialized + reviewed first:** the **`Card` schema migration**
> (`C-02`, the one migration this milestone — additive: two new tables `Card` +
> `CardTravelNotice`, no existing table altered), the **shared contracts** (`C-01`
> cards, `FR-01`/`D-01` fraud+dispute payloads + the shared reversed helper), and the
> **ledger reversal generalization + ops-action resolution branches** (`D-02`/`FR-02`).
> The **API + payload + socket contract is LOCKED** (no new socket event — reuses
> `ops:request_changed`) before the two frontends (`C-04`/`FR-03`/`D-03` customer,
> `C-05`/`FR-04`/`D-04`/`R-03` operations) are parallelized.
>
> **MONEY DISCIPLINE (unchanged, enforced + tested):** card **lifecycle** moves NO
> money (issue/freeze/replace/travel are workflow + audit only — never a ledger
> write). Every money EFFECT still goes through the **ledger**: a dispute **upheld**
> or a fraud **confirmed** flips the disputed/suspicious entry `posted`→`reversed`
> (reason + audit), never a balance edit; filing a dispute flags the entry
> `disputed` (still counts as posted, shown flagged); a dispute **denied** returns it
> `disputed`→`posted`. Balances stay DERIVED. Simulation disclaimer stays visible; no
> regression to v0.2.0 auth / v0.3.0 site / v0.4.0 dashboard / v0.5.0 ops /
> v0.6.0–v0.6.2 onboarding+fixes / v0.7.0 money movement.

| ID | Title | Role | Acceptance criteria | Deps | Status | Result |
| --- | --- | --- | --- | --- | --- | --- |
| C-01 | Cards shared contract | Backend/Shared (risky, serial) | New `packages/shared/src/cards.ts`: `CARD_TYPES` (debit/credit), `CARD_NETWORKS` (visa/mastercard), `CARD_STATUSES` (active/frozen/lost/stolen/replaced/cancelled), `TRAVEL_NOTICE_STATUSES`; `CardDTO`/`TravelNoticeDTO`; request DTOs (issue/report/travel-notice) + responses; PURE validators (`validateIssueCard`, `validateTravelNotice`, `validateReportCard`) reused client+server; labels + `maskedCardNumber`/status helpers (`canFreezeCard`/`canReportCard`/`isTerminalCardStatus`). Dependency-free; unit-tested; barrel export | v0.7.0 | Done | `cards.ts` + barrel; 24 shared tests |
| C-02 | `Card` schema migration | Backend/API (risky, serial) | Additive Prisma migration `cards`: `Card` (account+cardholder FKs, type/network/last4/exp/status, `replacesCardId` self-link) + `CardTravelNotice` (card FK, destination/dates/status); relations on `Account`+`User`. No existing table altered. Generated through the mirrored schema engine | C-01 | Done | `cards` migration; `db:reset` green |
| C-03 | Card service + routes | Backend/API | `apps/backend/src/cards/cards.ts`: `issueCard` (access-checked, active account; generates last4/exp; audited), `listCards`/`listAccountCards`, `freezeCard`/`unfreezeCard`, `reportCard` (lost/stolen → old card terminal + **new replacement card** linked via `replacesCardId`), `addTravelNotice`/`listTravelNotices`/`cancelTravelNotice`. **No ledger writes.** `routes/cards.ts` (all `requireAuth`, scoped to accessible accounts); register in `routes/index.ts` | C-02 | Done | `cards/cards.ts` + `routes/cards.ts`; audited; covered by integration tests |
| FR-01 | Fraud shared contract + reversed helper | Backend/Shared (risky, serial) | In a new `packages/shared/src/risk.ts`: `FRAUD_RESPONSES` (`confirm_legit`/`report_fraud`), `FraudResponseRequest`, `FraudPayload` (`ledgerEntryId?`/`cardId?`/`amountMinor?`/`customerResponse?`/`resolution?`/`reversed?`). In `operations.ts`: a shared `isRequestReversed(payload)` helper (true when `payload.reversed === true`) powering **R-03** for movements + disputes + fraud | C-01 | Done | `risk.ts` fraud half + `isRequestReversed`; unit-tested |
| FR-02 | Fraud service + ops resolution | Backend/API (risky, serial) | `apps/backend/src/risk/fraud.ts`: `listFraudAlertsForUser` (pending `fraud_alert` items matched by subject email), `respondToFraudAlert` (records `customerResponse` in payload + audit + an **inbound** SimulatedEvent; pushes live; does not resolve). Extend `applyOperatorAction` for `fraud_alert`: **approve** = confirm fraud → reverse the linked posted/disputed entry (if any) + freeze the linked card (if any), set `payload.reversed`; **reject** = dismiss as legitimate (no money effect). Customer routes in `routes/risk.ts` (`GET /api/fraud-alerts`, `POST /api/fraud-alerts/:id/respond`) | FR-01,C-03 | Done | `risk/fraud.ts` + ops branch + routes; reversal via shared core; tested |
| D-01 | Dispute shared contract | Backend/Shared | In `risk.ts`: `DISPUTE_REASONS`, `DisputeRequest` (`ledgerEntryId`+`reason`), `DisputePayload` (`ledgerEntryId`/`accountId`/`amountMinor`/`reason`/`resolution?`/`reversed?`); `validateDispute` pure validator + labels | C-01 | Done | `risk.ts` dispute half; unit-tested |
| D-02 | Dispute service + ledger reversal + ops resolution | Backend/API (risky, serial) | Generalize reversal: a `reverseLedgerEntries(entryIds, reason, actor, tx)` core (flips `posted`\|`disputed`→`reversed`) reused by `reverseMovement` + disputes + fraud. `apps/backend/src/risk/disputes.ts`: `createDispute` (access-checked; flags the entry `posted`→`disputed`; creates a `dispute` ops request carrying the entry id; pushes live; audited). Extend `applyOperatorAction` for `dispute`: **approve** = uphold → reverse the disputed entry (`disputed`→`reversed`), set `payload.reversed`/`resolution`; **reject** = deny → `disputed`→`posted`. `POST /api/disputes` in `routes/risk.ts` | D-01,FR-01 | Done | shared `reverseLedgerEntries`; `risk/disputes.ts` + ops branch + route; balances derived; tested |
| C-04 | Customer cards UI | Frontend Customer | `lib/cards.ts` client; a portal **`/cards`**-equivalent **Cards** page (route `/cards` is the public marketing page → use **`/wallet`** for the portal manager) listing the customer's cards with masked number/brand/status, and self-service **freeze/unfreeze**, **report lost/stolen → replacement**, and **travel notices** (add/cancel). Reachable from Dashboard quick links. Loading/error states; disclaimer prominent; no marketing-site regression | C-03 | Done | `lib/cards.ts` + `/wallet` Cards manager; wired from dashboard |
| FR-03 | Customer fraud-alert UI | Frontend Customer | `lib/risk.ts` client; surface pending **fraud alerts** (on the Dashboard and/or a panel) with **Confirm it was me / Report fraud** actions feeding `POST /api/fraud-alerts/:id/respond`; confirmation + error states | FR-02 | Done | fraud-alert confirm/deny on dashboard |
| D-03 | Customer dispute UI | Frontend Customer | From `TransactionList`/AccountDetail, a **Dispute this transaction** affordance on a posted entry → `POST /api/disputes` (reason); the entry then shows **Disputed**; confirmation + error states | D-02 | Done | dispute affordance on posted transactions; disputed flag shown |
| FR-04 / D-04 | Ops fraud + dispute handling | Frontend Operations | `RequestDetailPanel` shows **fraud context** (merchant/amount + the customer's confirm/deny response) and **dispute context** (disputed transaction + reason), with copy explaining that **approve** reverses/blocks and **reject** dismisses/denies; reuse the existing action bar (no new endpoint). Live sync not regressed | FR-02,D-02 | Done | fraud + dispute context in `RequestDetailPanel` |
| R-03 | Ops "Reversed" tag | Frontend Operations | A `ReversedBadge` rendered next to the **Approved** status badge wherever a request is listed — `QueueRequestCard`, `OpsDashboard` lists, `RequestDetailPanel` — driven by the shared `isRequestReversed(request.payload)`. The request stays terminal-approved; the badge is purely derived | FR-01 | Done | `ReversedBadge` on queue/dashboard/detail; from `isRequestReversed` |
| C-06 | Seed: cards + linked fraud/dispute demos | Backend/API | Add 1–2 seeded **cards** for Avery (a debit card on checking; optionally a credit card) + a `cards` seed-plan section + invariant guard; **link** the seeded `fraud-card` alert to the QuickFuel **card** + its ledger entry (keyed) and the `dispute-trattoria` item to the Trattoria entry (keyed, seeded `disputed`) so both resolve end-to-end. `db:reset` green; seed invariants hold | C-02,D-02,FR-02 | Done | seeded cards + linked fraud/dispute; `assertSeedCardIntegrity` |
| T-01 | Tests (unit/integration + e2e) + verify | Testing/QA | Shared: card + dispute validators/helpers + `isRequestReversed` unit-tested. Backend integration: issue/freeze/unfreeze/report(replace)/travel-notice (no ledger effect; RBAC on every route); file dispute flags `disputed`; **uphold reverses** (settled total drops by the amount; balance derived) + **deny returns to posted**; fraud respond records response; **confirm-fraud reverses + freezes card**; audit rows; real-time emits. Playwright: a customer card freeze + a dispute→operator-reverse journey + the **Reversed tag** visible. `npm run verify` + `npm run test:e2e` green | C-01..R-03,C-06 | Done | unit/integration + e2e green; counts in MILESTONE_REPORT_v0.8.0 |
| S-01 | Security review + milestone handoff | Security Reviewer + Process Scribe | Read-only security/sim-safety audit (RBAC on every new card/dispute/fraud route; a customer can only act on their own cards/transactions; card lifecycle writes no ledger; every money effect is a ledger status change with reason+audit; no secrets). Then update ALL handoff docs (report, review, next prompt, state/next, board, experiment log, changelog, quality report, roadmap history if changed), bump version to 0.8.0, annotated tag `v0.8.0` | C-01..T-01 | Done | see MILESTONE_REPORT/HUMAN_REVIEW v0.8.0; version 0.8.0; tag `v0.8.0` |

## Milestone v0.9.0 — Simulation clock + recurring/scheduled payments (+ statement cycles)  🚧 In Progress

> Approved to start by the human (see `feedback/FEEDBACK_v0.8.0_2026-06-27_0219.md` —
> "All looks good so far. Keep up the good work!" — a clean "continue"-style approval).
> **No re-scope.** This milestone delivers the **clock-dependent slice** of the v0.9.0
> roadmap theme: a controllable **simulation clock**, a **clock-driven scheduler** for
> **recurring/scheduled payments** (the carried `M-09`, deferred from v0.7.0 *because*
> it needs the clock), and **statement cycles** derived from the clock. Loans / CDs /
> interest accrual remain in the broader v0.9.0+ theme and are **not** in this slice
> (tracked in `ROADMAP_HISTORY.md`).
>
> **Risky shared areas serialized + reviewed first** (the constitution's list — schema,
> routing, real-time, **ledger**, the **clock/scheduler**): the **shared contracts**
> (`SC-01`), the **`PaymentSchedule` migration** (`SC-02`, the one additive migration —
> a new table + back-relations, no existing table altered), the **clock service**
> (`SC-03`), the **scheduler** (`SC-04`, reuses the v0.7.0 money-movement service — no
> new ledger mechanics), and the **routes + real-time** (`SC-05`). The **API + payload +
> socket contract is LOCKED** at `SC-05` (the only real-time change is a backward-
> compatible field added to the existing `sim:heartbeat`; no new socket event — fired
> reviewable schedules reuse `ops:request_changed`) before the two frontends (`SC-07`
> customer, `SC-08` operations) are parallelized. The design is recorded in
> **`docs/process/decisions/ADR-0002-simulation-clock-and-scheduler.md`**.
>
> **MONEY DISCIPLINE (unchanged, enforced + tested):** a scheduled fire moves money
> ONLY by appending `LedgerEntry` rows — never a stored/edited balance. A scheduled
> **internal transfer** posts BOTH `transfer` legs at the due date (nets to zero); a
> scheduled **bill pay** writes a **pending** `payment` debit + a linked ops item that
> an operator approves (pending→posted) exactly like a manual v0.7.0 movement. The
> **scheduler** dates each fired entry at its simulated **due date** (and schedule
> due-dates + the statements window read the **simulation clock**); immediate
> transfers/movements, ops actions, card lifecycle, audit, and events keep wall-clock
> — keeping same-session entries monotonic — documented in ADR-0002. The clock is
> **forward-only** (you cannot rewind — keeps the ledger honest), advanced only by an
> **ops_agent/admin**, and **audited**. Balances stay DERIVED. Simulation disclaimer
> stays visible; no regression to v0.2.0 auth / v0.3.0 site / v0.4.0 dashboard / v0.5.0
> ops / v0.6.0–v0.6.2 onboarding+fixes / v0.7.0 money movement / v0.8.0 cards/fraud/
> disputes.

| ID | Title | Role | Acceptance criteria | Deps | Status | Result |
| --- | --- | --- | --- | --- | --- | --- |
| SC-01 | Clock + schedule + statement shared contracts | Backend/Shared (risky, serial) | New `packages/shared/src/schedules.ts`: `SCHEDULE_FREQUENCIES` (`once`/`weekly`/`monthly`), `SCHEDULE_KINDS` (`internal_transfer`/`bill_pay`), `SCHEDULE_STATUSES` (`active`/`completed`/`cancelled`); `ScheduleDTO`, `CreateScheduleRequest`/`NormalizedCreateSchedule`, response DTOs; PURE `validateCreateSchedule` (reuses `MOVEMENT_LIMITS`), `addInterval(date,freq)` (calendar-month-safe, with month-end clamp), labels/`describeSchedule`. New `packages/shared/src/clock.ts`: `SimulationClockDTO`, `AdvanceClockRequest` (+ bounds), `ADVANCE_CLOCK_LIMITS`, pure `advanceBy`/`clampAdvance`. New `packages/shared/src/statements.ts`: `StatementPeriodDTO`, pure `buildStatementPeriods(now, monthsBack)` + `summarizeStatementPeriod(entries, period)` (opening/closing/credits/debits, posted-only). Barrel exports; dependency-free; unit-tested; **contract locked before UI** | v0.8.0 | Done | `schedules.ts` (+`addInterval`/validators), `clock.ts`, `statements.ts`; barrel; **45** shared tests added |
| SC-02 | `PaymentSchedule` schema migration | Backend/API (risky, serial) | Additive Prisma migration `scheduled_payments`: `PaymentSchedule` (owner FK, `kind`, `fromAccountId` FK, nullable `toAccountId` FK, `counterparty`/`memo`, `amountMinor`, `frequency`, `nextRunAt`, `status`, `lastRunAt`/`runCount`) + back-relations on `User`+`Account`. **No existing table altered.** Generated through the mirrored schema engine; `db:reset` green | SC-01 | Done | `scheduled_payments` migration; `PaymentSchedule` + relations; `db:reset` green |
| SC-03 | Clock service + advance (forward-only, audited) | Backend/API (risky, serial) | `apps/backend/src/clock/clock.ts`: `getClockState(db)` (reads/creates the singleton), `simulationNow(db)` (the authoritative sim "now"), `advanceClock(db, byMs, actor)` — **forward-only** (rejects ≤0 / over the bound), sets `currentTime`, writes an `AuditLog` row, returns the new state. Typed `ClockError` | SC-02 | Done | `clock/clock.ts`; forward-only + audited; covered by integration tests |
| SC-04 | Scheduler + schedule service (reuse money service) | Backend/API (risky, serial) | `apps/backend/src/scheduler/scheduler.ts`: `runDueSchedules(upTo, realtime?)` — for each active schedule with `nextRunAt ≤ upTo`, FIRE it via the **v0.7.0 money service** dated at `nextRunAt` (`internal_transfer`→`createTransfer` both legs; `bill_pay`→`createExternalMovement` pending + ops item), then advance `nextRunAt` (recurring, via `addInterval`) or mark `completed` (once); a **bounded catch-up loop** (cap per schedule per advance, logged if hit); insufficient-funds / access errors → skip that occurrence with a **simulated event** + audit (never throws out). Returns a structured fired-summary (+ ops requests/events to emit). `apps/backend/src/scheduler/schedules.ts`: `createSchedule` (access-checked via the money primitives; `nextRunAt` from sim now + `firstRunInDays`), `listSchedulesForUser`, `listAllSchedules`, `cancelSchedule` (owner-only, active-only). Typed `ScheduleError`; **every fire is a ledger entry; nothing edits a balance** | SC-03 | Done | `scheduler/scheduler.ts` + `scheduler/schedules.ts`; reuses `createTransfer`/`createExternalMovement`; atomic per fire; covered by integration tests |
| SC-05 | Routes + real-time + sim-now threading (LOCK CONTRACT) | Backend/API (risky, serial) | `routes/schedules.ts` (customer, `requireAuth`): `POST /api/schedules` (create), `GET /api/schedules` (own), `POST /api/schedules/:id/cancel`. `routes/clock.ts`: `GET /api/clock` (`requireAuth`, any role — sim date for display), `POST /api/ops/clock/advance` (`requireRole('ops_agent','admin')` → `advanceClock` then `runDueSchedules`, emits fired ops items/events via `app.opsRealtime`, returns new clock + fired summary), `GET /api/ops/schedules` (ops/admin, all schedules). The **scheduler** dates fires at simulated due dates and the **statements** window reads `simulationNow()`; immediate transfers/movements + ops actions stay on wall-clock `new Date()` (a static sim clock would collapse same-session entries onto one `createdAt` — see ADR-0002). Extend the `sim:heartbeat` payload with `simulationTime` (best-effort clock read in `attachRealtime`; **backward-compatible — no new socket event**). Register in `routes/index.ts`. **API + payload + socket contract LOCKED here** before frontends | SC-04 | Done | `routes/schedules.ts` + `routes/clock.ts`; sim-now threaded; heartbeat carries `simulationTime`; contract locked |
| SC-06 | Seed: demo schedules | Backend/API | Add 1–2 seeded **payment schedules** for Avery (a **monthly internal transfer** checking→savings; a **monthly bill pay**) due **soon** (so a small clock advance fires them) + a `schedules` seed-plan section keyed to declared accounts; `assertSeedScheduleIntegrity` (keys unique; accounts declared; kinds/freqs/statuses known; `bill_pay` has a counterparty; `internal_transfer` has a distinct `toAccount`); seed-plan tests; existing money/ops/card invariants still pass; `db:reset` green | SC-02,SC-04 | Done | seeded schedules + `assertSeedScheduleIntegrity`; seed-plan tests; `db:reset` green |
| ST-01 | Statement cycles (derived from the clock) | Backend/API + Frontend Customer | Backend `GET /api/accounts/:id/statements` (`requireAuth`, access-scoped like `/transactions`) returns monthly **statement periods** ending at **sim now** with a per-period summary (opening/closing balance + credits/debits) derived read-only from the account's **posted** ledger via the shared pure helpers (no stored statement, no real PDF). Customer `/statements` upgraded from the placeholder to a real, clearly-simulated per-account month list + summary | SC-01,SC-05 | Done | `routes/accounts.ts` statements endpoint via shared `summarizeStatementPeriod`; `/statements` reworked; tested |
| SC-07 | Customer UI — schedules + statements | Frontend Customer | `lib/schedules.ts` client (mirrors `lib/money.ts` — `credentials:'include'`, discriminated results, never-throws); a portal **`/scheduled-payments`** page: create a schedule (kind=transfer/bill-pay, accounts/biller, amount, frequency, first-run) reusing the shared validator + the MoveMoney form primitives, **list** the user's schedules (next run, frequency, status) with **cancel**, and show the current **simulated date** (from `GET /api/clock`). Dashboard quick link. Statements page (ST-01). Loading/error/empty states; disclaimer prominent; no marketing-site/dashboard regression | SC-05,ST-01 | Done | `lib/schedules.ts` + `/scheduled-payments`; dashboard quick link; statements UI; sim-date shown |
| SC-08 | Operations UI — simulation clock + schedules view | Frontend Operations | Promote **"Simulation clock"** from `futureNav` to a real `/clock` route (ops/admin). The page shows the current **simulated date** (live via the `sim:heartbeat` `simulationTime`), a **fast-forward** control (advance by N days/hours → `POST /api/ops/clock/advance`) that shows what **fired**, and a **schedules** list (`GET /api/ops/schedules`). `opsApi` methods (`fetchClock`/`advanceClock`/`fetchSchedules`); `useOpsSocket`/data-context expose the live sim time. A scheduled `bill_pay` review item reuses the existing money-movement context in `RequestDetailPanel` (it is a `bill_pay` movement). Live sync + disclaimer not regressed | SC-05 | Done | `/clock` page + nav; `opsApi` clock/schedules; heartbeat sim-time wired; bill-pay context reused |
| SC-09 | Tests (unit/integration + e2e) + verify | Testing/QA | Shared: `validateCreateSchedule`, `addInterval` (incl. month-end), clock `advanceBy`/bounds, statement helpers unit-tested. Backend integration: **advancing the clock fires due schedules** → real ledger entries (internal transfer **nets to zero** — settled total unchanged; bill-pay writes a **pending** entry + ops item; operator approve posts it); **catch-up** fires multiple missed periods; **cancel** stops future fires; **forward-only** clock (rejects rewind); insufficient-funds **skips** with an event; **RBAC** on every new route (customer can't advance the clock or read all schedules; can only schedule on own accounts); statements derivation; seed-plan schedule tests; **money invariant held** (balances derived). Playwright: a customer creates a schedule; an operator advances the clock; the fired payment is visible. `npm run verify` + `npm run test:e2e` green | SC-01..SC-08 | Done | counts in MILESTONE_REPORT_v0.9.0 |
| SC-10 | Security review + milestone handoff | Security Reviewer + Process Scribe | Read-only security/sim-safety audit (RBAC on every schedule/clock route; clock advance is ops/admin + audited + forward-only; a customer schedules only on accounts they hold and the firing actor is the schedule owner — no privilege gain; every fire is a ledger entry with no balance edit; the scheduler can't be steered onto an unrelated account/entry; no secrets). Then update ALL handoff docs (report, review, next prompt, state/next, board, experiment log, changelog, quality report, roadmap history), bump version to 0.9.0, annotated tag `v0.9.0` | SC-01..SC-09 | Done | see MILESTONE_REPORT/HUMAN_REVIEW v0.9.0; version 0.9.0; tag `v0.9.0` |

> Later milestones (v0.9.0+ loans/CDs/interest and v1.0.0) are summarized in
> `ROADMAP.md` and will be decomposed into tasks here when they become active. The
> v0.9.0 **clock + scheduler + statements** slice (this session) realizes the carried
> **recurring/scheduled payments** (`M-09`); **loans / CDs / interest accrual** remain
> in the broader v0.9.0+ theme (see `ROADMAP_HISTORY.md`).

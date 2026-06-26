# QUALITY_REPORT

Quality status per milestone: checks, test results, dependency audit, and known
issues. Updated at every milestone (and whenever status materially changes).

---

## v0.6.1 — Operations console fixes (patch) — 2026-06-26

A patch release fixing the two v0.6.0-review bugs in the operations console. Changes
are confined to the **operations app** + the shared version string — no backend,
schema, migration, ledger, contract, auth, public-site, dashboard, or onboarding
change.

### Gate: `npm run verify` ✅ PASS
- **Lint** (ESLint 9 flat) — pass, **0 errors, 0 warnings**.
- **Typecheck** (`tsc -p` × 4 workspaces) — pass.
- **Unit/integration tests** (Vitest) — **189 passed / 189** (unchanged; this patch
  added no unit tests and regressed none — the fixes are in the operations app,
  which is covered by build + Playwright).
- **Build** — backend (tsup) + customer (vite) + operations (vite) all build.

### E2E (Playwright) ✅ PASS
- **32 passed / 32** (30 + **2 new** in `operations.spec.ts`):
  - **B-04 regression** — "an expired/rejected ops session returns the operator to
    sign-in (no dead 'Not authenticated')": after a normal operator login, force
    every `/api/ops/**` call to **401** (route interception, simulating an
    expired/rejected session), reload, and assert the app **bounces to the sign-in
    screen** with the "session has ended" notice and shows **no** dead
    "Not authenticated" text; then re-login and confirm the live queue loads.
  - **B-03 regression** — "the menu toggle reveals navigation and can switch
    sections": at a 600px viewport, assert the sidebar links are hidden, the ☰
    toggle is visible, opening it navigates to Request queues, and the menu
    auto-closes after navigating.

### Diagnosis evidence (B-04 — why it wasn't a backend bug)
Reproduced in escalating fidelity: backend over HTTP (curl cookie jar) returns the
full queue for a logged-in operator; the full submit→approve→provision→customer-
sign-in loop works over HTTP; a clean Chromium profile loads the queue with all
cards; only an **invalid/expired session mid-use** reproduced the dead-end. The fix
targets that client-side reconciliation gap.

### Security / safety
No security-surface change. No money-path, auth, RBAC, schema, or socket change; no
secrets added; `.env` still ignored; simulation disclaimer still visible in both
apps + README. The v0.6.0 security review (PASS) still stands.

### Known issues / follow-ups (unchanged from v0.6.0)
- Pre-existing hardening follow-ups (CSRF token, config-driven cookie `secure`,
  helmet + login rate-limit) and the dev-tooling npm-audit advisories (vite, vitest,
  esbuild) remain tracked for a hardening pass; runtime audit clean.
- Frontend component **unit** tests remain deferred; the apps are covered by build +
  Playwright journeys + backend/contract tests. (The two new e2e tests extend that
  coverage to the ops console's responsive nav and session-recovery behavior.)

---

## v0.6.0 — Onboarding and account opening — 2026-06-26

### Gate: `npm run verify` ✅ PASS
- **Lint** (ESLint 9 flat) — pass, **0 errors, 0 warnings**.
- **Typecheck** (`tsc -p` × 4 workspaces) — pass.
- **Unit/integration tests** (Vitest) — **189 passed / 189** (145 + 44 new):
  `@simbank/shared` `onboarding.test.ts` (**11** — the pure validators
  `validateOpenAccount` / `validateInvitation` / `validateAdminCreateUser`,
  funding bounds, product/email guards) and **5** new `operations.test.ts` cases
  (the `note` action: not a decision button, allowed on terminal, no status
  change, label); `@simbank/backend` `routes/onboarding.test.ts` (**23** — public
  submit feeds the queue + creates no user/money, approval provisions
  user/account/**bank-originated funding** with the settled-total money invariant,
  rollback on duplicate email, reject, the `note` action on pending **and** on a
  terminal request, the full invitation invite→accept→grant + RBAC matrix, and
  admin create-user incl. funded-requires-reason / duplicate / non-admin) and **9**
  new `seed-plan.test.ts` onboarding-integrity cases. All prior suites still green.
- **Build** — backend (tsup) + customer (vite) + operations (vite) all build.

### E2E (Playwright) ✅ PASS
- **30 passed / 30** (25 + 5 new): `onboarding.spec.ts` — a visitor submits a
  simulated open-account application → confirmation; an operator sees the
  onboarding **application context**, approves it (proving **B-01**: the open
  detail panel reacts to the live queue state — its terminal "you can still add a
  note" hint appears after a card action) and **adds a note after the decision**
  (**B-02**); the admin-only **Create demo user** page is available to an admin and
  hidden from a non-admin operator; a customer sees a pending joint invitation in
  their inbox. The existing `public-site.spec.ts` open-account test was updated for
  the new working form (it was the placeholder before). All other prior specs green.

### Schema migration (second since v0.2.0) — additive
`onboarding` adds `OnboardingApplication` (1:1 with its `OperationsRequest`,
holding the bcrypt password hash server-side) and `AccountInvitation`. The
generated SQL was reviewed: only `CREATE TABLE` + indexes — the money/auth tables
and the v0.5.0 ops tables are untouched. `npm run db:reset` rebuilds everything.

### Money discipline
The first milestone where an operator approval CREATES money — and it stays inside
the ledger: onboarding **initial funding** posts one bank-originated `deposit`
entry (posted, audited) inside the approval transaction; admin **funding** posts an
`adjustment` requiring a reason + audit. Application submission, the `note` action,
and joint invites write **no** ledger entry. A test asserts the system-wide settled
total moves by **exactly** the funded amount; balances stay derived. Provisioning is
atomic and precondition-guarded (duplicate email blocked + rolled back).

### Security review (pre-gate, read-only) — ✅ PASS
The Security/Permissions reviewer verified all seven focus areas: the applicant
password is bcrypt-hashed immediately and **never** serialized into any DTO/queue
payload (regression-tested); every new route is correctly gated (public submit
creates nothing on its own; **owner-only** invite; accept is strictly
invitee-email-gated and can't grant arbitrary access; admin-only create-user + note
ops-only); money discipline + audit coverage hold; all free text is length-bounded
twice (shared validator + route slice) and email normalized; messaging is
`SimulatedEvent`-only with no real-provider code and the disclaimer is present in
the new UI; v0.2.0 auth / v0.3.0 isolation / the `/api/admin/users` no-hash
guarantee / v0.5.0 socket-room RBAC are intact. **Verdict: PASS — no Critical /
High / Medium findings.** The prior v0.5.0 **Low SEC-4** (cap a user-supplied
applicant name) is **closed** — `validateOpenAccount` bounds the name (≤80) and all
free text. New **Low** hardening notes (all accepted for a local simulation):

| ID | Item | Disposition | Target |
| --- | --- | --- | --- |
| SEC-5 | The public `POST /api/onboarding/applications` is unauthenticated + unthrottled (a loop could flood the queue); does **not** enable user enumeration (generic response either way) | Accepted for the simulation; first route to cover if a project-wide rate-limit lands | v1.0.0 hardening (with SEC-3) |
| SEC-6 | An admin can create another `admin`/`ops_agent` via the console | Accepted — intended "create demo user of any role"; admin is already fully trusted and the action is audited (`admin_create_user`) | — (by design) |
| SEC-7 | An invite to an email with no user yet persists until that user exists; acceptance is still strictly email-gated | Accepted — matches the "invite then they join" flow; no access leak | — (by design) |

(SEC-4 from v0.5.0 is closed this milestone. The reviewer's seed-integrity note —
assert a seeded applicant email isn't an existing seeded user — was **applied** in
`assertSeedOnboardingIntegrity`. The earlier **Low** follow-ups SEC-1 CSRF / SEC-2
config-driven cookie `secure` / SEC-3 helmet + rate-limit remain accepted and
tracked; v0.6.0 adds a public + several authed `POST`s, but they are validated,
audited where stateful, and `SameSite=Lax` + the CORS allowlist still mitigate CSRF
on localhost — SEC-1 stays targeted at v0.7.0.)

### Dependency audit
- **No new runtime advisories.** v0.6.0 added no runtime dependencies. The prior
  **dev/test-tooling advisories** (vite, vitest, esbuild — dev-only) are unchanged
  and tracked in the v0.1.0 section for the v1.0.0 hardening pass.

### Known limitations / deferred
- **Deposit posting (pending → posted) is v0.7.0** — approving an existing pending
  mobile-check-deposit does not yet update the customer's line (it is money
  movement). Recorded as an explicit v0.7.0 acceptance note (the v0.5.0 review's
  Q-01). v0.6.0 only creates money for **account opening**.
- **Customer-facing MFA/2FA at login** stays deferred; v0.6.0 uses the
  simulated-messaging seam for **onboarding** identity/MFA only (the v0.5.0 review's
  Q-02). Login-time 2FA arrives with the auth follow-ups.
- **Frontend component unit tests** remain deferred; the new UI is covered by build
  + the Playwright journeys + the backend/contract tests (+ the pure onboarding
  validators are unit-tested in shared). Revisit at a UI-heavy milestone.

### Sandbox-only notes (do not affect users/CI)
- Prisma engines curl-mirrored (query-engine library + schema-engine for
  `debian-openssl-3.0.x`) and Playwright pointed at the pre-installed Chromium —
  same approach as Sessions 1–5. This session also created the real `onboarding`
  migration through the mirrored schema engine; standard installs / `npx playwright
  install` work elsewhere.

### Overall
**v0.6.0 meets the quality bar.** Gate green (189 + 30 tests, 0 lint warnings), the
open-account flow feeds the operations queue and an approval provisions a real
account with **bank-originated, audited** initial funding (money discipline asserted),
the two v0.5.0 review fixes (B-01, B-02) shipped with e2e coverage, the two review
questions answered in the review docs, security review PASS, open items tracked
honestly. No blockers.

---

## v0.5.0 — Operations simulator core — 2026-06-25

### Gate: `npm run verify` ✅ PASS
- **Lint** (ESLint 9 flat) — pass, **0 errors, 0 warnings**.
- **Typecheck** (`tsc -p` × 4 workspaces) — pass.
- **Unit/integration tests** (Vitest) — **145 passed / 145** (93 + 52 new):
  `@simbank/shared` `operations.test.ts` (**18** — the action state machine,
  terminal/transition rules, guards, labels, queue mapping, status counts);
  `@simbank/backend` `routes/ops.test.ts` (**24** — RBAC matrix, queue/filters,
  each action transition, invalid/404/409, audit rows, real-time emissions via a
  recording publisher, simulated events, and a money-discipline assertion),
  `realtime.test.ts` (**1** integration — real socket clients prove the ops-room
  RBAC), and **9** new `seed-plan.test.ts` ops-integrity cases. All prior suites
  still green.
- **Build** — backend (tsup) + customer (vite) + operations (vite, 102 modules)
  all build.

### E2E (Playwright) ✅ PASS
- **25 passed / 25** (22 + 3 new): `operations.spec.ts` — operator → live dashboard
  (queue snapshot + recent events + Live indicator); action a queue item and see it
  update; send a simulated event and see it appear live. All prior specs still green.

### Schema migration (first since v0.2.0) — additive
`operations_core` fleshes out `OperationsRequest` and adds `SimulatedEvent`. The
generated SQL was reviewed: it rebuilds only `OperationsRequest` (preserving rows
via `INSERT ... SELECT`) and creates `SimulatedEvent` — the money/auth tables
(`User`, `Account`, `LedgerEntry`, `Session`, `AccountAccess`, `LoginEvent`,
`AuditLog`, `SimulationClock`) are untouched.

### Money discipline
Operator actions change a request's **workflow status** + write an `AuditLog` row;
they write **no** `LedgerEntry`. Asserted by `ops.test.ts` ("operator actions never
create ledger entries"). Balances stay derived. Ledger effects of an approval arrive
with money movement (v0.7.0).

### Security review (pre-gate, read-only) — ✅ PASS
The Security/Permissions reviewer verified: every `/api/ops/*` route is auth- +
role-gated (customers/joint → 403, tested); ops events broadcast to the `ops` room
only with default-deny join logic; operator actions write no ledger and everything
is audited; inputs validated against shared enums with note/summary caps and a
clamped `limit`; no real provider SDKs/URLs and events are labelled simulated in code
+ UI; no secrets (only NON-SECRET bcrypt-hashed demo passwords); v0.2.0 auth /
v0.3.0 per-surface isolation / the `/api/admin/users` no-hash guarantee intact. Its
one **Medium** (socket-room RBAC lacked an automated test) was **closed in this
milestone** (`realtime.test.ts`, real clients). New **Low** tracked below.

| ID | Item | Why deferred | Target |
| --- | --- | --- | --- |
| SEC-4 | Cap/sanitize an applicant `subjectName` at creation (consistent with `MAX_NOTE_LENGTH`) | In v0.5.0 the queue is seed-only, so subjects are bounded; the cap matters once onboarding intake becomes user-facing | v0.6.0 (onboarding) |

(The prior **Low** follow-ups SEC-1 CSRF, SEC-2 config-driven cookie `secure`, SEC-3
helmet + login rate-limit remain accepted and tracked. v0.5.0 **does** add
state-mutating `POST` endpoints — operator actions + simulate-event — but they are
role-gated to bank staff and `SameSite=Lax` + the CORS allowlist still mitigate CSRF
on localhost; SEC-1 stays targeted at v0.7.0 when customer-facing money movement
lands.)

### Dependency audit
- **No new runtime advisories.** v0.5.0 added no runtime dependencies (Socket.IO
  was already present; `socket.io-client` is used by the apps and, new this
  milestone, declared as a backend **devDependency** for the socket integration
  test). The prior **dev/test-tooling advisories** (vite, vitest, esbuild — dev-only)
  are unchanged and tracked in the v0.1.0 section for the v1.0.0 hardening pass.

### Known limitations / deferred
- **Operator actions are workflow-only** — no ledger effect until money movement
  (v0.7.0). Deliberate and asserted.
- **Simulated events are recorded, never sent** — no real provider, ever.
- **Frontend component unit tests** remain deferred; the console is covered by build
  + the Playwright operator journey + the backend/contract tests (+ the pure ops
  logic is unit-tested in shared). Revisit at a UI-heavy milestone.

### Sandbox-only notes (do not affect users/CI)
- Prisma engines curl-mirrored (query-engine library + schema-engine for
  `debian-openssl-3.0.x`) and Playwright pointed at the pre-installed Chromium —
  same approach as Sessions 1–4. This session also created a real Prisma
  **migration** through the mirrored schema engine; standard installs / `npx
  playwright install` work elsewhere.

### Overall
**v0.5.0 meets the quality bar.** Gate green (145 + 25 tests, 0 lint warnings), the
operations console is live and real-time with access-controlled sockets, money
discipline preserved and asserted, security review PASS (its Medium closed
in-milestone), open items tracked honestly. No blockers.

---

## v0.4.0 — Customer banking dashboard — 2026-06-25

### Gate: `npm run verify` ✅ PASS
- **Lint** (ESLint 9 flat) — pass, **0 errors, 0 warnings**.
- **Typecheck** (`tsc -p` × 4 workspaces) — pass.
- **Unit/integration tests** (Vitest) — **93 passed / 93** (70 + 23 new):
  `@simbank/shared` `transactions.test.ts` (**13** — derivation, ordering, running
  balance, grouping, filtering) and `@simbank/backend` `routes/transactions.test.ts`
  (**10** — full access matrix incl. IDOR 403/404 + server-side filters). All prior
  suites still green.
- **Build** — backend (tsup) + customer (vite) + operations all build.

### E2E (Playwright) ✅ PASS
- **22 passed / 22** (14 + 8 new): `dashboard.spec.ts` covers overview → detail →
  transactions, pending-vs-posted visible, search + status filter, the statements
  placeholder, **R-01** (scroll-to-top on nav + `/about#security` deep-link), and
  **R-02** (logged-in "Visit your Dashboard" CTAs + the already-logged-in `/login`
  panel). All prior auth/public-site/session-isolation/smoke specs still green.

### Scope decision — no schema migration
A transaction is an existing `LedgerEntry` row, so v0.4.0 added **no Prisma
migration**: a pure shared contract + derivation, a richer dated seed, one
access-scoped read endpoint, and the dashboard UI. Balances + running balance are
DERIVED server-side; there is still no stored/editable balance field.

### Security review (pre-gate, read-only) — ✅ PASS, no new findings
The Security/Permissions reviewer verified: `GET /api/accounts/:id/transactions`
reuses the v0.2.0 access primitive (`getAccountRelationship`) → IDOR-safe (unknown
id → 404, no relationship → 403, ops/admin → 403 on customer accounts), confirmed
by `transactions.test.ts`; the DTO exposes only display fields (no hashes/PII/
cross-account data); `?q=&group=&origin=` are whitelisted (unknown dropped) and
filtering is in-memory over already-authorized rows with no raw SQL / dynamic
`RegExp` (no injection/ReDoS); seed passwords stay non-secret + bcrypt-hashed and
the money invariants hold; the R-02 flows add no client-side trust for protection
(`RequireAuth` + server `requireAuth` unchanged), no open redirect, and logout
still revokes server-side. The three **Low** follow-ups (SEC-1 CSRF, SEC-2
config-driven cookie `secure`, SEC-3 helmet + login rate-limit) remain accepted and
tracked (targets v0.7.0 / v1.0.0); v0.4.0 adds no state-mutating endpoint, so the
CSRF posture is unchanged.

### Dependency audit
- **No new runtime advisories.** The dashboard added no runtime dependencies. The
  prior **dev/test-tooling advisories** (vite, vitest, esbuild — dev-only) are
  unchanged and remain tracked in the v0.1.0 section for the v1.0.0 hardening pass.

### Known limitations / deferred
- **Frontend component unit tests** remain deferred; the dashboard is covered by
  build + the Playwright journeys (+ the pure transaction logic is unit-tested in
  shared). Revisit at a UI-heavy milestone.
- **Statements** are a labelled placeholder (no real PDFs) until v0.9.0 statement
  cycles; **money movement** (which creates new transactions) is v0.7.0 — today's
  transaction history is seeded.
- Search/filter runs **client-side** in the UI over the fetched rows for snappiness,
  using the same shared `filterTransactions` the **server** endpoint uses (and which
  is independently tested).

### Sandbox-only notes (do not affect users/CI)
- Prisma engines curl-mirrored (query-engine library + schema-engine for
  `debian-openssl-3.0.x`) and Playwright pointed at the pre-installed Chromium —
  same approach as Sessions 1–3; standard installs / `npx playwright install` work
  elsewhere.

### Overall
**v0.4.0 meets the quality bar.** Gate green (93 + 22 tests, 0 lint warnings),
balances derived from the ledger, the two v0.3.0 review fixes shipped with e2e
coverage, security review PASS, open items tracked honestly. No blockers.

---

## v0.3.0 — Public bank website and branding — 2026-06-25

### Gate: `npm run verify` ✅ PASS
- **Lint** (ESLint 9 flat) — pass, **0 errors, 0 warnings** (nav model split into
  `lib/nav.ts` so the presentational `marketing.tsx` stays component-only).
- **Typecheck** (`tsc -p` × 4 workspaces) — pass.
- **Unit/integration tests** (Vitest) — **70 passed / 70** (65 + 5 new):
  `routes/session-isolation.test.ts` (4) + an empty-body-logout regression test in
  `routes/auth.test.ts`. All prior suites still green.
- **Build** — backend (tsup) + customer (vite, now 71 modules) + operations all build.

### E2E (Playwright) ✅ PASS
- **14 passed / 14** (8 + 6 new): `public-site.spec.ts` (5 — home, full nav,
  coming-soon framing, open-account→login, mobile menu) and `session-isolation.spec.ts`
  (1 — both apps in one browser context; customer logout redirects `/dashboard` to
  the customer login while the ops session stays intact).

### Bug fixed this milestone (from the v0.2.0 review) — two root causes
The reported cross-app session bleed had **two** causes, both fixed and tested:
1. **Shared host-only session cookie** across both apps → **per-surface cookies**
   (`mer_session` / `mer_ops_session`) chosen by request `Origin`.
2. **Logout returned HTTP 400** (bodyless `POST` with `Content-Type: application/json`)
   so it never revoked the session — a defect **masked** in v0.2.0 because no test
   asserted server-side state after logout. Fixed in the client (no JSON content-type
   when bodyless) and hardened the backend (tolerate empty JSON body). **Process
   lesson:** test the *server effect* of logout (re-fetch a protected route), not
   just the client UI — now covered by integration + browser-level tests.

### Security review (pre-gate, read-only) — ✅ No blockers
Session isolation verified (per-surface cookies; ops/admin routes still role-gated;
default audience is the least-privileged customer). No secrets added; simulation
disclaimer visible site-wide; all marketing rates/fees clearly labelled simulated.
The three v0.2.0 **Low** follow-ups (SEC-1 CSRF, SEC-2 config-driven cookie `secure`,
SEC-3 helmet + login rate-limit) remain accepted, tracked, and unchanged (targets
v0.7.0 / v1.0.0). No schema change this milestone.

### Dependency audit
- **No new runtime advisories.** The website work added no runtime dependencies.
  Prisma is now 5.22.0 (within the existing `^5.20.0` range; lockfile synced). The
  prior **dev/test-tooling advisories** (vite, vitest, esbuild — dev-only) are
  unchanged and remain tracked in the v0.1.0 section for the v1.0.0 hardening pass.

### Known limitations / deferred
- **Frontend component unit tests** remain deferred; the public site is covered by
  build + the Playwright journeys.
- **Marketing images are placeholders** (branded gradients) until real files are
  dropped into `apps/customer/public/images/` (prompts provided for every slot).
- **`/open-account`** is a placeholder routing to login; real onboarding is v0.6.0.

### Sandbox-only notes (do not affect users/CI)
- Prisma engines curl-mirrored (query-engine library + schema-engine for
  `debian-openssl-3.0.x`) and Playwright pointed at the pre-installed Chromium —
  same approach as Sessions 1–2; standard installs / `npx playwright install` work
  elsewhere.

### Overall
**v0.3.0 meets the quality bar.** Gate green (70 + 14 tests, 0 lint warnings), the
public site is polished/responsive/accessible with the disclaimer visible, and the
reviewer-reported bug is fixed with regression coverage at two levels. No blockers.

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

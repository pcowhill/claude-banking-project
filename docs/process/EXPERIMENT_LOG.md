# EXPERIMENT_LOG

A chronological, append-only log of the AI-development experiment: what each
session set out to do, key decisions, surprises, and outcomes. Newest entries at
the top within each milestone. **Append; do not rewrite history.**

---

## Session 12 — v1.0.0 Polish, hardening, loans/CDs/interest, final retrospective — 2026-06-29

**Goal:** the human's v0.9.0 review approved moving to v1.0.0 and, in the same message,
(1) reported stale "coming soon" marketing placeholders for Cards/Loans&CDs, (2) reported
a time-travel **date bug** (a clock-fired bill pay approved on the wall-clock date, not
the simulated date), and (3) **pulled loans / CDs / interest accrual into v1.0.0** now
that the clock exists ("If so, do them"). So v1.0.0 — the **final** milestone — became a
combined **feature + hardening + polish** capstone, on top of the already-planned
hardening (SEC-1 CSRF, dev-tooling audit, ledger TOCTOU disposition) + the first frontend
tests + the experiment retrospective.

**Branch:** `claude/elegant-pascal-lg8lcr`.

**Key decision — the simulation clock is now the SINGLE money "now" (supersedes ADR-0002
#2).** The reported bug was a direct consequence of v0.9.0's deliberate choice to keep
immediate/ops actions on wall-clock (to avoid collapsing same-session entries onto one
`createdAt`). v1.0.0 reverses that: every money/business route threads
`simulationNow(prisma)` (transfers, movements, **ops approvals/reversals** — the bug —
disputes/fraud, cards, onboarding/admin funding, scheduled fires, interest accrual), and
the "same-instant ordering" concern is solved instead with a deterministic `id` tiebreak
in `toTransactionDTOs` (cuid is timestamp-prefixed → newest-first within a shared
instant). Auth/operational timestamps (session expiry, lockout, login history,
heartbeat/status `serverTime`) stay wall-clock by design — tying session lifetime to a
manually-advanced clock would break login. A regression test reproduces the exact City
Power and Light scenario. Recorded in **ADR-0003**.

**Loans / CDs / interest accrual — on the existing ledger, no new money mechanics.** A CD
and a loan are each a dedicated `cd`/`loan` Account (both already in `ACCOUNT_TYPES`) with
a 1:1 `LendingProduct` row holding only the TERMS. Opening/paying/withdrawing post
**net-zero** `transfer` leg pairs; a loan account carries a NEGATIVE (owed) balance;
interest is the only new money and is **bank-originated** (`origin:'interest'`, already
allowed to move the system total), accrued **on clock advance** (monthly, bounded,
idempotent via a per-target bookmark; dated at the simulated accrual date), right after the
scheduler. One **additive** migration (`lending`: the `LendingProduct` table + a nullable
`Account.interestAccruedThrough`). Shared pure math (`amortizedPaymentMinor`,
`monthlyAccrualMinor`, `projectCdMaturityMinor`) + validators are unit-tested.

**CSRF (SEC-1) finally enforced.** A global double-submit hook sets a non-httpOnly
`mer_csrf` cookie on safe GETs + login and requires a matching `x-meridian-csrf` header
on mutating requests **that carry a session cookie** (the only forgeable case;
unauthenticated mutating requests fall through to the honest 401; login/logout/public
onboarding exempt). Both frontends echo the token from their `lib/csrf.ts`. The security
reviewer confirmed the session-presence gate is sound (session cookies are the only auth
mechanism). Acted on its Low/Info findings: constant-time token compare, a symmetric CD
accrual guard, and logging the (isolated) accrual failures.

**Execution mode (serialized risky areas, then parallelized frontends):** date fix →
shared lending contract + math → additive schema migration → lending services + accrual +
routes (+ seed) → backend integration tests (money invariants: net-zero opens/payments,
correct monthly accrual, idempotency, maturity) — all green BEFORE any UI. Then the two
frontends (customer lending portal + marketing cleanup; ops lending view + accrual
summary) were built in parallel against the locked contract, then both wired to send the
CSRF token. A read-only security review (PASS-with-findings) ran in parallel on the locked
backend; the testing role added the first frontend unit tests + extended e2e last.

**Hardening dispositions (ADR-0003 + QUALITY_REPORT):** dev-tooling npm-audit — runtime
`--omit=dev` = 0; the dev-only vite/vitest/esbuild advisories have no non-breaking fix, so
documented acceptance + upgrade path rather than a destabilizing major bump at the tag.
Ledger/scheduler TOCTOU (L-2/L-3/F-2) — accepted residual risk for a single-user local
sim (derived balances; SQLite serializes writers; worst case a transient auditable
negative-available; never a lost/created dollar).

**Surprises / environment friction (sandbox only):** same Prisma engine-download block as
Sessions 1–11 — resolved the documented way (curl-mirror the query + schema engines for
`debian-openssl-3.0.x`, engine `605197351a3c8bdd595af2d2a9bc3025bca48ea2`, set the
`PRISMA_*` env + `NODE_EXTRA_CA_CERTS`); created the `lending` migration through the
mirrored schema engine; Playwright used the pre-installed Chromium via
`PLAYWRIGHT_CHROMIUM_PATH`. None of this affects normal machines or CI.

**Outcome:** `npm run verify` passes; loans/CDs/interest + the simulated-date fix + the
marketing cleanup + CSRF all shipped; security review PASS-with-findings (no
Critical/High/Medium). Exact gate counts in `MILESTONE_REPORT_v1.0.0.md` /
`QUALITY_REPORT.md`. Final milestone — annotated tag `v1.0.0` created locally (tag push
blocked by env policy; human pushes on merge). Stopped at the gate.

---

## Session 11 — v0.9.0 Simulation clock & scheduled payments — 2026-06-27

**Goal:** the human approved v0.8.0 and the recurring/scheduled-payments item carried
from v0.7.0 (deferred specifically because it needs a clock) was the next thing due. So:
build **v0.9.0 — Simulation clock & scheduled payments** — the **clock + scheduler +
statement-cycles** slice of the broader "v0.9.0 — Loans, CDs, simulated time" roadmap
theme — and close the carried `M-09`. Loans / CDs / interest accrual are explicitly
**carried forward** (roadmapped beyond this slice).

**Branch:** `claude/happy-franklin-q41de0`.

**Key design decision — date fired entries at their simulated due date, but keep
wall-clock for immediate actions (ADR-0002).** A static sim clock that stamped every
`createdAt` would collapse all same-session entries onto one instant and scramble ledger
ordering. So the scheduler dates a fired entry at its **simulated due date**, while
immediate transfers/movements and ops actions keep wall-clock `new Date()`. The clock is
**forward-only** and seeded to the seed instant; the scheduler fires **on clock advance**
(no wall-clock background timer); catch-up across a multi-period jump is **bounded**; and
an occurrence that can't fund itself is **skipped + audited** rather than failed. Captured
in `docs/process/decisions/ADR-0002-simulation-clock-and-scheduler.md`.

**Key design decision — one additive migration; statements derive, don't store.** Only
the scheduler needed persistence, so the sole schema change is the **additive**
`scheduled_payments` migration (`PaymentSchedule` only — no existing table touched).
**Statement cycles needed no migration** — `GET /api/accounts/:id/statements` derives
monthly periods from the simulated date, read-only over the posted ledger (closing the
v0.4.0 statements placeholder). The clock's state lives in the existing
`SimulationClock` singleton row. The heartbeat `sim:heartbeat` was extended to carry
`simulationTime` (backward-compatible — **no new socket event**).

**Architecture — fire through the v0.7.0 money service; reuse the ops queue.** A
scheduled **internal transfer** posts **both legs** through the same v0.7.0 movement path
(nets to zero); a scheduled **bill pay** writes a **pending** entry **+ a reviewable ops
item** — the same `OperationsRequest` + `applyOperatorAction` + `ops:request_changed`
channel everything since v0.5.0 has used (no new ops endpoint, no new socket event for
resolution). New shared modules `clock.ts`, `schedules.ts`, `statements.ts` hold the pure
contract/derivation. New endpoints: customer `POST /api/schedules`, `GET /api/schedules`,
`POST /api/schedules/:id/cancel`; `GET /api/clock`; ops/admin
`POST /api/ops/clock/advance` (forward-only, audited, **fires due schedules**) and
`GET /api/ops/schedules`.

**Process — serialize the risky core, then parallelize the frontends.** The clock +
scheduler are a risky shared area (they drive the ledger and real-time), so I built the
shared contracts (`clock.ts`, `schedules.ts`, `statements.ts`) + the additive migration +
the backend clock/scheduler/statements services and routes **myself, serially**, with the
API/payload/heartbeat contract locked and the fire-on-advance behavior integration-tested
first; then ran the two frontends **in parallel** (customer `/scheduled-payments` +
upgraded `/statements`; operations new `/clock` page promoted from the "coming soon" nav)
as separate agents against the locked contract; then integrated, ran the full gate + e2e,
and a read-only security review.

**Money discipline.** Every scheduled fire is an explicit **ledger** entry posted through
the v0.7.0 money service — a transfer's two legs (asserted to net to zero) or a
bank-reviewed bill-pay pending entry — never a stored/edited balance; balances stay
derived. Insufficient-funds occurrences are **skipped + audited**, not posted as a bad
balance. The clock can only move **forward** and every advance is audited. A test asserts
the system-wide settled total is unchanged by transfer fires and moves only by explicit
posted entries otherwise.

**Security review — PASS-with-findings (no Critical/High/Medium).** One **Low acted on
(L-1):** the scheduler previously rethrew an unexpected error **after** an occurrence was
claimed — now any fire failure is recorded as a **skip** and the per-schedule loop is
**guarded** so the rest of the advance still processes (one bad schedule can't abort the
batch). Two **Low tracked** to the later ledger-hardening pass: **L-2** (run-count /
last-run bookkeeping is a separate write after the money posts — cosmetic drift on a crash
between the two writes, never a balance error) and **L-3** (the accepted v0.7.0 funds-check
TOCTOU is now also reachable from the scheduler — bounded, auditable, never a lost/created
dollar). **SEC-1 (CSRF)** stays accepted (SameSite=Lax + CORS) and is re-targeted to
**v1.0.0**.

**Outcome.** `npm run verify` green — **332** unit/integration (was 282; +50) + **44**
Playwright e2e in real Chromium (was 41; +3 scheduled-payments journeys); 0 lint warnings;
runtime `npm audit` = 0. One additive migration (`scheduled_payments`). Version bumped to
0.9.0 across all workspaces + `packages/shared/src/version.ts` (MILESTONE 'v0.9.0',
MILESTONE_NAME 'Simulation clock & scheduled payments'); annotated `v0.9.0` tag created
locally (push blocked by env policy — HTTP 403 — so the human pushes it on merge; no PR
opened). Stopped at the gate; did **not** start v1.0.0.

**Surprises / environment friction (sandbox only):** same Prisma engine-download block as
Sessions 1–10; resolved the documented way (`npm install --ignore-scripts` + curl-mirror
the query-engine library + schema-engine for `debian-openssl-3.0.x` + `PRISMA_*` env vars;
engine `605197351a3c8bdd595af2d2a9bc3025bca48ea2`). Created the real `scheduled_payments`
migration through the mirrored schema engine. Playwright used the pre-installed Chromium
via `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium`. **None of this affects normal
machines or CI.**

## Session 10 — v0.8.0 Cards, fraud, disputes — 2026-06-27

**Goal:** the human approved v0.7.0 ("Everything looks great") and made one optional
request — when a request is reversed in Ops the badge still reads only "Approved";
they'd like a "Reversed" tag too, left to our judgement. So: build **v0.8.0 — Cards,
fraud, disputes**, and accept the tag request as **R-03**.

**Branch:** `claude/keen-einstein-rxfkq0`.

**R-03 accepted + folded in.** The reversed state already existed on the payload
(`payload.reversed`); we added a shared `isRequestReversed(payload)` helper and a
`ReversedBadge` rendered beside the Approved badge on the ops queue cards, dashboard,
and detail panel. No state-machine change — the request stays terminal-approved. Folded
into v0.8.0 because disputes + fraud also produce reversals, so the tag pays off in
three places.

**Key design decision — the only risky migration is `Card`.** Following the v0.7.0
pattern of minimizing schema churn: cards needed a real (but **additive**) migration
(`Card` + `CardTravelNotice`, no existing table touched), while **fraud + disputes
needed none** — they ride the existing `OperationsRequest` (`fraud_alert` / `dispute`
types) with their context on `payload`, exactly like v0.7.0 movements. The migration was
created through the mirrored schema engine and reviewed (two CREATE TABLEs + indexes).

**Architecture — reuse everything.** Disputes/fraud reuse the v0.5.0 ops queue + action
service + real-time and the v0.7.0 reversal. We generalized reversal into one
`reverseLedgerEntries` core (`posted`/`disputed`→`reversed`) now shared by the movement
reversal, dispute uphold, and fraud confirm. `applyOperatorAction` gained `dispute` +
`fraud_alert` branches (atomic + audited) — **no new ops endpoint or socket event**
(resolution reuses `/api/ops/requests/:id/action` + `ops:request_changed`). Card
lifecycle is its own service and deliberately writes **no ledger** (card spend stays as
existing `card`-origin entries; this is the lifecycle on top).

**Process — serialize the risky core, then parallelize the frontends.** Built the
shared contracts (`cards.ts`, `risk.ts`, `isRequestReversed`) + schema migration +
backend services/routes + seed **myself, serially**, with the API/payload/socket
contract locked; then ran the two frontends **in parallel** (customer `/wallet` +
dispute/fraud UI; operations context blocks + the R-03 tag) as separate agents; then
integrated, ran the full gate + e2e, and a read-only security review.

**Money discipline.** Card lifecycle writes no ledger (a test asserts the ledger count
is unchanged across card ops). Dispute uphold / fraud confirm flip the entry to
`reversed`; dispute deny returns it to `posted`; balances stay derived; reversals keep a
reason + audit. Security review (PASS-with-findings) surfaced that a customer could
dispute an internal **transfer leg** (which must net to zero) — fixed immediately with a
guard + test. Other findings were Low/info and tracked.

**Outcome.** `npm run verify` green; **282** unit/integration (+42) + **41** e2e (+4);
0 lint warnings; one additive migration. Version bumped to 0.8.0; annotated `v0.8.0`
tag created locally (push blocked → human tags on merge).

**Surprises / environment friction (sandbox only):** same Prisma engine-download block
as Sessions 1–9; resolved the documented way (`npm install --ignore-scripts` +
curl-mirror the query-engine library + schema-engine for `debian-openssl-3.0.x` +
`PRISMA_*` env vars; engine `605197351a3c8bdd595af2d2a9bc3025bca48ea2`). Created the
real `cards` migration through the mirrored schema engine. Playwright used the
pre-installed Chromium via `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium`. One
pre-existing v0.7.0 e2e assertion (`getByText('Reversed')`) became ambiguous once the
R-03 tag existed (and under parallel specs sharing the seeded DB) — scoped it to its
specific card. **None of this affects normal machines or CI.**

## Session 9 — v0.7.0 Money movement — 2026-06-26

**Goal:** the human approved v0.6.2 ("The fixes look good… move onto v0.7.0") and
noted (a) the branch already has the v0.6.2 commits and (b) they had **not tagged**
v0.6.2 (disregard the "tagged" wording). So: build **v0.7.0 — Money movement**, the
first milestone where an operator approval MOVES money — within ledger discipline.

**Branch:** `claude/sweet-newton-44widz`, cut from `main` and **already containing**
v0.6.0 + v0.6.1 + v0.6.2 (verified via `git log` — no fast-forward needed, unlike
Session 8). Confirmed **no tag exists in-repo** (`git tag -l` empty) and corrected the
stale "v0.6.2 tagged" wording in the state/board docs.

**Key design decision — no schema migration.** A transaction is a `LedgerEntry` row and
balances are derived, so money movement needed **no Prisma migration**: the ledger
already had the statuses (`pending`/`posted`/`failed`/`reversed`), origins
(`transfer`/`deposit`/`payment`), and `reason`, and the movement context rides on the
existing `OperationsRequest.payload` JSON. This kept the riskiest shared area untouched
and is the second milestone (after v0.4.0) to add a feature with zero migration.

**Architecture — reuse the v0.6.0 "approval has a ledger effect" path.** Two customer
entry points: an **immediate internal transfer** (`POST /api/transfers`, posts both
`transfer` legs → nets to zero) and a **reviewable external movement**
(`POST /api/movements` — mobile check deposit / external ACH / wire / bill pay → a
**pending** entry + a linked ops item carrying `ledgerEntryIds`). `applyOperatorAction`
gained money-movement branches mirroring the onboarding approve/reject branches:
**approve** flips the linked pending entries to `posted`, **reject** to `failed`,
hold/request-info leave them pending. A new ops-only **reverse** endpoint flips a posted
movement to `reversed` (reason + audit). The carried **Q-01** is closed by linking the
seeded pending mobile-check deposit to its review item (entry ids threaded through the
seed at apply time).

**Process — serialize the risky core, then parallelize the frontends.** Built the
shared contract → backend service → routes/branches → seed **serially myself** (ledger
+ routing + real-time are risky), wrote + ran the **18 backend integration tests** to
lock correctness, THEN parallelized the two frontends with the customer + operations
sub-agents against the locked contract. A green checkpoint (backend + frontends + unit/
integration) was committed and pushed mid-session; e2e + docs followed.

**Money discipline (asserted):** transfers net to zero (system settled total unchanged
— tested); external value enters only via a bank-originated posted `deposit` credit and
leaves only via a posted `payment` debit; failures/reversals are ledger **status**
changes, never balance edits; reversal requires a reason + audit; a customer can only
move money on accounts they hold (server-side, both legs). The movement payload's
`ledgerEntryIds` are server-set, so the client can't inject them and an operator action
can't be steered onto an unrelated entry.

**Security review — PASS-with-findings (none blocking):** RBAC/IDOR + payload-trust +
money discipline all confirmed correct. Findings all Low/tracked: **F-1 (SEC-1 CSRF)** —
SameSite=Lax + CORS adequately mitigate the new POSTs for a local sim; re-targeted to
v1.0.0 (does NOT block); **F-2** — a check-then-act TOCTOU on the funds gate (read
outside the write tx); not a money-integrity break (balances derived, SQLite serializes
writers, single-user sim) → tracked for the v0.8.0+ ledger hardening (note: a partial
in-tx check wouldn't fully close it on SQLite, so it was tracked honestly rather than
half-fixed); **F-3** — reversal net-zero guard for a future multi-leg movement.

**Scope decision — deferred recurring/scheduled payments to v0.9.0.** The v0.7.0 list
included recurring/scheduled payments; they need the **simulation clock + scheduled-event
processing** already roadmapped at v0.9.0, so building a scheduler now (nothing to fire
it) would be a non-functional stub. Deferred transparently (TASK_BOARD `M-09`,
ROADMAP_HISTORY, raised in the human review for the human to pull forward if desired).

**Surprises / environment friction (sandbox only):** same Prisma engine-download block
as Sessions 1–8; resolved the documented way (`npm install --ignore-scripts` +
curl-mirror the query-engine library + schema-engine for `debian-openssl-3.0.x` +
`PRISMA_*` env vars; engine `605197351a3c8bdd595af2d2a9bc3025bca48ea2`). Playwright used
the pre-installed Chromium via `PLAYWRIGHT_CHROMIUM_PATH` (the `/opt/pw-browsers/chromium`
symlink → the 1194 build; Playwright expects 1228, hence the executablePath escape
hatch). **No migration this milestone.** Two e2e selector bugs in my new spec were found
and fixed (a `$320.00` strict-mode collision; a `<strong>`-split "Pending" text). The
seed description for the mobile-check deposit was changed from "…(pending)" to "Mobile
check deposit" (so it reads correctly once posted), which required updating one existing
dashboard e2e assertion. None of this affects normal machines or CI.

**Outcome:** `npm run verify` passes — **240** unit/integration tests (was 201; +39: 16
shared, 18 backend money, +5 seed-plan), 0 lint warnings — and **37** Playwright e2e in
real Chromium (was 33; +4 money-movement journeys). Runtime `npm audit` = 0. Version
bumped to 0.7.0; annotated tag `v0.7.0` created locally (tag push blocked by env policy
— HTTP 403 — so the human pushes it on merge; see the milestone report). Stopped at the
gate; did **not** start v0.8.0.

---

## Session 8 — v0.6.2 Operations sign-in fix (patch) — 2026-06-26

**Goal:** The human's v0.6.1 review reported a **new, blocking regression** — they
could no longer sign in to Meridian Operations at all (after a successful login the
dashboard flashed, then bounced back to the sign-in screen with the v0.6.1 "session
has ended" notice, looping forever and surviving a cookie clear; both Sam and Riley
affected) — and **explicitly re-scoped the session away from v0.7.0** to a patch
release `v0.6.2` fixing only that bug for them to test. So: do NOT start Money
movement; root-cause the login loop, fix it, prove it, document, tag.

**Branch-history surprise (resolved first):** the fresh session branch
(`claude/gracious-fermi-5cfomj`) was cut from `main` (**v0.6.0**) and did **not**
contain v0.6.1 — that work was a **single commit (`52347db`) on an UNMERGED branch**
(`origin/claude/dreamy-maxwell-njcxe7`) never merged to `main`. Since the bug being
fixed is literally the v0.6.1 recovery handler escalating a pre-existing 401 into a
loop, the fix has to sit on top of v0.6.1, so the branch was **fast-forwarded** to
include `52347db` — it now carries v0.6.0 + v0.6.1 + v0.6.2.

**Bug (B-06) — operator sign-in loop:** confirmed real, and not role/cookie-specific
(both staff users). Diagnosis by reproduction, narrowing to the same-origin request
shape:
- **Backend `app.inject` with an explicit ops `Origin`:** login sets `mer_ops_session`;
  `/api/auth/me` + `/api/ops/*` GETs 200. The Origin path is correct (matching the
  v0.6.1 curl checks).
- **Backend `app.inject` with NO `Origin` on the GET** (the same-origin browser shape):
  the authenticated GET resolved to the **customer** cookie and **401'd** —
  reproducing the loop's trigger. Adding `x-meridian-surface: operations` to that same
  request returns 200 — the fix, empirically.
- **Real Chromium, route-rewritten** to strip `Origin` on GET/HEAD only (keeping it on
  the login POST, exactly how a same-origin browser behaves): pre-fix it loops; post-
  fix the operator reaches the dashboard, the queue loads, and a reload restores the
  session.

**Root cause (B-06):** the backend picks the per-surface session cookie
(`mer_session` customer / `mer_ops_session` operations) from the request **`Origin`
header**, defaulting to the **customer** surface when `Origin` is absent/unrecognized
(`apps/backend/src/auth/cookies.ts` → `sessionAudienceForOrigin`). But **browsers omit
`Origin` on same-origin GET requests** — they send it on the login POST but not on
safe-method GETs. In a same-origin deployment the operator's authenticated `/api/ops/*`
GETs arrived with no `Origin`, were treated as customer, read the empty `mer_session`,
and returned **401**. v0.6.0 surfaced that exact 401 as the "Not authenticated"
dead-end (original B-04); the v0.6.1 recovery handler then escalated the same 401 into
an **unrecoverable login loop**. The standard cross-origin dev setup (`:5174` →
`:3000`) **always** sends `Origin`, which is precisely why local runs, the v0.6.1 curl
checks (ops Origin set), and the cross-origin Playwright suite all passed while the
human's same-origin environment failed — the blind spot.

**Fix (B-06):** each front-end app declares its surface via an explicit header
`AUTH.surfaceHeader` = `x-meridian-surface` that the backend trusts **ahead of**
`Origin` (Origin stays a fallback, so the Socket.IO handshake, cross-origin dev, and
existing Origin-based tests are unchanged). Added `isSessionAudience` guard +
`surfaceHeader` to `packages/shared/src/auth.ts`; new `sessionAudienceFromHeader()` +
`sessionAudienceForRequest()` = header ?? Origin-fallback in `cookies.ts`; the
Socket.IO ops-room handshake (`realtime.ts`) also prefers the header. The ops app
sends `operations` on every authenticated REST call (`api.ts`) and as socket
`extraHeaders` (`useOpsSocket.ts`). The **customer app was deliberately NOT changed**
— it already resolves to the `customer` cookie via the least-privileged default, and
adding a custom header to its GETs would reintroduce the CORS preflights its design
note avoids; session isolation (the v0.3.0 fix) stays covered by the existing
Origin-based tests and remains green. **Security:** the surface header only selects
WHICH cookie is read — it cannot grant access (RBAC `requireRole` checks unchanged),
so trusting the client's self-declared surface is safe.

**Discipline kept:** no money-path, schema, migration, ledger, money-contract, or auth
*model* change — only surface-resolution. Money discipline, the public site, the
customer dashboard, and onboarding untouched; balances stay derived; disclaimer
visible in both apps + README; no secrets.

**Surprises / environment friction (sandbox only):** same Prisma engine-download block
as Sessions 1–7 (ECONNRESET to `binaries.prisma.sh`); resolved the documented way
(`npm install --ignore-scripts` + curl-mirror the query-engine library + schema-engine
for `debian-openssl-3.0.x` + `PRISMA_*` env vars). Prisma 5.22.0, engine
`605197351a3c8bdd595af2d2a9bc3025bca48ea2`. Playwright used the pre-installed Chromium
via `PLAYWRIGHT_CHROMIUM_PATH`. The real-browser WebServer logs showed `OPTIONS`
preflights returning **204** for the new `x-meridian-surface` header on `/api/ops/*`
GETs — `@fastify/cors` reflects requested headers by default, so **no CORS config
change was needed**. None of this affects normal machines or CI.

**Outcome:** `npm run verify` passes; **201** unit/integration tests (was 189; +12 —
`routes/ops-session-origin.test.ts` ×5 incl. the two header tests that FAILED against
the pre-fix backend, + `auth/cookies.test.ts` ×7) + **33** Playwright e2e in real
Chromium (was 32; +1 — the same-origin Origin-less-GET reproduction with a
self-validating `sawOriginlessOpsGet` guard; the v0.3.0 session-isolation bleed test
and the v0.6.1 B-03/B-04 e2e still green). No schema change this patch. Version bumped
to 0.6.2; annotated tag `v0.6.2` created locally (tag push blocked by env policy — HTTP
403 — so the human pushes it on merge; see the milestone report). Stopped at the patch
gate; did **not** start v0.7.0.

---

## Session 7 — v0.6.1 Operations console fixes (patch) — 2026-06-26

**Goal:** The human's v0.6.0 review reported two Meridian Operations bugs and
**explicitly re-scoped the session away from v0.7.0** to a patch release `v0.6.1`
fixing only those bugs (with v0.6.1-named docs) for them to test. So: do NOT start
Money movement; fix the two bugs, prove them, document, tag.

**Bug 1 (B-03) — nav disappears on a narrow window:** confirmed real. The ops
console sidebar was `lg:block`-only and hidden below `lg` with **no** replacement
control, so sections were unreachable on a narrow window. Fixed with an accessible
top-bar menu (☰) that opens the same links (factored into a shared `NavList` used by
both the desktop sidebar and the mobile panel), auto-closing on navigation.

**Bug 2 (B-04) — "Not authenticated" in Request queues; can't approve:** the
interesting one. The v0.6.0 e2e (which loads the queue as an operator) had passed
30/30, so the bug had to be environment/session-state-sensitive. Diagnosis by
reproduction, escalating fidelity:
- **Backend over HTTP (curl cookie jar, ops origin):** login sets `mer_ops_session`;
  `/api/auth/me` 200; `/api/ops/requests` 200 with the full queue. Backend correct.
- **Full onboarding loop over HTTP:** submit → operator approve → provisioned
  user/account → new customer signs in to the funded account. Approval path correct.
- **Real Chromium, clean profile:** queue renders all cards; every `/api/ops/*`
  call carries the cookie and returns 200. No bug in a clean session.
- **Real Chromium, invalid session mid-use** (cleared cookie / deleted session):
  the console kept rendering the authenticated shell while data calls 401'd —
  **reproducing the user's dead-end "Not authenticated".**

**Root cause (B-04):** the ops console decided it was signed in purely from
optimistic in-memory React state (the login response / the mount-time `fetchMe`) and
**never reconciled a subsequent API 401**. So any invalid/expired/stale operator
session (easy to hit across versions + backend restarts, or after the 8-hour TTL)
left the operator stranded — the queue page showed the raw "Not authenticated"; the
dashboard just looked empty; there was no path back. **The backend/cookie/auth code
was unchanged since v0.5.0 and is correct** — this was a client-side resilience gap.

**Fix (B-04):** the API client now recognises 401 `unauthenticated`/`session_expired`
(and ONLY those — a failed login's `invalid_credentials` is excluded) and invokes a
registered handler; `AuthContext` clears the user + sets `sessionEnded`, so the
existing gate shows the sign-in screen (tearing down the data provider + socket); the
login screen shows a clear "your session has ended" notice; a fresh sign-in recovers
the queue. Verified deterministically in real Chromium via Playwright route
interception forcing `/api/ops/**` → 401 (bounce + notice + recovery), plus a
clean-session regression (queue still loads).

**Discipline kept:** changes confined to the operations app + the shared version
string. No backend / schema / migration / ledger / contract / auth change; money
discipline, the public site, the customer dashboard, and onboarding untouched.

**Surprises / environment friction (sandbox only):** same Prisma engine-download
block as Sessions 1–6 (ECONNRESET to `binaries.prisma.sh`); resolved the documented
way (`npm install --ignore-scripts` + curl-mirror the query-engine library +
schema-engine for `debian-openssl-3.0.x` + `PRISMA_*` env vars). Prisma 5.22.0,
engine `605197351a3c8bdd595af2d2a9bc3025bca48ea2`. Playwright used the pre-installed
Chromium via `PLAYWRIGHT_CHROMIUM_PATH`. None of this affects normal machines or CI.
Also hit a transient false failure while iterating: Vite HMR left a stale module so a
mid-edit Playwright check failed; a clean dev-server restart confirmed the fix — a
test-harness artifact, not a product issue.

**Outcome:** `npm run verify` passes; **189** unit/integration tests (unchanged) +
**32** Playwright e2e (was 30; +2 for the fixes) green. No schema change this patch.
Version bumped to 0.6.1; annotated tag `v0.6.1` created locally (tag push blocked by
env policy — HTTP 403 — so the human pushes it on merge; see the milestone report).
Stopped at the patch gate; did **not** start v0.7.0.

---

## Session 6 — v0.6.0 Onboarding and account opening — 2026-06-26

**Goal:** Complete only `v0.6.0 — Onboarding and account opening` (a real,
simulated open-account flow feeding the v0.5.0 ops queue; operator approval that
provisions a user + account + initial funding; joint-account invitations;
admin-created demo users), **and** address the v0.5.0 review: two ops-console
fixes (B-01 detail-panel buttons not deactivating; B-02 add a note after the
decision) plus two written answers (Q-01 deposit "Pending"; Q-02 what Simulated
Messaging is for). Human approved ("Everything else looks great.").

**Headline decision — this is where an operator approval first CREATES money, so
it had to stay inside the ledger discipline.** v0.5.0 kept operator actions
workflow-only; v0.6.0 introduces the first approval-with-a-ledger-effect, but only
the narrow safe case: approving an `onboarding` request provisions a `User` +
`Account` and posts any opening deposit as an explicit **bank-originated, posted
`deposit`** ledger entry — atomically (in a transaction), audited, and
precondition-guarded (blocked + rolled back if the email already exists). A test
asserts the system-wide settled total moves by **exactly** the funded amount and
by nothing else; balances stay derived. Admin-funded users use an audited
`adjustment` requiring a reason. Submitting an application / adding a note / a
joint invite move no money.

**Reuse over reinvention (per the constitution + the review):** the open-account
submission creates an `OperationsRequest` of type `onboarding` on the SAME queue,
flows through the SAME `applyOperatorAction` service, the SAME action route, and
the SAME Socket.IO `OpsRealtime` channel — no new ops endpoint, no new socket
event. The `note` action (B-02) is likewise the same action service/route/audit/
real-time, just non-decision (no status change, allowed on terminal). Joint-invite
acceptance creates a `joint` `AccountAccess` grant — the same grant RBAC already
reads. Onboarding identity/MFA and the invite "email" are `SimulatedEvent`s — the
existing simulated-messaging seam (the answer to Q-02), now driven by a real flow.

**Execution mode (serialized risky areas = contract, schema/migration, ledger,
routing, real-time):**
- `N-01` shared contract first: `@simbank/shared/onboarding` (DTOs + the PURE
  validators reused by client and server) + the `note` action added to
  `operations.ts` (without adding a fifth decision button) — unit-tested to LOCK
  the contract before anything built on it.
- `N-02` Prisma schema + the **second additive migration since v0.2.0**
  (`onboarding`: `OnboardingApplication` 1:1 with its request + holds the bcrypt
  hash server-side, never in a DTO; `AccountInvitation`) — verified additive (only
  `CREATE TABLE` + indexes; money/auth tables untouched).
- `N-03` seed (an approvable onboarding application + a pending joint invite) with
  a new `assertSeedOnboardingIntegrity`; money + access + ops invariants still pass.
- `N-04…N-08` services + routes + the note action — backend integration tests
  green (provisioning + the money invariant + RBAC matrix + note-on-terminal)
  BEFORE any UI.
- Only then the two frontends (`N-09/N-10` customer open-account + invitations,
  `N-11` ops B-01/B-02 + onboarding context + admin page) were parallelized across
  the two app agents against the LOCKED contract.
- A read-only security review ran before the gate; e2e + full `verify` last.

**Answers I owed the human (also in HUMAN_REVIEW_v0.6.md):**
- **Q-01 (deposit "Pending"):** deferred to **v0.7.0** with a clear reason —
  flipping a pending deposit to posted changes the available balance, i.e. it is
  money movement; doing it now would ship a half-built deposit-posting path ahead
  of the milestone that designs holds/availability/reversals. Recorded as an
  explicit v0.7.0 acceptance note (ROADMAP + NEXT_SESSION_PROMPT).
- **Q-02 (Simulated Messaging):** it is the provider "seam" — a clearly-labelled
  fake event instead of a real SMS/email/MFA/identity provider; v0.6.0 onboarding
  is its first real use, and 2FA-at-login will use the same `SimulatedEvent` model
  when that auth sub-feature lands.

**Surprises / environment friction (sandbox only — not a product issue):** same
Prisma engine-download block as Sessions 1–5 (ECONNRESET to `binaries.prisma.sh`);
resolved the documented way — `npm install --ignore-scripts`, curl-mirror the
query-engine library + schema-engine for `debian-openssl-3.0.x`, point Prisma at
them via `PRISMA_QUERY_ENGINE_LIBRARY` + `PRISMA_SCHEMA_ENGINE_BINARY`
(+ `PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING`). Prisma 5.22.0, engine
`605197351a3c8bdd595af2d2a9bc3025bca48ea2`. Created the real `onboarding`
migration through the mirrored schema engine. Playwright used the pre-installed
Chromium via `PLAYWRIGHT_CHROMIUM_PATH`. None of this affects normal machines or CI.

**Outcome:** `npm run verify` passes; **189** unit/integration (was 145) +
**30** Playwright e2e (was 25) green. Second additive migration
(`onboarding`); no new runtime audit advisories; security review PASS. Milestone
complete; annotated tag `v0.6.0` created locally (tag push blocked by env policy —
HTTP 403 — so the human pushes it on merge; see the milestone report). Session
branch pushed. Stopped at the gate; did **not** start v0.7.0.

---

## Session 5 — v0.5.0 Operations simulator core — 2026-06-25

**Goal:** Complete only `v0.5.0 — Operations simulator core` (live request queues,
operator approve/reject/hold/request-info actions each audited, real-time updates
over Socket.IO, simulated SMS/email/MFA/identity events). Human approved with
"Everything looks good so far. Keep moving forward toward the next milestone." —
saved verbatim, interpreted as approval to proceed (no re-scope).

**Key decision — preserve money discipline by making actions workflow-only.** The
biggest scoping call: an operator action in v0.5.0 changes a request's **status**
and writes an audit row, but never posts to the ledger. Approving a "deposit" or
"ACH" request does not move money — the ledger effects of an approval belong to
money movement (v0.7.0). A test (`ops.test.ts` "operator actions never create
ledger entries") enforces this, so the disciplined-ledger rule is kept by
construction, not just intention. This also kept the milestone tightly scoped.

**Execution mode (serialized risky areas = contract, schema/migration, routing,
real-time + socket RBAC):**
- `O-01` shared `operations.ts` contract (action state machine + DTOs + socket
  payloads) written and unit-tested **first** to lock the contract before anything
  built on it.
- `O-02` Prisma schema flesh-out + the **first migration since v0.2.0**
  (`operations_core`, additive — money/auth tables untouched), verified by reading
  the generated SQL.
- `O-03` seed (10-item dated queue + 4 simulated events + intake audit rows) with
  new `assertSeedOpsIntegrity`; money + access invariants still pass.
- `O-04` ops service (state machine + audit reuse + mappers) → `O-05` testable
  `OpsRealtime` publisher + Socket.IO handshake RBAC (operators room) → `O-06`
  RBAC-gated routes. Backend tests green, then a **live socket check** proved the
  operator socket receives events while a customer socket does not.
- Only then `O-07`/`O-08` the console (one `OpsDataProvider` = one socket + live
  state), built against the locked contract.
- `O-10` read-only security review ran before the gate.

**Key decisions:**
- **Socket RBAC by room, decided at the handshake.** Both apps share one Socket.IO
  server, so ops events go to an `ops` room joined only by a valid `ops_agent`/
  `admin` *operations* session (cookie resolved from the request Origin, reusing
  the v0.3.0 per-surface cookie logic). Default-deny: customer/anonymous sockets
  connect for welcome/heartbeat but never join the room.
- **Testable real-time.** Routes emit through an injected `OpsRealtime` publisher
  (no-op default / Socket.IO impl / recording double), so route tests assert
  emissions via `app.inject` with no socket, and a separate integration test
  exercises the real handshake/join path.
- **One live data context on the client** owns a single socket + the in-memory
  queue/feed; actions update optimistically and the socket echoes idempotently (by
  id) and delivers other operators' changes.
- **Reuse AuditLog + requireRole** rather than inventing new mechanisms — the audit
  trail and RBAC primitives already existed.

**Security review:** PASS (no Critical/High). Its one **Medium** — the socket-room
RBAC, the most security-critical new code, had no automated test — was **closed in
this milestone**: added `apps/backend/src/realtime.test.ts`, which boots
`attachRealtime` on an ephemeral port and uses real `socket.io-client` connections
to assert an operator joins + receives while customer/anonymous do not (all still
get `welcome`). Two Lows: the detail route's 403 added to the RBAC test loop; a
future `subjectName` cap tracked for v0.6.0 onboarding.

**Surprises / environment friction (sandbox only — not a product issue):**
- Same Prisma engine-download block as Sessions 1–4 (ECONNRESET to
  `binaries.prisma.sh`). Resolved the documented way — `npm install
  --ignore-scripts`, curl-mirror the query-engine library + schema-engine for
  `debian-openssl-3.0.x`, point Prisma at them via `PRISMA_QUERY_ENGINE_LIBRARY` +
  `PRISMA_SCHEMA_ENGINE_BINARY` (+ `PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING`). Prisma
  5.22.0, engine `605197351a3c8bdd595af2d2a9bc3025bca48ea2`. This session also
  created a real **migration** through the mirrored schema engine (not just `db
  push`), which worked fine.
- Same Playwright/Chromium build mismatch — used the pre-installed Chromium
  (`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`) via `PLAYWRIGHT_CHROMIUM_PATH`.

**Outcome:** `npm run verify` passes; **145** unit/integration (was 93) + **25**
Playwright e2e (was 22) green. Additive `operations_core` migration; no new runtime
audit advisories; security review PASS (its Medium closed in-milestone). Milestone
complete; annotated tag `v0.5.0` created locally (tag push blocked by env policy —
HTTP 403 — so the human pushes it on merge; see the milestone report). Session
branch pushed. Stopped at the gate; did **not** start v0.6.0.

---

## Session 4 — v0.4.0 Customer banking dashboard — 2026-06-25

**Goal:** Complete only `v0.4.0 — Customer banking dashboard` (accounts overview,
account detail, transaction history with pending vs posted + search/filter,
statements placeholder, realistic seeded transactions — balances DERIVED), **and**
address the v0.3.0 review feedback: two public-site UX fixes (R-01 scroll-to-top +
a Security deep-link; R-02 session-aware entry points). Human approved starting
v0.4.0.

**Key realization — no schema migration needed.** A "transaction" is already a row
of the append-only `LedgerEntry` table (it carries `status` pending/posted/held/…,
`origin`, amount+direction, description, postedAt/createdAt). So v0.4.0 avoided the
riskiest shared area (Prisma schema) entirely: the work was a pure shared contract +
derivation, a richer **seed** (with per-entry dating), one **access-scoped read
endpoint**, and the **dashboard UI**. This was the single biggest scoping decision.

**Execution mode (serialized risky area = the API contract + the data every screen
reads):**
- R-01/R-02 (R-01 touches routing) done **first**, e2e-tested.
- Then `D-01` shared DTOs + pure derivation (`toTransactionDTOs`,
  `filterTransactions`) written and unit-tested to **lock the contract**.
- Then `D-02` seed + `D-03` access-scoped endpoint with integration tests.
- Only then the dashboard UI (`D-04…D-07`) built against the locked contract.
- A read-only security review ran before the gate (**PASS**, no new findings).

**Key decisions:**
- **Reuse the v0.2.0 access primitive** (`getAccountRelationship`) for
  `GET /api/accounts/:id/transactions` so the transactions endpoint inherits the
  exact ownership/joint scoping (and IDOR-safety) of the single-account read — no
  parallel access path to get wrong.
- **One filtering definition** (`filterTransactions` in shared) used by BOTH the
  server endpoint (`?q=&group=&origin=`, whitelisted) and the UI (instant
  client-side filter over the fetched rows) — same behavior, tested once.
- **Running balance derived server-side** in chronological order over settled
  entries, then attached to the newest-first list, so the statement reads correctly
  while the API returns rows newest-first.
- **Seed built via paired helpers** (`transfer()` posts both legs; `daysAgo` dates
  each entry) so the money invariants (transfers net to zero; every settled credit
  bank-originated or a transfer leg) stay trivially satisfied even at 56 entries.
- **R-01 as one router-level effect** (`ScrollToTop`) rather than wiring each
  button — it keys off the location, so every control (header/footer/in-page CTA)
  is covered; a `#hash` destination scrolls the section in (with `scroll-mt` under
  the sticky header) instead of jumping to the top.
- **R-02 via a pure `resolveCtas` helper** that rewrites only `/login` + 
  `/open-account` CTAs to a single deduped "Visit your Dashboard" when signed in;
  the `/login` route gains an "already signed in" branch. No client-side trust for
  protection — `RequireAuth` + server `requireAuth` are unchanged.

**Surprises / environment friction (sandbox only — not a product issue):**
- Same Prisma engine-download block as Sessions 1–3 (ECONNRESET to
  `binaries.prisma.sh` from Prisma's fetcher; curl reaches it). Resolved the same
  documented way — `npm install --ignore-scripts`, curl-mirror the query-engine
  library + schema-engine for `debian-openssl-3.0.x` (gz names
  `libquery_engine.so.node.gz` / `schema-engine.gz`), point Prisma at them via
  `PRISMA_QUERY_ENGINE_LIBRARY` + `PRISMA_SCHEMA_ENGINE_BINARY`
  (+ `PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING`). Prisma 5.22.0, engine
  `605197351a3c8bdd595af2d2a9bc3025bca48ea2`.
- Same Playwright/Chromium build mismatch — used the pre-installed Chromium
  (`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`) via `PLAYWRIGHT_CHROMIUM_PATH`.
- No new product surprises; the seed dating + running-balance derivation were
  validated end-to-end against the live DB before building the UI.

**Outcome:** `npm run verify` passes; **93** unit/integration (was 70) + **22**
Playwright e2e (was 14) green. No schema change; no new runtime audit advisories;
security review PASS. Milestone complete; annotated tag `v0.4.0` created locally
(tag push blocked by env policy — HTTP 403 — so the human pushes it on merge; see
the milestone report). Session branch pushed. Stopped at the gate; did **not**
begin v0.5.0.

**Carried forward / open items:** statements are a placeholder until v0.9.0;
money-movement (which creates *new* transactions) is v0.7.0 — today's history is
seeded; frontend component unit tests still deferred; security hardening
follow-ups (CSRF, config-driven cookie `secure`, helmet + rate-limit) and
dev-tooling audit advisories still tracked in `QUALITY_REPORT.md`.

---

## Session 3 — v0.3.0 Public bank website and branding — 2026-06-25

**Goal:** Complete only `v0.3.0 — Public bank website and branding` (polished home
page, product marketing pages, image placeholders + prompts, login/open-account
entry points, responsive + accessible polish), **and** address the v0.2.0 review
feedback: a cross-app session-bleed bug. Human approved starting v0.3.0.

**Execution mode:**
- The **bug fix (W-00)** touches auth + routing — a **risky shared area** — so it
  was done **first and serially**, locked behind the full test suite, then
  re-verified at the browser level before any website work.
- The **public-site work** is single-app (`apps/customer`) and was built on a
  shared marketing-component contract for brand consistency.

**The reported bug had TWO root causes (both fixed):**
1. **Shared host-only cookie.** Both apps hit the same backend origin; the session
   cookie had no `Domain`, so it was a host-only `localhost` cookie shared across
   ports — one session for both apps. Fixed with **per-surface cookies**
   (`mer_session` / `mer_ops_session`) selected by request `Origin` (also matched
   by the ops port for LAN hosts).
2. **Logout returned 400 and never revoked.** The customer logout sent a `POST`
   with `Content-Type: application/json` and **no body**; Fastify rejects an empty
   JSON body with 400, so the handler never ran — session not revoked, cookie not
   cleared. The client cleared its own state best-effort, which **masked** it (no
   v0.2.0 test navigated to a protected route after logout). Fixed by not declaring
   a JSON content-type on bodyless requests, plus a backend empty-JSON-body
   tolerance. Found by writing a browser-level e2e that reproduced the exact
   two-tab scenario — a good argument for testing the *server-side* effect of
   logout, not just the client UI state.

**Key decisions:**
- **Per-surface cookies keyed by Origin** instead of a schema/audience column — the
  smallest correct fix, no migration, minimal blast radius.
- **Reusable `components/marketing.tsx` kit** + `lib/nav.ts` (nav split out so the
  presentational module stays component-only and react-refresh-clean).
- **Coming-soon pages** for Cards and Loans/CDs now (clearly tagged) so the nav and
  product story are complete ahead of v0.8.0/v0.9.0.
- **Accessibility baked in**: skip link, landmarks, labelled mobile-menu toggle,
  alt text on every image slot; disclaimer visible site-wide.

**Surprises / environment friction (sandbox only — not a product issue):**
- Same Prisma engine-download block as Sessions 1–2 (ECONNRESET to
  `binaries.prisma.sh` from Prisma's own fetcher, though curl reaches it). Resolved
  by `npm install --ignore-scripts` then **curl-mirroring** the query-engine
  library + schema-engine for `debian-openssl-3.0.x` (note: the remote gz names are
  `libquery_engine.so.node.gz` / `schema-engine.gz`) and pointing Prisma at them via
  `PRISMA_QUERY_ENGINE_LIBRARY` + `PRISMA_SCHEMA_ENGINE_BINARY` (+
  `PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING`). Prisma is now **5.22.0** (engine
  `605197351a3c8bdd595af2d2a9bc3025bca48ea2`).
- Same Playwright/Chromium build mismatch — used the pre-installed Chromium
  (`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`) via the existing
  `PLAYWRIGHT_CHROMIUM_PATH` hook (executablePath bypasses the build-version check).
- The first cut of the browser-level isolation e2e raced (clicked Log out then
  navigated immediately, aborting the in-flight logout). Fixed by waiting for the
  logged-out header before navigating — but that wait is *also* what surfaced the
  real logout-400 bug above.

**Outcome:** `npm run verify` passes; **70** unit/integration + **14** Playwright
e2e green (up from 65 + 8). No schema change. Milestone complete; annotated tag
`v0.3.0` created locally (tag push blocked by env policy — HTTP 403 — so the human
pushes it on merge; see the milestone report). Session branch pushed. Stopped at
the gate; did **not** begin v0.4.0.

**Carried forward / open items:** marketing images are placeholders until real
files are dropped in; `/open-account` is a placeholder pending v0.6.0 onboarding;
security follow-ups (CSRF, config-driven cookie `secure`, helmet + rate-limit) and
dev-tooling audit advisories still tracked in `QUALITY_REPORT.md`.

---

## Session 2 — v0.2.0 Auth, roles, and demo users — 2026-06-25

**Goal:** Complete only `v0.2.0 — Auth, roles, and demo users`: real password
hashing, cookie sessions + lockout, seeded demo users per role, role-based
access control (ownership), login history/audit, and initial Playwright login
tests. Human feedback was an explicit approval to start v0.2.0 with no re-scope.

**Execution mode:** Controlled multi-agent, as the project rules intend.
- The **backend auth core is a risky shared area** (schema, auth, routing), so it
  was implemented **serially** by the orchestrator: shared auth contracts →
  Prisma schema + migration → password/token/lockout/session/access/guard
  modules → routes → seed → backend tests. Locked and verified green first.
- The **two frontend apps are independent**, so once the API contract was locked
  they were built **in parallel** by the Frontend Customer and Frontend
  Operations subagents against a precise written contract, then reviewed.
- A read-only **Security/Permissions** subagent audited the result before the
  gate; the **Testing/QA** work (Playwright login journeys) and **Process Scribe**
  handoff docs closed it out.

**Key decisions:**
- **bcryptjs** (pure-JS) for hashing rather than native bcrypt/argon2 — a real,
  standard library that needs no native toolchain, matching the project's
  cross-platform, zero-friction ethos. Argon2 noted as a future hardening option.
- **Opaque cookie sessions**: a random token in an httpOnly `SameSite=Lax`
  cookie; the DB stores only its **SHA-256 hash**, with a sliding idle timeout.
  Standard-library crypto only — no custom cryptography.
- **`AccountAccess` table as the RBAC backbone**: every owner gets an `owner`
  grant and joint users get scoped grants, so "who can see what" has one source
  of truth and the ownership tests rest on real data (Jordan ⊂ Avery's checking
  only).
- **Two trails**: `LoginEvent` (every attempt → login history + lockout source)
  and `AuditLog` (notable events: login, logout, lockout), mirroring how admin
  actions are audited elsewhere.
- **Login defenses**: lockout after 5 failures (15-min window, fresh after
  expiry) and a decoy-hash comparison so unknown-email and wrong-password
  responses are indistinguishable (no user enumeration).
- **Isolated test DB**: backend integration tests run in a single fork against a
  dedicated `prisma db push` SQLite file, so they never touch the dev DB and
  never race on the shared file.

**Surprises / environment friction (sandbox only — not a product issue):**
- Same Prisma engine-download block as Session 1 (ECONNRESET to
  `binaries.prisma.sh`). Resolved the same way — curl-mirror the engine binaries
  and point Prisma at them via the `PRISMA_*` env vars. Normal machines / CI
  download engines normally.
- Same Playwright/Chromium build mismatch (pre-installed 1194 vs Playwright
  1.61's expected build). Used the existing opt-in `PLAYWRIGHT_CHROMIUM_PATH`
  hook pointing at the pre-installed Chromium.
- Vitest `fileParallelism: false` alone did **not** serialize the two DB-touching
  integration files in the workspace; they raced on the shared SQLite file
  (unique-constraint error). Fixed by also forcing the backend project into a
  single fork (`poolOptions.forks.singleFork`).
- Two initial Playwright selectors were too loose (strict-mode "resolved to 2
  elements" — a duplicate "Log in" CTA on the home page and the operator name in
  both header and intro). Scoped them to the header `banner` role.

**Outcome:** `npm run verify` passes; **65** unit/integration + **8** Playwright
e2e tests green (up from 20 + 3). Milestone complete; annotated tag `v0.2.0`
created locally (tag push blocked by the environment's git policy — HTTP 403 —
so the human pushes it on merge; see the milestone report). Session branch
pushed. Stopped at the gate; did **not** begin v0.3.0.

**Carried forward / open items:** MFA / password-reset / device-trust deferred
within the auth theme to later milestones; CSRF noted as a future hardening item
(mitigated for now by `SameSite=Lax` + a CORS allowlist); dev-tooling audit
advisories and deferred frontend component tests still tracked in
`QUALITY_REPORT.md`.

---

## Session 1 — v0.1.0 Project Foundation — 2026-06-25

**Goal:** Initialize the repo and complete only `v0.1.0 — Project Foundation`:
durable foundation, docs/process framework, local dev setup, and CI.

**Execution mode:** Emulated-sequential. The controlled multi-agent roles
(Planner, Backend, Frontend ×2, Testing/QA, Security, Process Scribe) are defined
in `.claude/agents/`, but v0.1.0 is almost entirely *risky shared area* work
(schema, routing, architecture, CI, repo structure) which the project rules say
to **serialize**. So a single session performed the plan → implement → test →
review → scribe steps in sequence and authored the agent definitions for future
parallelizable milestones.

**What was built:** see `CHANGELOG.md` [0.1.0] and `docs/PROJECT_STATE.md`.
Monorepo, shared money/ledger library, Fastify+Socket.IO+Prisma backend, two
React+Vite apps, branding, tests, CI, and the full docs/process framework.

**Key decisions (see ADR-0001):**
- Stack pinned to stable, mainstream versions for future-session ergonomics.
- **Disciplined ledger from day one** — derived balances, integer minor units,
  conservation tests — even though no real transactions exist yet, so the
  discipline is structural rather than retrofitted.
- **Fastify 5** (not 4): the audit flagged the Fastify-4 → `fast-uri` chain;
  Fastify 5.8.5 is patched, so the backend runtime has **0 audit
  vulnerabilities**. APIs used are v5-compatible.
- **No committed `.env`:** a small `prisma-cli.mjs` wrapper provides the local
  SQLite URL cross-platform; Prisma resolves relative `file:` paths against the
  schema dir for both CLI and client, so `file:./dev.db` is unambiguous.

**Surprises / environment friction (sandbox only — not a product issue):**
- Prisma's engine downloader could not reach `binaries.prisma.sh` through the
  Claude Code Cloud egress proxy (ECONNRESET). Resolved by hosting a **local
  mirror** of the engine binaries (curl works through the proxy) and pointing
  Prisma at it via `PRISMA_ENGINES_MIRROR` + `PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING`.
  Normal machines and GitHub Actions download engines normally — no project
  change needed.
- The pre-installed Chromium (1194) didn't match Playwright 1.61's expected
  build (1228). Added an **opt-in** `PLAYWRIGHT_CHROMIUM_PATH` config hook (no-op
  for normal users/CI) and pointed it at the pre-installed browser.
- Initial seed invariant was too strict (treated a legitimate external
  *payment* outflow as "missing money"). Reframed to the correct invariants:
  transfers net to zero, and every settled credit is bank-originated or a
  transfer leg.

**Outcome:** `npm run verify` passes; 20 unit/integration + 3 smoke tests green;
runtime audit clean. Milestone complete; annotated tag `v0.1.0` created locally
(tag push is blocked by the environment's git policy — HTTP 403 — so the human
pushes it on merge to `main`; see the milestone report for commands). The
session branch was pushed. Stopped at the gate; did **not** begin v0.2.0.

**Carried forward / open items:** dev-tooling audit advisories (vite, vitest,
esbuild); deferred frontend component tests. Tracked in `QUALITY_REPORT.md`.

---

## Blocker-handling policy (applies every session)

If a required task genuinely fails after real attempts: try to fix it; if still
blocked, write a file under `docs/process/blockers/` containing what failed, what
was attempted, remaining errors, likely cause, options (retry / simplify / defer
/ remove / replace), a recommendation, and an exact suggested prompt for the next
session. Then **do not** mark the milestone complete or tag it; stop with a
truthful blocker report. Prioritize truthful project state over appearing done.

_No blockers were filed for v0.1.0, v0.2.0, v0.3.0, or v0.4.0._

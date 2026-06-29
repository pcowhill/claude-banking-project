# Milestone Report — v1.0.0 (Polish, hardening, loans/CDs/interest, final retrospective)

> The **final** milestone. Re-scoped by the human at the v0.9.0 review into a combined
> feature + hardening + polish capstone. Everything is a local **SIMULATION**.

## Scope (as approved + re-scoped by the human)

From `feedback/FEEDBACK_v0.9.0_2026-06-29_0105.md`, four accepted items + the planned
hardening:
1. **Marketing placeholder accuracy (V-02)** — Cards (shipped v0.8.0) + Loans & CDs were
   mis-framed as "coming vX.Y"; corrected to live, clearly-simulated features.
2. **Simulated-date correctness (V-01)** — the clock-fired bill-pay approve date bug; the
   simulation clock is now the single "now" for all money/business timestamps.
3. **Loans / CDs / interest accrual (L-01…L-05)** — pulled into v1.0.0 by the human, built
   on the disciplined ledger + the v0.9.0 clock.
4. **Move to v1.0.0** — the final milestone; ends with the capstone retrospective + tag.
Plus carried hardening: **SEC-1 CSRF (H-01)**, **dev-tooling audit (H-03)**,
**ledger/scheduler TOCTOU disposition (H-02)**, **first frontend unit tests (Q-01)**, and
**expanded e2e (Q-02)**.

## What shipped

### Simulated-date correctness (V-01)
Every money/business route now dates via `simulationNow(prisma)` — transfers, external
movements, **operator approvals & reversals** (the reported bug), simulate-event, admin
funding, onboarding submit/invite/accept/decline, disputes + fraud responses, card
lifecycle, scheduled fires, and interest accrual. Auth/operational timestamps (session
expiry, lockout, login history, heartbeat/status `serverTime`) stay wall-clock by design.
`toTransactionDTOs` gained a deterministic `id` tiebreak so same-simulated-instant entries
order stably (newest-first; cuid is timestamp-prefixed). **Supersedes ADR-0002 #2;**
recorded in **ADR-0003**. A regression test reproduces the human's "City Power and Light
approved on the simulated date, not the wall clock" scenario across a 300-day advance.

### Loans / CDs / interest accrual (L-01…L-05)
- **Shared** `packages/shared/src/lending.ts`: kinds/statuses, rate tables, DTOs, pure
  math (`monthlyAccrualMinor`, `amortizedPaymentMinor`, `projectCdMaturityMinor`,
  calendar helpers) + validators — unit-tested.
- **Schema:** one **additive** migration `lending` — `LendingProduct` (1:1 with a
  `cd`/`loan` Account, holding the terms) + a nullable `Account.interestAccruedThrough`.
  No existing table altered.
- **Services** `apps/backend/src/lending/lending.ts`: open CD, open loan, make loan
  payment, withdraw matured CD — each posting **net-zero** `transfer` pairs (a loan
  account carries the negative owed balance). **Accrual** `apps/backend/src/lending/accrual.ts`:
  `runInterestAccrual(upTo)` posts bank-originated `interest` per elapsed simulated month
  (credit for savings/CDs, debit for loans), bounded + idempotent via a per-target
  bookmark, **wired into `POST /api/ops/clock/advance`** after the scheduler.
- **Routes** `apps/backend/src/routes/lending.ts` (customer CRUD + an ops read list).
- **Seed:** Avery gets a 6-month CD ($2,000) + a Personal loan ($6,000 owed); savings
  accrues at 1.50% APY. `assertSeedLendingIntegrity` guards it.
- **Customer UI:** a `/loans` portal (open/list/pay/withdraw, simulated-date aware) +
  dashboard grouping (cash vs loans/CDs so a loan's negative balance can't distort the
  headline total) + a savings-APY note. **Operations UI:** a read-only `/lending` view +
  an interest-accrual summary on the Simulation clock page.

### Marketing placeholder cleanup (V-02)
Homepage product tiles + `/cards` + `/borrow` present Cards and Loans & CDs as live
features; stale "Arrives vX.Y / coming soon / not built yet" copy removed (incl. adjacent
tags on Savings/Checking/About). Simulation framing kept throughout.

### Hardening
- **CSRF / SEC-1 (H-01):** a global double-submit hook (`apps/backend/src/auth/csrf.ts`):
  non-httpOnly `mer_csrf` cookie on safe GETs + login; mutating requests **carrying a
  session cookie** must send a matching `x-meridian-csrf` header (constant-time compare),
  else 403; login/logout/public-onboarding exempt; unauthenticated requests fall through
  to 401. Both frontends echo the token from `lib/csrf.ts`. Closes the SEC-1 item tracked
  since v0.2.0.
- **Dev-tooling audit (H-03):** runtime `npm audit --omit=dev` = **0**; dev-only
  advisories accepted with a documented upgrade path (no non-breaking fix).
- **Ledger/scheduler TOCTOU (H-02):** accepted residual risk for a single-user local sim.

### Tests (Q-01 / Q-02)
- **First frontend unit tests:** the customer workspace joined the vitest workspace; pure
  customer helpers + a `TransactionList` component test (jsdom + Testing Library).
- Backend: lending math + lending/accrual integration + CSRF + the date regression.
- e2e: `dashboard`/`public-site` specs updated for the reworked dashboard + corrected
  marketing; new lending coverage.

## Gate
<!-- GATE_TBD: fill exact counts at tag time -->
`npm run verify` ✅ **PASS** — lint (0 warnings), typecheck (×4), unit/integration
(Vitest), build (×4). Playwright e2e ✅ green. One additive migration (`lending`).
Runtime `npm audit` = 0. **Security review: PASS-with-findings** (no Critical/High/Medium;
the CSRF session-presence gate + the lending owner-scoped boundary confirmed sound; Low/
Info acted on or accepted). Exact counts: see `QUALITY_REPORT.md` (v1.0.0 section).

## Money discipline (asserted)
Money moves only via `LedgerEntry` rows; balances stay DERIVED. CD/loan opens, payments,
and withdrawals net to zero (settled-total unchanged — tested); the only new money is
bank-originated `interest`; a loan is a negative derived balance; transfers net to zero;
reversals/disputes/fraud are status changes with reason + audit; accrual is idempotent +
bounded.

## Decisions & ADRs
- **ADR-0003** — loans/CDs/interest ledger model + the simulation clock as the single
  money "now" (supersedes ADR-0002 #2), the auth/operational wall-clock exception, the
  ordering tiebreak, CSRF, and the TOCTOU/audit dispositions.

## Known limitations / deferred (unchanged)
- Wall-clock auto-advance by a speed multiplier; a dedicated credit-card account product;
  customer-facing login 2FA; the Vite/Vitest major upgrade (dev-tooling advisories).

## Sandbox-only notes (do not affect users/CI)
- Prisma engines curl-mirrored (query + schema engine for `debian-openssl-3.0.x`, engine
  `605197351a3c8bdd595af2d2a9bc3025bca48ea2`) + `PRISMA_*`/`NODE_EXTRA_CA_CERTS`; the
  `lending` migration was created through the mirrored schema engine. Playwright used the
  pre-installed Chromium via `PLAYWRIGHT_CHROMIUM_PATH`. Standard installs / `npx
  playwright install` work elsewhere.

## Tag
Annotated tag **`v1.0.0`** created locally on the milestone commit. Tag push is blocked by
this environment's git policy (HTTP 403), so the human (re)creates/pushes the tag on merge
to `main` (same as prior milestones). Exact command in this report's footer below.

```
git tag -a v1.0.0 -m "v1.0.0 — Polish, hardening, loans/CDs/interest, final retrospective"
git push origin v1.0.0
```

## Overall
**v1.0.0 meets the quality bar** and completes the experiment: the human's four review
items are all addressed, loans/CDs/interest ride the disciplined ledger + clock with the
conservation invariants asserted, CSRF is enforced, the gate is green, security review is
PASS-with-findings, and the open items are dispositioned honestly. No blockers.

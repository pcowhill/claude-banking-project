# ADR-0003 — Loans / CDs / interest accrual, and the simulation clock as the single money "now"

- **Status:** Accepted
- **Date:** 2026-06-29
- **Milestone:** v1.0.0 (final)
- **Deciders:** Session 12 (emulated multi-agent), per the human's v0.9.0 review

## Context

The human's v0.9.0 review (1) **pulled loans / CDs / interest accrual into v1.0.0**
now that the simulation clock exists, and (2) reported a **time-travel date bug**: a
clock-fired bill pay was **approved/posted on the wall-clock date**, not the simulated
date. ADR-0002 (v0.9.0) had deliberately kept immediate/ops actions on wall-clock to
avoid collapsing same-session entries onto one `createdAt`. This ADR records the
v1.0.0 decisions that resolve both, building on the disciplined ledger + the clock +
the v0.7.0 money service, all in the **risky shared areas** (schema, ledger, clock,
auth/CSRF) that were serialized and reviewed first.

## Decisions

1. **The simulation clock is the SINGLE authoritative "now" for ALL money/business
   dating — superseding ADR-0002 decision #2.** Every money/business timestamp now
   reads `simulationNow(prisma)`: immediate transfers + external movements, ops
   approvals/reversals, the bill-pay approve that showed the wall-clock date,
   simulate-event, admin funding, onboarding submit/invite/accept/decline, disputes +
   fraud responses, card lifecycle, scheduled fires (already simulated in v0.9.0), and
   interest accrual. Nothing money/business-facing uses `new Date()`. This is the
   honest behavior the human asked for ("everything uses the simulated date").

2. **Auth/operational timestamps stay on the wall clock — by design.** Session
   expiry, the lockout window (`lockedUntil`), login-history rows, and the
   heartbeat/`/status` `serverTime` track REAL elapsed time, not simulated-world time.
   Tying session lifetime to a manually-advanced clock would either never expire
   sessions or expire them all at once on an advance — a security regression. The
   boundary is simple to state: **business/money events use the simulation clock;
   authentication/operational events use the wall clock.**

3. **Same-instant ordering is made deterministic instead of avoided.** ADR-0002 #2's
   concern was real: the clock sits still between advances, so several entries created
   in one session share an identical timestamp. Rather than keep immediate actions on
   wall-clock to dodge it, `toTransactionDTOs` now breaks ties by `id`. The id is a
   cuid (timestamp-prefixed → lexically ~chronological), so same-instant entries get a
   stable order that also reads newest-first. Backend tests that picked "the row I just
   created" by `createdAt desc` now also order by `id desc`.

4. **Loans / CDs / interest accrual ride the existing ledger — no new money
   mechanics.** A CD and a loan are each a dedicated `cd`/`loan` Account (both already
   in `ACCOUNT_TYPES`) with a 1:1 `LendingProduct` row holding only the TERMS (rate,
   term, principal, maturity, the loan's level payment, the accrual bookmark). The
   MONEY lives in the account's append-only ledger:
   - **Open a CD / disburse a loan / pay a loan / withdraw a matured CD** each post a
     PAIR of `transfer` legs (same amount + instant) that NET TO ZERO. A CD account
     carries a positive balance; a **loan account carries a NEGATIVE balance** (the
     amount owed) that trends to zero as it is repaid. Money is only relocated.
   - **Interest accrual** is the only money that ENTERS for these products, and it is
     **bank-originated** (`origin: 'interest'`, already allowed to move the system
     total): a CREDIT on savings/CDs (earned), a DEBIT on loans (owed), dated at the
     simulated accrual date. Balances stay DERIVED; nothing stores or edits a balance.

5. **Accrual is clock-driven, monthly, bounded, and idempotent — no wall-clock
   timer.** `runInterestAccrual(upTo)` runs on `POST /api/ops/clock/advance`, right
   after the scheduler. For each interest-bearing target it posts one `interest` entry
   per whole simulated month elapsed since its bookmark (`Account.interestAccruedThrough`
   for savings; `LendingProduct.lastAccruedAt` for CDs/loans), compounding on the
   running balance, capped per advance, dated at each month's simulated anniversary.
   The bookmark only advances by whole accrued months, so re-running with the same
   `upTo` accrues nothing new and a partial month is never accrued (no drift). CDs stop
   at maturity (then `matured`); a fully-repaid loan becomes `paid_off` + its account
   `closed`. The seed sets savings `interestAccruedThrough` to seed time so history is
   never back-accrued. Each target is guarded so one failure can't strand the advance.

6. **One additive migration.** `lending` adds the `LendingProduct` table + a nullable
   `Account.interestAccruedThrough` column. **No existing table is rebuilt**, so
   money/auth/ops/card/schedule tables are untouched.

7. **CSRF is now enforced (SEC-1), closing the accepted v0.7.0–v0.9.0 item.** A global
   double-submit hook sets a non-httpOnly `mer_csrf` cookie on safe GETs + login, and
   requires a matching `x-meridian-csrf` header on every state-changing request **that
   carries a session cookie** (the only forgeable case). Login, logout, and the public
   onboarding submit are exempt; unauthenticated requests fall through to the honest
   401. The token only authorizes — RBAC + the session guards are unchanged, so it can
   only add a gate. `SameSite=Lax` + the CORS allowlist remain as defense in depth.

8. **Ledger/scheduler TOCTOU + bookkeeping (L-2/L-3/F-2): accepted residual risk,
   documented.** The available-funds check is read just outside the write transaction
   in the money service (and now the scheduler + lending). For this single-user local
   simulation it is benign: balances are DERIVED (never corrupted), SQLite serializes
   writers, the catch-up loop is bounded, and the worst case is a transient, auditable
   negative-available — never a lost or created dollar. Tightening the locked v0.7.0
   write path carries more regression risk than the residual risk it removes, so it is
   formally **accepted** for the simulation rather than changed at the 1.0 capstone.

9. **Dev-tooling npm-audit advisories: accepted, with an upgrade path.** Runtime
   `npm audit --omit=dev` is **0**. The 5 advisories are all dev-only
   (vite/vitest/esbuild/vite-node/@vitest/mocker — the dev server + test runner, never
   shipped) and have no non-breaking fix (only `vite@8`/`vitest@3` majors). Forcing
   that bump at the 1.0 tag risks destabilizing the toolchain for advisories that don't
   affect the shipped artifact or a local single-user sim, so the disposition is
   **documented acceptance** with the upgrade path recorded in `QUALITY_REPORT.md`.

## Consequences

- Advancing the clock now has audited ledger effects from BOTH the scheduler and
  interest accrual; both are ops/admin-gated and forward-only.
- Customers' lending products appear as real accounts (a CD positive, a loan negative);
  the customer dashboard groups cash vs. loans/CDs so a loan's negative balance never
  distorts the headline total.
- The simulation-safety rules (no real money/providers/lenders, derived balances,
  reason + audit on money-affecting admin actions, visible disclaimer) are preserved
  and test-backed (**398** unit/integration across 34 files, was 332 — lending +
  accrual + CSRF + the date-regression + the first frontend unit tests; plus 48 e2e).
- Out of scope (unchanged): wall-clock auto-advance by `speed`; a dedicated
  credit-card account product; customer-facing login 2FA.

# Human Review — v1.0.0 (Polish, hardening, loans/CDs/interest, final retrospective)

> What to look at, how to try it, and the decisions from the **final** milestone.
> Everything is a local **SIMULATION** — no real money, lenders, billers, payment
> networks, or wall-clock timer.

## How to run it

```
npm install
npm run db:reset
npm run verify      # the gate — lint + typecheck + tests + build
npm run dev         # backend :3000, customer :5173, operations :5174
```

Demo sign-ins (unchanged): **Avery** `avery.customer@example.com` / `Customer123!`
(customer app `:5173`); **Sam** `sam.operator@example.com` / `Operator123!`
(operations console `:5174`); **Riley** `riley.admin@example.com` / `Admin123!` (admin).

## Your v0.9.0 feedback → exactly what we did

Your review is saved verbatim at `feedback/FEEDBACK_v0.9.0_2026-06-29_0105.md`. You
raised four things; all four are done.

### 1. "Placeholders that should no longer be there" (Cards / Loans & CDs) — FIXED

You were right. Cards shipped in v0.8.0, yet the homepage tile and the `/cards` page
still said "Arrives v0.8.0 / coming soon"; Loans & CDs were mis-tagged "v0.9.0" even
though that milestone only delivered the clock + scheduler. We **removed every stale
"coming in a future version" claim** and now present both as **live, clearly-simulated**
features:
- The homepage product tiles for **Cards** and **Loans & CDs** now read "Explore now"
  and link to the real pages (no more "Arrives vX.Y" milestone tags).
- `/cards` is a shipped-feature page (manage cards in the portal at `/wallet`).
- `/borrow` (Loans & CDs) is a real product page showing the actual **CD and loan rate
  tables** and the savings APY — and it builds the feature you asked for (item 3), so
  the copy describes a product that genuinely exists rather than being deleted.
- We also caught and fixed adjacent stale version tags on `Savings`, `Checking`, and the
  `About` roadmap so nothing on the site contradicts what's actually shipped.

So the answer to "is this right?" is **yes** — and rather than just deleting the Loans &
CDs placeholder, we built the product and made the copy true.

### 2. The time-travel date bug (bill pay approved on the real date) — FIXED

You found a genuine bug: a scheduled **bill pay to City Power and Light** fired into the
future correctly (it showed pending on the *simulated* future date), but when an
operator **approved** it in Meridian Ops, it posted on **June 28 (the real wall-clock
date)** instead of the simulated date. Root cause: the operator-approval path (and a
few other money paths) still stamped entries with the real clock.

We made the **simulation clock the single source of "now" for everything money- and
business-related** — transfers, deposits/movements, **operator approvals & reversals**,
disputes/fraud, card actions, onboarding/admin funding, scheduled fires, and interest
accrual all now date at the **simulated** time. A regression test reproduces your exact
scenario: advance the clock ~300 simulated days, fire the City Power and Light bill pay,
approve it, and assert the posted date is the **simulated** date (300 days out), never
"today."

One deliberate exception (please sanity-check you agree): **authentication/operational**
timestamps stay on the real clock — session expiry, the account-lockout window, your
sign-in history, and the server "heartbeat" time. These track *real* elapsed time; tying
your session's lifetime to a clock that only moves when an operator fast-forwards would
either never log you out or log everyone out the instant time is advanced. The rule is
simple: **money/business events use the simulated clock; security/operational events use
the real clock.** This (and why it supersedes a v0.9.0 decision) is written up in
`docs/process/decisions/ADR-0003-...md`.

### 3. Loans / CDs / interest accrual — BUILT (you pulled them into v1.0.0)

You asked: now that the clock exists, can these be pursued in v1.0.0? "If so, do them."
We did. All on the existing disciplined ledger (no new money mechanics):
- **Certificates of Deposit (CDs):** open a CD from your checking/savings; it earns a
  simulated APY and **matures** after its term, after which you can withdraw the
  proceeds. Opening/withdrawing move money as balanced (net-zero) ledger entries.
- **Loans:** open a fixed-term loan; the cash is disbursed to your checking and the loan
  account carries what you **owe** (a negative balance). Make payments (the scheduled
  monthly amount or a custom amount); pay it off and it closes.
- **Interest accrual on the clock:** when an operator advances the simulation clock,
  interest accrues for each elapsed simulated month — a **credit** to savings and CDs
  (you earn), a **debit** to loans (you owe more) — posted as bank-originated `interest`
  ledger entries dated at the simulated accrual date. No background timer; it happens on
  clock advance, like the scheduler.
- Avery is seeded with a **6-month CD ($2,000)** and a **Personal loan ($6,000 owed)** so
  you can see it immediately, and savings now earns **1.50% APY (simulated)**.

### 4. "Good to move onto v1.0.0" — done; this is the final milestone

v1.0.0 also completes the planned **hardening**: real **CSRF protection** is now enforced
on state-changing requests (the long-tracked SEC-1 item), the dev-tooling audit and the
ledger/scheduler TOCTOU items are dispositioned (below), and we added the project's first
**frontend unit tests** plus new e2e coverage. The experiment's **final retrospective**
is at `docs/process/RETROSPECTIVE.md` (capstone section).

## What to try (headline flows)

1. **Loans & CDs (customer).** As **Avery**, open **Loans & CDs** (`/loans`, linked from
   the dashboard). You'll see the seeded CD and loan. Open a new CD (pick a term — the
   APY comes from the rate table) or a loan (see the monthly payment preview), make a
   loan payment, and — after the clock is advanced past a CD's maturity — withdraw it.
2. **Watch interest accrue / the date fix (operator → customer).** As **Sam**, open
   **Simulation clock** and fast-forward (e.g. +1 month, or +300 days to mature the
   6-month CD). The page now shows an **interest-accrual summary** alongside fired
   schedules. Approve the fired **City Power and Light** bill pay in **Request queues** —
   it now posts on the **simulated** date. Back as **Avery**, savings/CD balances grew by
   interest, the loan owes a bit more, and statement dates all read the simulated time.
3. **The corrected marketing site.** Visit `/` , `/cards`, and `/borrow` signed out —
   no more "coming soon vX.Y"; everything reflects what's actually built.

## Decisions & open items (all tracked)

- **CSRF (SEC-1)** is enforced via a double-submit token; `SameSite=Lax` + the CORS
  allowlist remain as defense in depth. Security review: **PASS-with-findings** (no
  Critical/High/Medium; the two new boundaries — the CSRF session-presence gate and the
  lending owner-scoped boundary — were confirmed sound; a few Low/Info items were acted
  on or accepted for a local sim).
- **Dev-tooling npm-audit:** runtime `npm audit --omit=dev` = **0**. The remaining
  advisories are all dev-only (vite/vitest/esbuild — the dev server + test runner, never
  shipped) with no non-breaking fix; we **document the accepted disposition** + upgrade
  path rather than force a destabilizing major bump at the 1.0 tag.
- **Ledger/scheduler TOCTOU + bookkeeping (L-2/L-3/F-2):** accepted residual risk for a
  single-user local simulation (balances are derived, SQLite serializes writers, worst
  case is a transient auditable negative-available — never a lost/created dollar).
- **Out of scope (unchanged):** wall-clock auto-advance by a speed multiplier; a
  dedicated credit-card *account product*; customer-facing login 2FA.

## Money discipline (still enforced + tested)

Money moves only by appending `LedgerEntry` rows — never a stored/edited balance. CD/loan
opens, payments, and withdrawals post **net-zero** `transfer` pairs; the only new money is
**bank-originated `interest`**; a loan is simply a negative derived balance; transfers
still net to zero; reversals/disputes/fraud are ledger **status** changes with a reason +
audit. Balances stay DERIVED.

## Gate

`npm run verify` ✅ passes (lint 0 warnings, typecheck ×4, build ×4) — **398**
unit/integration tests (34 files; was 332, incl. the first frontend unit tests) +
**48** Playwright e2e (was 44), all green. One **additive** migration (`lending`).
Runtime `npm audit` = 0. Security review **PASS-with-findings** (no Critical/High/Medium).
Details in `docs/process/MILESTONE_REPORT_v1.0.0.md` and `QUALITY_REPORT.md`.

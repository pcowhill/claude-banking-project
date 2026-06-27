# Human Review — v0.9.0 (Simulation clock & scheduled payments)

> What to look at, how to try it, and the decisions from this milestone.
> Everything is a local **SIMULATION** — no real money, billers, payment networks,
> or wall-clock timer.

## How to run it

```
npm install
npm run db:reset
npm run verify      # the gate — lint + typecheck + tests + build
npm run dev         # backend :3000, customer :5173, operations :5174
```

Demo sign-ins (unchanged): **Avery** `avery.customer@example.com` / `Customer123!`
(customer app `:5173`); **Sam** `sam.operator@example.com` / `Operator123!`
(operations console `:5174`).

## Your v0.8.0 feedback → what we did

You wrote (verbatim saved at `feedback/FEEDBACK_v0.8.0_2026-06-27_0219.md`):

> "All looks good so far. Keep up the good work!"

A clean "continue"-style approval — no bugs, no change requests. Per the session
protocol we saved it verbatim and proceeded with the next planned milestone,
**v0.9.0 — Simulation clock + recurring/scheduled payments** (+ statement cycles),
which is also where the recurring-payments item deferred from v0.7.0 finally lands
(it needed the clock).

## What to try (the headline flow)

1. **Schedule a payment (customer).** As **Avery**, open **Scheduled payments**
   (`/scheduled-payments`, linked from the dashboard). You'll see the **current
   simulated date** and two seeded schedules (a monthly checking→savings transfer; a
   monthly bill pay to "City Power & Light"). Create your own — a **transfer** between
   your accounts or a **bill pay** — choose a frequency (one time / weekly / monthly)
   and how many days out the first run is. Nothing moves yet; it's an instruction.
2. **Advance the clock and watch it fire (operator).** As **Sam**, open the new
   **Simulation clock** page (left nav). You'll see the live simulated date, a
   **fast-forward** control, and a table of every customer's schedules. Click
   **+1 week**: the due schedules **fire** — the summary shows what posted (internal
   transfers) and what was **queued** (bill pays). The bill pays now appear in
   **Request queues** as pending reviews you can **approve** (which posts them) exactly
   like a manual movement.
3. **See the effects (customer).** Back as **Avery**, the dashboard balances reflect the
   fired transfer (money moved checking→savings), and a fired bill pay shows as
   **Pending** until Sam approves it. Open **Statements** (`/statements`) to see monthly
   statement periods derived from the simulated date — opening/closing balances, period
   credits/debits, and entry counts.

## Money discipline (unchanged, verified)

Every scheduled fire moves money **only** by appending ledger entries — **no balance is
ever stored or edited**. An internal transfer posts **both** legs at the due date and
**nets to zero**; a bill pay writes a **pending** debit + a reviewable ops item (it
posts only when an operator approves). If an occurrence can't be covered, it is
**skipped** (no entry) and audited — never silently dropped. The clock is
**forward-only** (it can't rewind the append-only ledger) and every advance is
**audited**. The only schema change is an **additive** migration (`PaymentSchedule`).

## Quality gate

- `npm run verify` ✅. **332** unit/integration tests (was 282) + **44** Playwright e2e
  (was 41; **+3**) green; **0** lint warnings; runtime `npm audit` = **0**.
- A **runtime smoke** against a live backend confirmed advancing the clock fires the
  seeded schedules as real ledger entries (transfer posts $200 and nets to zero; bill
  pay queues a $95 review) and the clock-reading heartbeat boots cleanly.
- **Security review: PASS-with-findings** — no Critical/High/Medium. RBAC/IDOR on every
  new route, the owner-scoped firing privilege boundary (a fire can only reach accounts
  the owner already holds), payload-trust (no client-injected ledger ids), money
  discipline, the forward-only audited clock, the bounded catch-up loop, the
  additive-only migration, data exposure, and simulation safety were all verified and
  are test-backed. Findings (all Low/info):
  - **Acted on now (L-1):** the scheduler no longer rethrows an unexpected error after
    an occurrence is "claimed" — any fire failure is recorded as a skip and the rest of
    the advance still processes (guarded per-schedule). Prevents a lost occurrence /
    stranded run in an edge case. (Funds/access skips were already handled.)
  - **Tracked for the later ledger-hardening pass (L-2/L-3):** the run-count/last-run
    bookkeeping is a separate write after the money posts (a crash there is a cosmetic
    count drift, never a balance error); and the v0.7.0 funds-check TOCTOU is now also
    reachable from the scheduler (same accepted item — bounded, auditable, never a
    lost/created dollar). Both recorded in `QUALITY_REPORT.md`.
  - SEC-1 (CSRF / SameSite=Strict) remains accepted for the local sim (Lax + CORS) →
    v1.0.0 hardening.

## Decisions / interpretations this milestone

- **Scope:** delivered the **clock + scheduler + statements** slice of the v0.9.0 theme.
  **Loans / CDs / interest accrual** (the rest of the theme) are **not** in this slice;
  they remain roadmapped (see `ROADMAP_HISTORY.md`). Say the word to pull them forward.
- **Time model (ADR-0002):** the scheduler dates each fired entry at its simulated
  **due date**; schedule due-dates and the statements window read the clock. Immediate
  transfers/movements and ops actions keep wall-clock timestamps — a *static* sim clock
  would otherwise stamp many same-session entries with one identical time and scramble
  their ordering. The clock is seeded to the seed instant, so sim time and wall time are
  aligned at the start of the demo.
- **What advances time:** there is **no** wall-clock background timer — the clock moves
  only when an operator advances it (then the scheduler fires what's due). Auto-advance
  by a "speed" multiplier is intentionally out of scope (a possible later add).

## Open questions for you

1. Does the headline flow behave as you'd expect — **schedule** a payment, **advance**
   the clock, watch it **fire** (transfer posts; bill pay queues a review you approve),
   and does the **Statements** page read right as of the simulated date?
2. The fast-forward presets are +1 hour / +1 day / +1 week / +1 month (plus a custom
   days+hours). Is that the right granularity, or would you like finer/coarser control?
3. Ready to proceed to **v1.0.0** (polish, hardening, security pass, final
   retrospective), or would you like the rest of the v0.9.0 theme (loans/CDs/interest)
   pulled into a v0.9.x first, or any changes to this milestone?

## Tag

Version is bumped to **0.9.0**; an annotated **`v0.9.0`** tag is created locally on the
milestone commit. **Tag push is blocked in this environment (HTTP 403)** — please tag on
merge to `main`:
```
git tag -a v0.9.0 -m "v0.9.0 — Simulation clock & scheduled payments"
git push origin v0.9.0
```

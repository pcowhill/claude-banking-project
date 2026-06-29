# NEXT_SESSION

> Read this third (after `CLAUDE.md` and `docs/PROJECT_STATE.md`). It tells the
> next session exactly what to do.

## Where we are

`v1.0.0 — Polish, hardening, loans/CDs/interest, final retrospective` is **complete**
and tagged locally (annotated tag on the milestone commit; the human pushes it on merge
to `main` — tag push is blocked in this environment, HTTP 403). **v1.0.0 is the FINAL
planned milestone.** It was re-scoped by the human at the v0.9.0 review from a pure
hardening pass into a combined **feature + hardening + polish** capstone. The whole
roadmap (`v0.1.0 → v1.0.0`) is now delivered. Everything is a local **SIMULATION** — no
real money, lenders, billers, payment networks, or wall-clock timer.

What v1.0.0 shipped, all on the existing disciplined ledger + the v0.9.0 clock, keeping
money discipline:

- **Loans / CDs / interest accrual** (pulled into v1.0.0 by the human now that the clock
  exists). A CD / loan is a dedicated `cd`/`loan` **`Account`** + a 1:1 **`LendingProduct`**
  holding the terms; **open CD / open loan / pay loan / withdraw matured CD** post
  **net-zero** `transfer` pairs (a loan carries a NEGATIVE owed balance). **Interest
  accrues on clock advance** as bank-originated `interest` entries (credit savings + CDs,
  debit loans) — monthly, bounded, idempotent, dated at the simulated date. Customer
  **`/loans`** portal; operations read-only **`/lending`** view + an accrual summary on
  `/clock`. Routes: `POST/GET /api/lending`, `/api/lending/cds`, `/api/lending/loans`,
  `/api/lending/loans/:id/pay`, `/api/lending/cds/:id/withdraw`, `GET /api/ops/lending`.
  One **additive** migration `lending` (`LendingProduct` + nullable
  `Account.interestAccruedThrough`). Seed: Avery has a 6-month CD ($2,000) + a Personal
  loan ($6,000 owed); savings earns 1.50% APY.
- **Simulated-date correctness:** every money/business route now dates via
  `simulationNow(prisma)` (fixing the reported clock-fired bill-pay approve-date bug);
  auth/operational timestamps (session expiry, lockout, login history, heartbeat/status
  `serverTime`) stay wall-clock by design. Deterministic `id` tiebreak in
  `toTransactionDTOs`. **Supersedes ADR-0002 #2** — see
  `docs/process/decisions/ADR-0003-lending-and-simulated-date-everywhere.md`.
- **CSRF (SEC-1) enforced:** a global double-submit token (`mer_csrf` cookie +
  `x-meridian-csrf` header), session-presence gated, login/logout/public-onboarding
  exempt, constant-time compare. Both apps echo the token.
- **Marketing placeholders fixed:** the homepage tiles + `/cards` + `/borrow` present
  Cards + Loans & CDs as live; stale "coming vX.Y" copy removed.
- **First frontend unit tests** added (the customer app joined the Vitest workspace: pure
  helpers + a `TransactionList` jsdom component test) — a starter set.
- **Dispositions:** runtime `npm audit` = 0; dev-tooling advisories accepted with a
  documented upgrade path; ledger/scheduler TOCTOU accepted as benign residual risk for a
  single-user sim. Security review **PASS-with-findings** (no Critical/High/Medium).
- Gate: `npm run verify` ✅ + Playwright e2e green. Exact unit/integration + e2e counts
  are finalized at tag time (see `MILESTONE_REPORT_v1.0.0.md` / `QUALITY_REPORT.md`).

**The next planned milestone is: none — the planned roadmap is complete.** See
"If the human wants to continue" below.

## Session-start protocol (must do, in order — still applies)

The constitution's protocol does **not** stop just because the roadmap is complete. A
new session must still:

1. Read `CLAUDE.md`, then `docs/PROJECT_STATE.md`, then this file.
2. **Save the human's pasted feedback VERBATIM** to
   `docs/process/feedback/FEEDBACK_v1.0.0_<YYYY-MM-DD_HHMM>.md` BEFORE acting on it
   (structure in `docs/process/HUMAN_FEEDBACK_LOG.md`; the raw block is never edited or
   paraphrased afterward).
   - If the feedback is only "continue", still save it verbatim. Because the planned
     roadmap is complete, "continue" is **not** an instruction to invent a new milestone —
     interpret it as approval of v1.0.0 and confirm with the human which (if any) deferred
     item to pull in, rather than starting unscoped work.
3. Interpret the feedback in that file; update `docs/process/HUMAN_FEEDBACK_LOG.md`.
4. Update `docs/process/TASK_BOARD.md` (the source of truth) + the roadmap/process logs if
   the feedback opens new scope.
5. Do **only** the scope the feedback approves (see below). Do not begin a new feature
   without an explicit, scoped go-ahead.
6. If you do take on new scope, stop at its gate and produce the milestone handoff docs +
   an annotated tag, exactly as every prior milestone did.

## What a next session is most likely to be

Because the roadmap is complete, a new session is almost certainly one of:

- **The human's review of v1.0.0** — read it, save it verbatim, and address any
  fixes/polish the human raises (a patch — name the docs `vX.Y.Z`, as with v0.6.1/v0.6.2).
- **Pulling in a deferred item** (the human's call), each a fresh scoped milestone:
  - **Clock auto-advance by a "speed" multiplier** — today the clock moves only on an
    explicit operator advance; the `speed` column is informational. (Touches the
    clock/scheduler — a risky shared area; serialize + review.)
  - **A dedicated `credit_card` account product** (a revolving credit line) — distinct
    from v0.8.0 cards (which attach to checking/savings) and v1.0.0 lending (`cd`/`loan`).
  - **Customer-facing login 2FA** — uses the simulated-messaging seam to issue a
    `SimulatedEvent` OTP (the v0.6.0 Q-02 path). (Touches auth — serialize + review.)
  - **The Vite/Vitest major upgrade** clearing the dev-tooling npm-audit advisories
    (runtime audit is already 0; this is the toolchain). (Touches CI/tooling — serialize.)
  - Optionally, **broader frontend component test coverage** (v1.0.0 added only a starter
    set).

If none of these is requested, there is nothing further to build — keep the docs truthful
and stop.

## Guardrails (unchanged — apply to any future work)
- Serialize risky shared areas (schema, **auth/CSRF**, routing, real-time, the **ledger**,
  the **clock/scheduler**, CI, architecture). Lock any API/socket contract before the
  frontends.
- No secrets committed; `.env` stays ignored.
- Maintain the simulation disclaimer in README + both apps; never imply real money or
  bank-grade software.
- Money moves ONLY via explicit ledger entries (never a stored/edited balance); transfers
  + lending opens/payments/withdrawals net to zero; the only new money is bank-originated
  (`interest`/`deposit`/`adjustment`), dated at the simulated date; admin adjustments +
  reversals require a reason + audit. Balances stay DERIVED.
- Keep the v1.0.0 time rule: **money/business events use the simulated clock;
  security/operational events use the real clock** (ADR-0003).
- Truthful state: if blocked, file a blocker under `docs/process/blockers/` and stop — do
  not tag a milestone whose `npm run verify` did not pass.
- Do not regress any prior milestone (v0.2.0 auth → v1.0.0 lending/clock/CSRF).

## Sandbox note (Claude Code Cloud only)
If Prisma's engine download or the Playwright Chromium build don't come through the
egress proxy: mirror the Prisma engine binaries via curl + set
`PRISMA_QUERY_ENGINE_LIBRARY` + `PRISMA_SCHEMA_ENGINE_BINARY`
(+ `PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING`) for `debian-openssl-3.0.x` (engine
`605197351a3c8bdd595af2d2a9bc3025bca48ea2`); point Playwright at the pre-installed
Chromium via `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium` — see
`docs/process/EXPERIMENT_LOG.md`. None of this affects normal machines or CI.

## The copy/paste starter prompt
A ready-to-use prompt for a brand-new Claude Code session (reviewing v1.0.0 / deciding on
a deferred item) lives at `docs/process/NEXT_SESSION_PROMPT_v1.0.0.md` (it includes the
feedback placeholder).

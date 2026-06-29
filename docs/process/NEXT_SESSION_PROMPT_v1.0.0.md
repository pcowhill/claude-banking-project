# Copy/paste starter prompt for the NEXT session (review v1.0.0 — the final milestone)

> Paste this into a fresh Claude Code session. Replace the feedback block at the
> bottom with your actual review of v1.0.0. If your only feedback is "continue",
> the session will still save it verbatim — but because the planned roadmap is
> complete, it will treat "continue" as approval of v1.0.0 and ask which (if any)
> deferred item to pull in, rather than inventing a new milestone.

---

You are continuing the Meridian simulated-banking experiment (a local-only
SIMULATION — never real money or real banking integrations). The repo is the source
of truth, not chat history.

Current state: **v1.0.0 — Polish, hardening, loans/CDs/interest, final retrospective is
COMPLETE and tagged locally** (annotated tag created on the milestone commit; the human
pushes it on merge to `main` — tag push is blocked in this environment, HTTP 403).
**v1.0.0 is the FINAL planned milestone** — it was re-scoped by the human at the v0.9.0
review from a pure hardening pass into a combined **feature + hardening + polish**
capstone, so the whole roadmap (`v0.1.0 → v1.0.0`) is now delivered. v1.0.0 added, all on
existing foundations and keeping money discipline:

- **Loans / CDs / interest accrual** (pulled into v1.0.0 by the human now that the clock
  exists). A CD / loan is a dedicated `cd`/`loan` **`Account`** + a 1:1 **`LendingProduct`**
  holding only the terms; **open CD / open loan / pay loan / withdraw matured CD** post
  **net-zero** `transfer` leg pairs (a loan account carries a NEGATIVE — owed — balance).
  **Interest accrues on clock advance** as bank-originated `interest` entries (a credit to
  savings + CDs, a debit to loans) — monthly, bounded, idempotent, dated at the simulated
  accrual date (wired into `POST /api/ops/clock/advance` right after the scheduler).
  Customer **`/loans`** portal; operations read-only **`/lending`** view + an
  interest-accrual summary on `/clock`. Routes: `POST/GET /api/lending`,
  `/api/lending/cds`, `/api/lending/loans`, `/api/lending/loans/:id/pay`,
  `/api/lending/cds/:id/withdraw`, `GET /api/ops/lending`. One **additive** migration
  `lending` (`LendingProduct` + a nullable `Account.interestAccruedThrough`). Seed: Avery
  has a 6-month CD ($2,000) + a Personal loan ($6,000 owed); savings earns 1.50% APY.
- **Simulated-date correctness:** every money/business route now dates via
  `simulationNow(prisma)` — including the **operator approval** that showed the
  wall-clock date (the bug you reported) — fixing that whole class. Auth/operational
  timestamps (session expiry, lockout, login history, the heartbeat/status `serverTime`)
  stay wall-clock by design. A deterministic `id` tiebreak in `toTransactionDTOs` keeps
  same-instant entries ordered stably. **Supersedes ADR-0002 #2**; recorded in
  **`docs/process/decisions/ADR-0003-lending-and-simulated-date-everywhere.md`**.
- **CSRF (SEC-1) enforced:** a global double-submit token (`mer_csrf` cookie +
  `x-meridian-csrf` header), session-presence gated, login/logout/public-onboarding
  exempt, constant-time compare. Both apps echo the token.
- **Marketing placeholders fixed:** the homepage tiles + `/cards` + `/borrow` present
  Cards + Loans & CDs as live (clearly-simulated) features; stale "coming vX.Y" copy gone.
- **First frontend unit tests** added (the customer app joined the Vitest workspace: pure
  helpers + a `TransactionList` jsdom component test) — a starter set.
- Gate: `npm run verify` ✅ (lint 0 warnings; typecheck ×4; unit/integration; build ×4) +
  Playwright e2e green; one **additive** migration (`lending`); runtime `npm audit` = 0
  (dev-tooling advisories accepted with a documented upgrade path); ledger/scheduler
  TOCTOU accepted as benign residual risk for a single-user sim; security review
  **PASS-with-findings** (no Critical/High/Medium — the CSRF session-presence gate + the
  lending owner-scoped boundary confirmed sound). Exact unit/integration + e2e counts are
  in `docs/process/MILESTONE_REPORT_v1.0.0.md` / `QUALITY_REPORT.md`. All prior milestones
  intact.

Do these steps in order:

1. Read `CLAUDE.md`, then `docs/PROJECT_STATE.md`, then `docs/NEXT_SESSION.md`.
2. Save the feedback below VERBATIM to
   `docs/process/feedback/FEEDBACK_v1.0.0_<YYYY-MM-DD_HHMM>.md` before acting on it,
   following `docs/process/HUMAN_FEEDBACK_LOG.md`. Never edit the raw block afterward.
   If the feedback is only "continue", still save it verbatim — but the planned roadmap is
   complete, so do **not** invent a new milestone: treat "continue" as approval of v1.0.0
   and ask which (if any) deferred item to pull in.
3. Interpret the feedback (accepted / deferred / rejected with reasons / questions);
   update `docs/process/HUMAN_FEEDBACK_LOG.md`.
4. Update `docs/process/TASK_BOARD.md` (the source of truth) + roadmap/process logs if the
   feedback opens new scope.
5. Then do **only** what the feedback approves. The roadmap is complete, so the realistic
   next jobs are:
   - **Address review fixes / polish** the human raises on v1.0.0 — ship them as a patch
     (name the docs `vX.Y.Z`, exactly as v0.6.1 / v0.6.2 did).
   - **Pull in a deferred item** (the human's explicit, scoped go-ahead) — each is a fresh
     scoped milestone, planned + gated like every prior one:
     - **Clock auto-advance by a "speed" multiplier** (today the clock moves only on an
       explicit operator advance; the `speed` column is informational) — touches the
       **clock/scheduler** (risky shared area; serialize + review).
     - **A dedicated `credit_card` account product** (a revolving credit line) — distinct
       from v0.8.0 cards (which attach to checking/savings) and v1.0.0 lending
       (`cd`/`loan`); a schema migration (serialize + review).
     - **Customer-facing login 2FA** — issue a `SimulatedEvent` OTP via the
       simulated-messaging seam (the v0.6.0 Q-02 path) — touches **auth** (serialize +
       review).
     - **The Vite/Vitest major upgrade** clearing the dev-tooling npm-audit advisories
       (runtime audit is already 0; this is the toolchain) — touches **CI/tooling**.
     - Optionally, **broader frontend component test coverage** (v1.0.0 added a starter
       set only).
   Do **not** begin a new feature without an explicit, scoped go-ahead. Keep money
   discipline (every movement is a ledger entry; nothing edits a balance; transfers +
   lending opens/payments/withdrawals net to zero; the only new money is bank-originated,
   dated at the **simulated** clock per ADR-0003). Auth/CSRF, routing, real-time, the
   ledger, the clock/scheduler, and CI remain the **risky shared areas** — serialize and
   review; lock any API/socket contract before the frontends.
6. If you take on new scope, stop at its milestone gate and produce the handoff docs + an
   annotated tag. Do NOT keep going past the gate. If genuinely blocked, file a blocker
   under `docs/process/blockers/` and stop honestly instead of tagging.

Guardrails: serialize risky shared areas (schema, auth/CSRF, routing, real-time, ledger,
the clock/scheduler, CI, architecture); no secrets committed; keep the simulation
disclaimer visible and never imply real money or bank-grade software; money only moves via
explicit ledger entries (never a stored/edited balance); transfers + lending opens/
payments/withdrawals net to zero; admin adjustments + reversals require a reason + audit;
honor the v1.0.0 time rule (money/business events use the simulated clock,
security/operational events use the real clock — ADR-0003); if blocked, file a blocker and
stop honestly instead of tagging. Do not regress v0.2.0 auth, v0.3.0 site, v0.4.0
dashboard, v0.5.0 ops console, v0.6.0–v0.6.2 onboarding+fixes, v0.7.0 money movement,
v0.8.0 cards/fraud/disputes, v0.9.0 clock/scheduler/statements, or v1.0.0 loans/CDs/
interest + CSRF + the simulated-date fix.

Sandbox note (Claude Code Cloud only): if Prisma's engine download or the Playwright
Chromium build don't come through the egress proxy, mirror the Prisma engine binaries
via curl and set `PRISMA_QUERY_ENGINE_LIBRARY` + `PRISMA_SCHEMA_ENGINE_BINARY`
(+ `PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING`) for `debian-openssl-3.0.x` (engine
`605197351a3c8bdd595af2d2a9bc3025bca48ea2`), and point Playwright at the pre-installed
Chromium via `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium` — exactly as in
`docs/process/EXPERIMENT_LOG.md`. If new scope needs a Prisma migration, run it through
the mirrored schema engine. None of this affects normal machines or CI.

Branch note: develop on the branch this session provides, commit with clear messages,
push to that branch. Do not open a pull request unless I explicitly ask.

## My human review feedback for v1.0.0

<paste your verbatim feedback here>

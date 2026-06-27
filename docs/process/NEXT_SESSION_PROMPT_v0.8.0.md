# Copy/paste starter prompt for the NEXT session (review v0.8.0 → start v0.9.0)

> Paste this into a fresh Claude Code session. Replace the feedback block at the
> bottom with your actual review of v0.8.0. If your only feedback is "continue",
> the session will still save it verbatim and proceed to v0.9.0.

---

You are continuing the Meridian simulated-banking experiment (a local-only
SIMULATION — never real money or real banking integrations). The repo is the source
of truth, not chat history.

Current state: **v0.8.0 — Cards, fraud, disputes is COMPLETE and tagged locally**
(annotated tag created on the milestone commit; the human pushes it on merge to
`main` — tag push is blocked in this environment). v0.8.0 added, all on existing
foundations and keeping money discipline:

- **Cards:** a new `Card` lifecycle — issue a simulated debit/credit card
  (`POST /api/accounts/:id/cards`), freeze/unfreeze, report lost/stolen → a
  **replacement** card, and travel notices. Customer UI at **/wallet**. Card
  lifecycle writes **no ledger** (the only schema change is the additive `Card` +
  `CardTravelNotice` migration).
- **Fraud:** a `fraud_alert` ops item the customer confirms/denies
  (`GET /api/fraud-alerts`, `POST /api/fraud-alerts/:id/respond`) and an operator
  resolves via the existing ops action — **approve = confirm fraud** (reverse the
  charge + freeze the card), **reject = dismiss**.
- **Disputes:** a customer disputes a posted txn (`POST /api/disputes`) → entry flips
  to `disputed`; operator **approve = uphold** (reverse → refund), **reject = deny**
  (back to posted).
- **R-03 (the human's v0.7.0 request):** a reversed movement / upheld dispute /
  confirmed fraud now shows a **"Reversed"** tag alongside **Approved** on the queue
  cards, ops dashboard, and detail panel (derived from `payload.reversed`; the request
  stays terminal-approved — no state-machine change).
- Gate: **282** unit/integration + **41** e2e green; runtime audit clean; security
  review **PASS-with-findings** (all Low/tracked; one acted on — a transfer leg can't
  be disputed). All prior milestones intact.

Do these steps in order:

1. Read `CLAUDE.md`, then `docs/PROJECT_STATE.md`, then `docs/NEXT_SESSION.md`.
2. Save the feedback below VERBATIM to
   `docs/process/feedback/FEEDBACK_v0.8.0_<YYYY-MM-DD_HHMM>.md` before acting on it,
   following `docs/process/HUMAN_FEEDBACK_LOG.md`. Never edit the raw block afterward.
   If the feedback is only "continue", still save it and treat it as approval to start
   v0.9.0.
3. Interpret the feedback (accepted / deferred / rejected with reasons / questions);
   update `docs/process/HUMAN_FEEDBACK_LOG.md`.
4. Update `docs/process/TASK_BOARD.md` (the source of truth) + roadmap/process logs if
   the feedback changes scope.
5. Then implement ONLY the next approved milestone (**v0.9.0** unless re-scoped):
   **Simulation clock + recurring/scheduled payments** (and statement cycles per the
   roadmap). Recurring/scheduled payments were deferred here from v0.7.0 specifically
   because they need the clock. Likely shape: a **`SimulationClock`-driven scheduler**
   (the singleton row already exists) that fires due scheduled transfers/bill-pays as
   real **ledger** entries (reuse the v0.7.0 money-movement service); a customer UI to
   create/cancel a schedule; an operator view. Keep money discipline (every fire is a
   ledger entry; nothing edits a balance). The scheduler + clock are the **risky shared
   area** — serialize and review; lock the API + any socket events before the frontends.
6. Stop at the next milestone gate and produce the handoff docs + an annotated tag
   `v0.9.0`. Do NOT start v1.0.0.

Guardrails: serialize risky shared areas (schema, auth, routing, real-time, ledger,
the clock/scheduler, CI, architecture); no secrets committed; keep the simulation
disclaimer visible; money only moves via explicit ledger entries (never a
stored/edited balance); transfers net to zero; admin adjustments + reversals require a
reason + audit; if genuinely blocked, file a blocker under `docs/process/blockers/`
and stop honestly instead of tagging. Do not regress v0.2.0 auth, v0.3.0 site, v0.4.0
dashboard, v0.5.0 ops console, v0.6.0–v0.6.2 onboarding+fixes, v0.7.0 money movement,
or v0.8.0 cards/fraud/disputes.

Sandbox note (Claude Code Cloud only): if Prisma's engine download or the Playwright
Chromium build don't come through the egress proxy, mirror the Prisma engine binaries
via curl and set `PRISMA_QUERY_ENGINE_LIBRARY` + `PRISMA_SCHEMA_ENGINE_BINARY`
(+ `PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING`) for `debian-openssl-3.0.x` (engine
`605197351a3c8bdd595af2d2a9bc3025bca48ea2`), and point Playwright at the pre-installed
Chromium via `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium` — exactly as in
`docs/process/EXPERIMENT_LOG.md`. v0.9.0 will likely need a Prisma migration (a
schedule model) through the mirrored schema engine. None of this affects normal
machines or CI.

Branch note: develop on the branch this session provides, commit with clear messages,
push to that branch. Do not open a pull request unless I explicitly ask.

## My human review feedback for v0.8.0

<paste your verbatim feedback here>

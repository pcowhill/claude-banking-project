# NEXT_SESSION

> Read this third (after `CLAUDE.md` and `docs/PROJECT_STATE.md`). It tells the
> next session exactly what to do.

## Where we are

`v0.8.0 — Cards, fraud, disputes` is **complete** and tagged locally (annotated tag on
the milestone commit; the human pushes it on merge to `main` — tag push is blocked in
this environment). Built on the v0.5.0 ops queue + v0.7.0 ledger/reversal discipline,
all keeping money discipline:

- **Cards:** a new `Card` lifecycle — issue a simulated debit/credit card, freeze/
  unfreeze, report lost/stolen → a **replacement** card, travel notices. Customer UI at
  **/wallet**. Card lifecycle writes **no ledger** (only an additive `Card` +
  `CardTravelNotice` migration).
- **Fraud:** a `fraud_alert` ops item the customer confirms/denies and an operator
  resolves — approve = confirm fraud → reverse the charge + freeze the card; reject =
  dismiss.
- **Disputes:** a customer disputes a posted txn → `posted`→`disputed`; operator
  approve = uphold → `disputed`→`reversed` (refund), reject = deny → back to `posted`.
  A transfer leg is not disputable (must net to zero).
- **R-03 (the human's v0.7.0 request):** a reversed movement / upheld dispute /
  confirmed fraud shows a **"Reversed"** tag beside **Approved** on the ops queue,
  dashboard, and detail panel (`payload.reversed`; request stays terminal-approved).
- Gate: **282** unit/integration + **41** e2e green; security review
  **PASS-with-findings** (all Low/tracked; transfer legs made non-disputable).

The next planned milestone is **`v0.9.0`** — the **simulation clock + recurring/
scheduled payments** (carried from v0.7.0; they need the clock) and statement cycles.

## Session-start protocol (must do, in order)

1. Read `CLAUDE.md`, then `docs/PROJECT_STATE.md`, then this file.
2. **Save the human's pasted feedback VERBATIM** to
   `docs/process/feedback/FEEDBACK_v0.8.0_<YYYY-MM-DD_HHMM>.md` BEFORE acting on it
   (structure in `docs/process/HUMAN_FEEDBACK_LOG.md`; raw block never edited).
   - If the feedback is only "continue", still save it verbatim and treat it as
     approval to proceed with v0.9.0.
3. Interpret the feedback in that file; update `docs/process/HUMAN_FEEDBACK_LOG.md`.
4. Update `docs/process/TASK_BOARD.md` (source of truth) + roadmap/process logs if the
   feedback changes scope.
5. Do **only** v0.9.0 (or the re-scoped milestone the feedback approves).
6. Stop at the next gate and produce the milestone handoff docs + an annotated tag.

## Planned scope for v0.9.0 — Simulation clock + recurring/scheduled payments

Acceptance targets (refine from feedback before building):

- **Simulation clock:** a controllable clock (the `SimulationClock` singleton row
  already exists). An operator/admin can advance it (fast-forward); "now" for
  scheduled processing is read from the clock, not the wall clock.
- **Recurring / scheduled payments:** a customer schedules a one-off-future or
  recurring transfer / bill-pay; when the clock passes a due date, a **scheduler**
  fires it as a real **ledger** entry (reuse the v0.7.0 money-movement service — a
  reviewable schedule fires a pending entry into the ops queue; an internal scheduled
  transfer posts both legs). Create/cancel a schedule (customer UI) + an operator view.
- **Statement cycles (per ROADMAP):** consider deriving statement periods from the
  clock now that time can advance.
- **Money discipline unchanged:** every fire is an explicit ledger entry; nothing edits
  a balance; transfers net to zero; value enters/leaves only via bank-originated events.

### Suggested first steps

1. Plan tasks with the Milestone Planner role; record them in `TASK_BOARD.md`.
2. Decide the schema delta early — a **schedule** model is likely the one risky
   migration (serialize it). The clock row already exists.
3. Reuse, don't reinvent: the **money-movement service** (v0.7.0), the **ops queue +
   action service + real-time** (v0.5.0), the **disciplined ledger**, and the access
   primitives. The clock/scheduler is the **risky shared area** — serialize + review;
   lock the API + any socket events before parallelizing the frontends.

## Guardrails
- Serialize risky shared areas (schema, auth, routing, real-time, **ledger**, the
  **clock/scheduler**, CI, architecture).
- No secrets committed; `.env` stays ignored.
- Maintain the simulation disclaimer in README + both apps.
- Money moves ONLY via explicit ledger entries (never a stored/edited balance);
  transfers net to zero; value enters/leaves only via bank-originated events; admin
  adjustments + reversals require a reason + audit. Balances stay DERIVED.
- Truthful state: if blocked, file a blocker under `docs/process/blockers/` and stop —
  do not tag the milestone.

## Open follow-ups to consider (tracked, non-blocking)
- **Recurring/scheduled payments** — the headline of v0.9.0 (needs the clock).
- **A dedicated `credit_card` account product** (v0.8.0 cards attach to checking/
  savings) — possible later milestone.
- **SEC-1 (CSRF token / SameSite=Strict)** — accepted for the local sim
  (Lax + CORS mitigate it); v1.0.0 hardening pass.
- **TOCTOU notes** (the v0.7.0 funds-check + the cosmetic v0.8.0 fraud-response write)
  — Low; fold into a later ledger/ops-hardening pass.
- Dev-tooling npm-audit advisories (vite/vitest/esbuild) — v1.0.0 hardening.

## Sandbox note (Claude Code Cloud only)
If Prisma's engine download or the Playwright Chromium build don't come through the
egress proxy: mirror the Prisma engine binaries via curl + set
`PRISMA_QUERY_ENGINE_LIBRARY` + `PRISMA_SCHEMA_ENGINE_BINARY`
(+ `PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING`) for `debian-openssl-3.0.x` (engine
`605197351a3c8bdd595af2d2a9bc3025bca48ea2`); point Playwright at the pre-installed
Chromium via `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium` — see
`docs/process/EXPERIMENT_LOG.md`. v0.9.0 will likely need a Prisma migration (a
schedule model) through the mirrored schema engine. None of this affects normal
machines or CI.

## The copy/paste starter prompt
A ready-to-use prompt for a brand-new Claude Code Cloud session lives at
`docs/process/NEXT_SESSION_PROMPT_v0.8.0.md` (it includes the feedback placeholder).

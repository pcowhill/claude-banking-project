# NEXT_SESSION

> Read this third (after `CLAUDE.md` and `docs/PROJECT_STATE.md`). It tells the
> next session exactly what to do.

## Where we are

`v0.9.0 — Simulation clock & scheduled payments` is **complete** and tagged locally
(annotated tag on the milestone commit; the human pushes it on merge to `main` — tag
push is blocked in this environment). Built on the v0.7.0 money-movement service, the
v0.5.0 ops queue, and the disciplined ledger, all keeping money discipline:

- **Simulation clock:** a controllable, operator-driven "now". `GET /api/clock`
  (display); ops/admin `POST /api/ops/clock/advance` (**forward-only**, audited) which
  then **fires** due schedules; `GET /api/ops/schedules`. Operations **Simulation clock**
  page at **/clock**. The `sim:heartbeat` event now carries `simulationTime` (backward-
  compatible; no new socket event).
- **Recurring / scheduled payments** (the `M-09` item carried from v0.7.0): a customer
  schedules a one-off-future or recurring (`once`/`weekly`/`monthly`) **internal transfer**
  or **bill pay** (`POST/GET /api/schedules`, `POST /api/schedules/:id/cancel`). When the
  clock passes the due date the **scheduler** fires it through the v0.7.0 money service
  (transfer posts both legs → nets to zero; bill pay → a pending entry + a reviewable ops
  item). Customer UI at **/scheduled-payments**.
- **Statement cycles:** `GET /api/accounts/:id/statements` derives monthly periods from
  the simulated date (read-only over the posted ledger). Customer **/statements** upgraded
  from a placeholder.
- One **additive** migration (`PaymentSchedule`). Design: `docs/process/decisions/ADR-0002`.
- Gate: **332** unit/integration + **44** e2e green; runtime audit 0; security review
  **PASS-with-findings** (no Critical/High/Medium; one Low acted on — the scheduler records
  a fire failure as a skip instead of rethrowing after claim; L-2/L-3 tracked).

The next planned milestone is **`v1.0.0`** — **Polish, hardening, security pass, final
retrospective** (per ROADMAP).

## Session-start protocol (must do, in order)

1. Read `CLAUDE.md`, then `docs/PROJECT_STATE.md`, then this file.
2. **Save the human's pasted feedback VERBATIM** to
   `docs/process/feedback/FEEDBACK_v0.9.0_<YYYY-MM-DD_HHMM>.md` BEFORE acting on it
   (structure in `docs/process/HUMAN_FEEDBACK_LOG.md`; raw block never edited).
   - If the feedback is only "continue", still save it verbatim and treat it as
     approval to proceed with v1.0.0.
3. Interpret the feedback in that file; update `docs/process/HUMAN_FEEDBACK_LOG.md`.
4. Update `docs/process/TASK_BOARD.md` (source of truth) + roadmap/process logs if the
   feedback changes scope.
5. Do **only** v1.0.0 (or the re-scoped milestone the feedback approves).
6. Stop at the next gate and produce the milestone handoff docs + an annotated tag.

## Planned scope for v1.0.0 — Polish, hardening, final retrospective

Acceptance targets (refine from feedback before building):

- **Security hardening:** address **SEC-1** (CSRF token / `SameSite=Strict`) and the
  tracked **ledger/scheduler TOCTOU + bookkeeping** items (v0.7.0 **F-2**, v0.9.0
  **L-2/L-3** in `QUALITY_REPORT.md`); review the **dev-tooling npm-audit advisories**
  (vite/vitest/esbuild).
- **UX cleanup + bug fixing:** a polish pass across the customer + operations apps;
  resolve any issues the human raises at the v0.9.0 review.
- **Test expansion:** consider the first **frontend component unit tests** (still
  deferred); broaden e2e where thin.
- **Final process retrospective + experiment report** (the experiment's capstone).
- **Decide the fate of the rest of the v0.9.0 theme** — **loans / CDs / interest
  accrual** were carried forward from the clock-and-scheduler slice (see
  `ROADMAP_HISTORY.md`). Either pull them into a **v0.9.x** before v1.0.0, or
  explicitly defer past v1.0.0 — ask the human.

### Suggested first steps

1. Plan tasks with the Milestone Planner role; record them in `TASK_BOARD.md`.
2. **No schema change is expected** for the hardening pass; if any lands (e.g. for a
   new feature the human pulls in), serialize the migration as usual.
3. Reuse, don't reinvent: the auth/session primitives (CSRF will touch the cookie/
   guards — a **risky shared area**, serialize + review), the ledger discipline, and
   the existing test harness.

## Guardrails
- Serialize risky shared areas (schema, **auth/CSRF**, routing, real-time, ledger, the
  clock/scheduler, CI, architecture).
- No secrets committed; `.env` stays ignored.
- Maintain the simulation disclaimer in README + both apps.
- Money moves ONLY via explicit ledger entries (never a stored/edited balance);
  transfers net to zero; scheduled fires are ledger entries dated at their simulated due
  date; admin adjustments + reversals require a reason + audit. Balances stay DERIVED.
- Truthful state: if blocked, file a blocker under `docs/process/blockers/` and stop —
  do not tag the milestone.

## Open follow-ups to consider (tracked, non-blocking)
- **Loans / CDs / interest accrual** — the rest of the v0.9.0 theme, carried forward.
- **SEC-1 (CSRF token / SameSite=Strict)** — v1.0.0 hardening (Lax + CORS mitigate now).
- **Ledger/scheduler hardening** — the v0.7.0 **F-2** funds-check TOCTOU + the v0.9.0
  **L-2** (run-count bookkeeping) / **L-3** (TOCTOU now reachable from the scheduler).
- **Auto-advance of the clock by a "speed" multiplier** — out of scope in v0.9.0; a
  possible later add (today the clock moves only on an explicit operator advance).
- Dev-tooling npm-audit advisories (vite/vitest/esbuild) — v1.0.0 hardening.

## Sandbox note (Claude Code Cloud only)
If Prisma's engine download or the Playwright Chromium build don't come through the
egress proxy: mirror the Prisma engine binaries via curl + set
`PRISMA_QUERY_ENGINE_LIBRARY` + `PRISMA_SCHEMA_ENGINE_BINARY`
(+ `PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING`) for `debian-openssl-3.0.x` (engine
`605197351a3c8bdd595af2d2a9bc3025bca48ea2`); point Playwright at the pre-installed
Chromium via `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium` — see
`docs/process/EXPERIMENT_LOG.md`. v1.0.0 likely needs **no** migration. None of this
affects normal machines or CI.

## The copy/paste starter prompt
A ready-to-use prompt for a brand-new Claude Code Cloud session lives at
`docs/process/NEXT_SESSION_PROMPT_v0.9.0.md` (it includes the feedback placeholder).

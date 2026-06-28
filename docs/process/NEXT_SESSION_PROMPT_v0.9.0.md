# Copy/paste starter prompt for the NEXT session (review v0.9.0 → start v1.0.0)

> Paste this into a fresh Claude Code session. Replace the feedback block at the
> bottom with your actual review of v0.9.0. If your only feedback is "continue",
> the session will still save it verbatim and proceed to v1.0.0.

---

You are continuing the Meridian simulated-banking experiment (a local-only
SIMULATION — never real money or real banking integrations). The repo is the source
of truth, not chat history.

Current state: **v0.9.0 — Simulation clock & scheduled payments is COMPLETE and
tagged locally** (annotated tag created on the milestone commit; the human pushes it
on merge to `main` — tag push is blocked in this environment). v0.9.0 added, all on
existing foundations and keeping money discipline:

- **Simulation clock:** a controllable, forward-only clock seeded to the seed instant.
  `GET /api/clock` reads the current simulated time; an ops/admin
  `POST /api/ops/clock/advance` moves it **forward only** (audited), and advancing the
  clock then **fires any now-due schedules**; `GET /api/ops/schedules` lists schedules
  for operators. There is **no wall-clock background timer** — the scheduler runs on
  clock advance; catch-up is bounded.
- **Recurring / scheduled payments:** a customer creates a schedule
  (`POST /api/schedules`), lists them (`GET /api/schedules`), and cancels one
  (`POST /api/schedules/:id/cancel`). Kinds = `internal_transfer` | `bill_pay`;
  frequencies = `once` | `weekly` | `monthly`. When a schedule fires it posts through
  the **v0.7.0 money service**: an internal transfer posts **both legs** (nets to zero);
  a bill pay writes a **pending** entry **+ a reviewable ops item**. Insufficient-funds
  occurrences are **skipped + audited** (never a failed balance).
- **Statement cycles:** `GET /api/accounts/:id/statements` derives monthly statement
  periods from the **simulated** date — read-only over the posted ledger (no new money,
  no migration for statements). This closes the v0.4.0 statements placeholder.
- **UI:** customer **/scheduled-payments** (create/list/cancel) and an upgraded
  **/statements**; operations gains a new **Simulation clock** page (`/clock`, promoted
  from the "coming soon" nav).
- **Schema:** one **additive** migration `scheduled_payments` (the `PaymentSchedule`
  model only — no existing table touched). The heartbeat `sim:heartbeat` now carries
  `simulationTime` (backward-compatible; no new socket event).
- Gate: **332** unit/integration (was 282) + **44** e2e (was 41; +3 scheduled-payments
  journeys) green; 0 lint warnings; runtime `npm audit` = 0; security review
  **PASS-with-findings** (no Critical/High/Medium — one Low acted on, two Low + SEC-1
  CSRF tracked to v1.0.0). New ADR: `docs/process/decisions/ADR-0002-simulation-clock-and-scheduler.md`.
  All prior milestones intact.

Do these steps in order:

1. Read `CLAUDE.md`, then `docs/PROJECT_STATE.md`, then `docs/NEXT_SESSION.md`.
2. Save the feedback below VERBATIM to
   `docs/process/feedback/FEEDBACK_v0.9.0_<YYYY-MM-DD_HHMM>.md` before acting on it,
   following `docs/process/HUMAN_FEEDBACK_LOG.md`. Never edit the raw block afterward.
   If the feedback is only "continue", still save it and treat it as approval to start
   v1.0.0.
3. Interpret the feedback (accepted / deferred / rejected with reasons / questions);
   update `docs/process/HUMAN_FEEDBACK_LOG.md`.
4. Update `docs/process/TASK_BOARD.md` (the source of truth) + roadmap/process logs if
   the feedback changes scope.
5. Then implement ONLY the next approved milestone (**v1.0.0** unless re-scoped):
   **v1.0.0 — Polish, hardening, security pass, test expansion, final retrospective.**
   This is the final milestone, so plan it as a hardening-and-finish pass rather than a
   big new feature. Carry these in explicitly:
   - **SEC-1 (CSRF):** accepted across v0.7.0–v0.9.0 (SameSite=Lax + CORS allowlist
     mitigate it for a local sim) and now **due** — add real CSRF protection for the
     state-changing POSTs (transfers, movements, schedules, clock advance, ops actions).
   - **Dev-tooling audit advisories** (vite/vitest/esbuild, tracked in
     `QUALITY_REPORT.md`): audit + remediate or document final disposition.
   - **Ledger-hardening follow-ups** carried from v0.7.0–v0.9.0: **L-2** (scheduler
     run-count/last-run bookkeeping is a separate write after the money posts — cosmetic
     drift on crash, never a balance error) and **L-3 / the v0.7.0 funds-check TOCTOU**
     (now also reachable from the scheduler — bounded, auditable, never a lost/created
     dollar). Decide: tighten within SQLite's constraints, or document the accepted
     residual risk for a simulation.
   - **Test expansion** (frontend component tests still deferred since v0.1.0) and a
     **final retrospective** of the whole experiment.
   Keep money discipline (every fire/movement is a ledger entry; nothing edits a
   balance). Auth, routing, real-time, the ledger, the clock/scheduler, and CI remain
   the **risky shared areas** — serialize and review; lock any API/socket contract
   before the frontends.
6. **Loans / CDs / interest accrual remain roadmapped** (the rest of the original
   "v0.9.0 — Loans, CDs, simulated time" theme). v0.9.0 delivered the **clock +
   scheduler + statements** slice and explicitly carried loans/CDs/interest forward.
   They are **out of scope for v1.0.0 (hardening/finish)** unless the human pulls them
   in — confirm with the human at review before building them.
7. Stop at the milestone gate and produce the handoff docs + an annotated tag `v1.0.0`.
   Do NOT keep going past the gate.

Guardrails: serialize risky shared areas (schema, auth, routing, real-time, ledger,
the clock/scheduler, CI, architecture); no secrets committed; keep the simulation
disclaimer visible; money only moves via explicit ledger entries (never a
stored/edited balance); transfers net to zero; admin adjustments + reversals require a
reason + audit; scheduled fires post through the money service and skip+audit on
insufficient funds; if genuinely blocked, file a blocker under
`docs/process/blockers/` and stop honestly instead of tagging. Do not regress v0.2.0
auth, v0.3.0 site, v0.4.0 dashboard, v0.5.0 ops console, v0.6.0–v0.6.2
onboarding+fixes, v0.7.0 money movement, v0.8.0 cards/fraud/disputes, or v0.9.0
clock/scheduler/statements.

Sandbox note (Claude Code Cloud only): if Prisma's engine download or the Playwright
Chromium build don't come through the egress proxy, mirror the Prisma engine binaries
via curl and set `PRISMA_QUERY_ENGINE_LIBRARY` + `PRISMA_SCHEMA_ENGINE_BINARY`
(+ `PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING`) for `debian-openssl-3.0.x` (engine
`605197351a3c8bdd595af2d2a9bc3025bca48ea2`), and point Playwright at the pre-installed
Chromium via `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium` — exactly as in
`docs/process/EXPERIMENT_LOG.md`. v1.0.0's hardening work may or may not need a Prisma
migration; if it does, run it through the mirrored schema engine. None of this affects
normal machines or CI.

Branch note: develop on the branch this session provides, commit with clear messages,
push to that branch. Do not open a pull request unless I explicitly ask.

## My human review feedback for v0.9.0

<paste your verbatim feedback here>

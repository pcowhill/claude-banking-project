# NEXT_SESSION

> Read this third (after `CLAUDE.md` and `docs/PROJECT_STATE.md`). It tells the
> next session exactly what to do.

## Where we are

`v0.3.0 — Public bank website and branding` is **complete** and tagged. The
v0.2.0 review bug (cross-app session bleed) was fixed as part of it. The next
planned milestone is **`v0.4.0 — Customer banking dashboard`**.

## Session-start protocol (must do, in order)

1. Read `CLAUDE.md`, then `docs/PROJECT_STATE.md`, then this file.
2. **Save the human's pasted feedback VERBATIM** to
   `docs/process/feedback/FEEDBACK_v0.3_<YYYY-MM-DD_HHMM>.md` BEFORE acting on it.
   Use the structure in `docs/process/HUMAN_FEEDBACK_LOG.md`. The raw block is
   never edited afterward.
   - If the feedback is only "continue" (or similar), still save it verbatim and
     treat it as approval to proceed with v0.4.0.
3. Interpret the feedback in that file (accepted / deferred / rejected with
   reasons / questions carried forward); update `docs/process/HUMAN_FEEDBACK_LOG.md`.
4. Update `docs/process/TASK_BOARD.md` (source of truth), and the roadmap/process
   logs if the feedback changes scope.
5. Do **only** v0.4.0 (or the re-scoped milestone the feedback approves).
6. Stop at the next gate and produce the milestone handoff docs.

## Planned scope for v0.4.0 — Customer banking dashboard

Acceptance targets (refine from feedback before building):

- **Accounts overview** and **checking/savings detail** views built on the live,
  ledger-derived balances (no stored balances — keep the ledger discipline).
- **Transaction history** with **pending vs posted** states, plus basic
  **search/filter**; a **statements/documents** placeholder.
- **Realistic seeded transaction data** (extend the seed plan + invariants) so the
  dashboard has meaningful history to show — all bank-originated or transfer legs
  per the money rules.
- Keep `npm run verify` green; keep the simulation disclaimer visible; do not
  regress the v0.2.0 protected `/dashboard`/auth or the v0.3.0 public site.

### Suggested first steps

1. Plan tasks with the Milestone Planner role; record them in `TASK_BOARD.md`.
2. This spans `packages/shared` (transaction DTOs), `apps/backend` (seed +
   read endpoints; **schema is a risky shared area — serialize any change**), and
   `apps/customer` (dashboard views). Lock the API contract before parallelizing
   backend vs. frontend.
3. The disciplined ledger is the source of truth — derive everything; never store
   an editable balance.

## Guardrails
- Serialize risky shared areas (schema, auth, routing, CI, architecture).
- No secrets committed; `.env` stays ignored.
- Maintain the simulation disclaimer in README and both apps.
- Truthful state: if blocked, file a blocker and stop — do not tag the milestone.

## Sandbox note (Claude Code Cloud only)
Prisma's engine download and the Playwright Chromium build may not match through
the egress proxy. Mirror the Prisma engine binaries via curl + `PRISMA_*` env vars
(query-engine library + schema-engine for `debian-openssl-3.0.x`), and point
Playwright at the pre-installed Chromium via `PLAYWRIGHT_CHROMIUM_PATH` — see
`docs/process/EXPERIMENT_LOG.md` (Sessions 1–3). None of this affects normal
machines or CI.

## The copy/paste starter prompt
A ready-to-use prompt for a brand-new Claude Code Cloud session lives at
`docs/process/NEXT_SESSION_PROMPT_v0.3.md` (it includes the feedback placeholder).

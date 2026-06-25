# NEXT_SESSION

> Read this third (after `CLAUDE.md` and `docs/PROJECT_STATE.md`). It tells the
> next session exactly what to do.

## Where we are

`v0.4.0 — Customer banking dashboard` is **complete** and tagged. It delivered the
accounts overview, account detail with transaction history (pending vs posted) +
search/filter, a statements placeholder, and realistic seeded transaction data —
all with balances DERIVED from the append-only ledger and **no Prisma schema
migration**. It also folded in two v0.3.0 review fixes (R-01 scroll-to-top + a
Security deep-link; R-02 session-aware "Visit your Dashboard" / "already signed
in" entry points). The next planned milestone is **`v0.5.0 — Operations simulator
core`**.

## Session-start protocol (must do, in order)

1. Read `CLAUDE.md`, then `docs/PROJECT_STATE.md`, then this file.
2. **Save the human's pasted feedback VERBATIM** to
   `docs/process/feedback/FEEDBACK_v0.4_<YYYY-MM-DD_HHMM>.md` BEFORE acting on it.
   Use the structure in `docs/process/HUMAN_FEEDBACK_LOG.md`. The raw block is
   never edited afterward.
   - If the feedback is only "continue" (or similar), still save it verbatim and
     treat it as approval to proceed with v0.5.0.
3. Interpret the feedback in that file (accepted / deferred / rejected with
   reasons / questions carried forward); update `docs/process/HUMAN_FEEDBACK_LOG.md`.
4. Update `docs/process/TASK_BOARD.md` (source of truth), and the roadmap/process
   logs if the feedback changes scope.
5. Do **only** v0.5.0 (or the re-scoped milestone the feedback approves).
6. Stop at the next gate and produce the milestone handoff docs.

## Planned scope for v0.5.0 — Operations simulator core

Acceptance targets (refine from feedback before building):

- **Pending request queues** in the operations console, driven by real data
  (flesh out the `OperationsRequest` model + a seed) rather than the current
  placeholders.
- **Operator actions**: approve / reject / hold / request-more-info, each writing
  an **audit log** row (reuse the existing `AuditLog`) and respecting RBAC
  (ops_agent/admin only).
- **Real-time updates over WebSockets** (Socket.IO is already wired in
  `realtime.ts`) so queue changes push to connected operator consoles.
- **Simulated external events** — SMS/email/MFA/identity-verification — surfaced as
  console panels and/or queue items, clearly labelled as simulated (no real
  providers, ever).
- Keep `npm run verify` green; keep the simulation disclaimer visible; do not
  regress v0.2.0 auth, the v0.3.0 public site, or the v0.4.0 customer dashboard.

### Suggested first steps

1. Plan tasks with the Milestone Planner role; record them in `TASK_BOARD.md`.
2. This spans `packages/shared` (ops DTOs + socket-event contracts),
   `apps/backend` (schema/seed for `OperationsRequest`, action routes, Socket.IO
   emits — **schema + routing + real-time are risky shared areas, so serialize
   any change**), and `apps/operations` (live queues + action buttons). Lock the
   API + socket-event contract before parallelizing backend vs. frontend.
3. The audit trail and RBAC already exist — reuse `AuditLog` and the
   `requireRole` guard rather than inventing new mechanisms.

## Guardrails
- Serialize risky shared areas (schema, auth, routing, real-time, CI, architecture).
- No secrets committed; `.env` stays ignored.
- Maintain the simulation disclaimer in README and both apps.
- Truthful state: if blocked, file a blocker and stop — do not tag the milestone.

## Sandbox note (Claude Code Cloud only)
Prisma's engine download and the Playwright Chromium build may not match through
the egress proxy. Mirror the Prisma engine binaries via curl + `PRISMA_*` env vars
(query-engine library + schema-engine for `debian-openssl-3.0.x`), and point
Playwright at the pre-installed Chromium via `PLAYWRIGHT_CHROMIUM_PATH` — see
`docs/process/EXPERIMENT_LOG.md` (Sessions 1–4). None of this affects normal
machines or CI.

## The copy/paste starter prompt
A ready-to-use prompt for a brand-new Claude Code Cloud session lives at
`docs/process/NEXT_SESSION_PROMPT_v0.4.md` (it includes the feedback placeholder).

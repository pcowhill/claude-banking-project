# NEXT_SESSION

> Read this third (after `CLAUDE.md` and `docs/PROJECT_STATE.md`). It tells the
> next session exactly what to do.

## Where we are

`v0.5.0 — Operations simulator core` is **complete** and tagged. It delivered live
operations request queues, operator actions (approve/reject/hold/request-info) each
written to an audit log, real-time updates over Socket.IO scoped to an
operators-only room, and clearly-labelled simulated external events
(SMS/email/MFA/identity). It added the first Prisma migration since v0.2.0 (a
fleshed-out `OperationsRequest` + a new `SimulatedEvent` model), kept balances
DERIVED, and — importantly — operator actions change **workflow state only** and
never move money (money movement is v0.7.0). The next planned milestone is
**`v0.6.0 — Onboarding and account opening`**.

## Session-start protocol (must do, in order)

1. Read `CLAUDE.md`, then `docs/PROJECT_STATE.md`, then this file.
2. **Save the human's pasted feedback VERBATIM** to
   `docs/process/feedback/FEEDBACK_v0.5_<YYYY-MM-DD_HHMM>.md` BEFORE acting on it.
   Use the structure in `docs/process/HUMAN_FEEDBACK_LOG.md`. The raw block is
   never edited afterward.
   - If the feedback is only "continue" (or similar), still save it verbatim and
     treat it as approval to proceed with v0.6.0.
3. Interpret the feedback in that file (accepted / deferred / rejected with
   reasons / questions carried forward); update `docs/process/HUMAN_FEEDBACK_LOG.md`.
4. Update `docs/process/TASK_BOARD.md` (source of truth), and the roadmap/process
   logs if the feedback changes scope.
5. Do **only** v0.6.0 (or the re-scoped milestone the feedback approves).
6. Stop at the next gate and produce the milestone handoff docs.

## Planned scope for v0.6.0 — Onboarding and account opening

Acceptance targets (refine from feedback before building):

- **Open-account flow** on the customer side (the `/open-account` placeholder
  becomes a real, clearly-simulated application — applicant details, product
  choice, consent).
- **Identity verification** + **MFA** as part of onboarding, surfaced as operations
  work items.
- **Initial funding request** — when an account is approved/opened, initial funds
  must enter via an explicit **bank-originated ledger event** (seed/deposit), never
  a stored/edited balance. Keep the money invariants (value enters only via
  bank-originated events; transfers net to zero).
- **Joint-account invitation** (invite a second customer to an account → an
  `AccountAccess` grant on acceptance).
- **Operations approval/rejection feeding the v0.5.0 queue** — reuse
  `OperationsRequest` + the action service + the real-time channel built in v0.5.0
  rather than inventing new ones. Approving an onboarding request should be what
  creates the user/account/initial-funding (this is where operator actions begin to
  have real effects, carefully and within money discipline).
- **Admin-created demo users** (admin can provision a user/account).
- Keep `npm run verify` green; keep the simulation disclaimer visible; do not
  regress v0.2.0 auth, the v0.3.0 public site, the v0.4.0 customer dashboard, or the
  v0.5.0 operations console.

### Suggested first steps

1. Plan tasks with the Milestone Planner role; record them in `TASK_BOARD.md`.
2. This spans `packages/shared` (onboarding DTOs + any new ops request payload
   shapes), `apps/backend` (schema/seed for applications + the approval→create
   path, routes, ledger funding — **schema + routing + real-time + the LEDGER are
   risky shared areas, so serialize any change**), `apps/customer` (the
   open-account flow), and `apps/operations` (the onboarding queue actions, which
   largely already exist). Lock the API + any socket-event additions before
   parallelizing.
3. Reuse, don't reinvent: the **operations queue + action service + audit + the
   real-time channel** (v0.5.0), the **access primitives** + `requireRole`
   (v0.2.0), and the **disciplined ledger** (initial funding is a bank-originated
   `LedgerEntry`, audited).

## Guardrails
- Serialize risky shared areas (schema, auth, routing, real-time, **ledger**, CI,
  architecture).
- No secrets committed; `.env` stays ignored.
- Maintain the simulation disclaimer in README and both apps.
- Money may only enter via an explicit bank-originated ledger event; admin
  adjustments require a reason + audit. Balances stay DERIVED.
- Truthful state: if blocked, file a blocker and stop — do not tag the milestone.

## Sandbox note (Claude Code Cloud only)
Prisma's engine download and the Playwright Chromium build may not match through
the egress proxy. Mirror the Prisma engine binaries via curl + `PRISMA_*` env vars
(query-engine library + schema-engine for `debian-openssl-3.0.x`), and point
Playwright at the pre-installed Chromium via `PLAYWRIGHT_CHROMIUM_PATH` — see
`docs/process/EXPERIMENT_LOG.md` (Sessions 1–5). This session also created a real
Prisma **migration** through the mirrored schema engine; that works too. None of
this affects normal machines or CI.

## The copy/paste starter prompt
A ready-to-use prompt for a brand-new Claude Code Cloud session lives at
`docs/process/NEXT_SESSION_PROMPT_v0.5.md` (it includes the feedback placeholder).

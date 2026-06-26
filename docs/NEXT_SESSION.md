# NEXT_SESSION

> Read this third (after `CLAUDE.md` and `docs/PROJECT_STATE.md`). It tells the
> next session exactly what to do.

## Where we are

`v0.6.0 — Onboarding and account opening` is **complete** and tagged. It delivered a
real, clearly-simulated open-account flow that **feeds the v0.5.0 operations queue**;
an operator **approval** that provisions a `User` + `Account` + **initial funding**
(funding enters only via a bank-originated, posted `deposit` ledger entry, audited;
balances stay DERIVED); **joint-account invitations** (accept → a `joint`
`AccountAccess` grant); **admin-created demo users** (funding is an audited
`adjustment` requiring a reason); and the two v0.5.0 review fixes — the operations
**detail-panel buttons now deactivate from live state (B-01)** and operators can
**add a note at any time, including after a decision, via a non-decision `note`
action (B-02)**. It added the second additive Prisma migration (`onboarding`:
`OnboardingApplication` + `AccountInvitation`). The next planned milestone is
**`v0.7.0 — Money movement`**.

## Session-start protocol (must do, in order)

1. Read `CLAUDE.md`, then `docs/PROJECT_STATE.md`, then this file.
2. **Save the human's pasted feedback VERBATIM** to
   `docs/process/feedback/FEEDBACK_v0.6_<YYYY-MM-DD_HHMM>.md` BEFORE acting on it.
   Use the structure in `docs/process/HUMAN_FEEDBACK_LOG.md`. The raw block is
   never edited afterward.
   - If the feedback is only "continue" (or similar), still save it verbatim and
     treat it as approval to proceed with v0.7.0.
3. Interpret the feedback in that file (accepted / deferred / rejected with
   reasons / questions carried forward); update `docs/process/HUMAN_FEEDBACK_LOG.md`.
4. Update `docs/process/TASK_BOARD.md` (source of truth), and the roadmap/process
   logs if the feedback changes scope.
5. Do **only** v0.7.0 (or the re-scoped milestone the feedback approves).
6. Stop at the next gate and produce the milestone handoff docs.

## Planned scope for v0.7.0 — Money movement

Acceptance targets (refine from feedback before building):

- **Internal transfers** between a customer's own accounts — each posts **both
  legs** (debit one, credit the other) so transfers **net to zero**; balances stay
  DERIVED.
- **External ACH transfers / wires / bill pay / mobile check deposit** — value
  enters/leaves only via explicit **bank-originated** ledger events; outbound money
  leaves via a posted debit; clearly simulated, no real rails.
- **Approvals, failures, reversals, holds** — money-movement requests that need
  review feed the v0.5.0 **operations queue** (reuse `OperationsRequest` + the
  action service + the real-time channel + the v0.6.0 "approval has a ledger effect"
  path). An approval **posts** the movement; a reversal/failure is modeled with
  ledger statuses (`reversed`/`failed`), never by editing a balance.
- **CARRIED FORWARD FROM THE v0.5.0 REVIEW (Q-01):** approving a **deposit-review**
  request must **post** the pending deposit (status pending → posted) so the
  customer's transaction line stops reading *Pending* and the **available balance**
  updates — within ledger discipline (audited, bank-originated; no stored/edited
  balance). The seed already has a pending "Mobile check deposit" + a `deposit`
  ops request to wire this to.
- **Customer money-movement UI** (transfer/deposit/bill-pay forms) + the operator
  side; keep `npm run verify` green; keep the simulation disclaimer visible; do not
  regress v0.2.0 auth, the v0.3.0 public site, the v0.4.0 dashboard, the v0.5.0 ops
  console, or v0.6.0 onboarding.

### Suggested first steps

1. Plan tasks with the Milestone Planner role; record them in `TASK_BOARD.md`.
2. This spans `packages/shared` (money-movement DTOs + any new request payload
   shapes + pure transfer/posting helpers), `apps/backend` (schema/seed if a
   transfer/movement model is needed, the posting service + routes, the
   approval→post path, the deposit pending→posted transition — **schema + routing +
   real-time + the LEDGER are risky shared areas, so serialize any change**),
   `apps/customer` (the money-movement UI), and `apps/operations` (the
   money-movement queue actions, which largely already exist). Lock the API + any
   socket-event additions before parallelizing.
3. Reuse, don't reinvent: the **operations queue + action service + audit + the
   real-time channel** (v0.5.0), the **"approval has a ledger effect"** path and the
   atomic, audited, bank-originated funding pattern (v0.6.0), the **access
   primitives** + `requireRole` (v0.2.0), and the **disciplined ledger** + the
   `deriveBalances`/`settledTotalMinor` invariants (a transfer posts both legs and
   nets to zero; value enters/leaves only via bank-originated events).

## Guardrails
- Serialize risky shared areas (schema, auth, routing, real-time, **ledger**, CI,
  architecture).
- No secrets committed; `.env` stays ignored.
- Maintain the simulation disclaimer in README and both apps.
- Money moves ONLY via explicit ledger entries (never a stored/edited balance);
  transfers net to zero; value enters/leaves only via bank-originated events; admin
  adjustments require a reason + audit. Balances stay DERIVED.
- Truthful state: if blocked, file a blocker and stop — do not tag the milestone.

## Sandbox note (Claude Code Cloud only)
Prisma's engine download and the Playwright Chromium build may not match through
the egress proxy. Mirror the Prisma engine binaries via curl + `PRISMA_*` env vars
(query-engine library + schema-engine for `debian-openssl-3.0.x`), and point
Playwright at the pre-installed Chromium via `PLAYWRIGHT_CHROMIUM_PATH` — see
`docs/process/EXPERIMENT_LOG.md` (Sessions 1–6). This session also created a real
Prisma **migration** (`onboarding`) through the mirrored schema engine. None of
this affects normal machines or CI.

## The copy/paste starter prompt
A ready-to-use prompt for a brand-new Claude Code Cloud session lives at
`docs/process/NEXT_SESSION_PROMPT_v0.6.md` (it includes the feedback placeholder).

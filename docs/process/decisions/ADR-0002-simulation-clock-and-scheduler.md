# ADR-0002 — Simulation clock & clock-driven scheduler

- **Status:** Accepted
- **Date:** 2026-06-27
- **Milestone:** v0.9.0
- **Deciders:** Session 11 (emulated multi-agent)

## Context

v0.9.0 adds a controllable **simulation clock** and **recurring/scheduled
payments** (the `M-09` item deferred from v0.7.0 *because* it needs the clock),
plus **statement cycles**. The `SimulationClock` singleton row has existed since
v0.1.0 (`currentTime`, `speed`) but nothing drove it. The risk is concentrated in
shared areas the constitution names — schema, routing, real-time, the **ledger**,
and the new **clock/scheduler** — so the decisions below were locked before any
frontend work and the core was built serially.

## Decisions

1. **The clock is the authoritative "now" for money dating; it is forward-only.**
   A new `clock` service exposes `simulationNow(db)` (reads the singleton's
   `currentTime`) and `advanceClock(db, byMs, actor)`. Advancing is **forward-only**
   (a non-positive or over-bound delta is rejected) so the append-only ledger can
   never be back-dated into an inconsistent state, and every advance writes an
   `AuditLog` row. The seed initializes `currentTime` to the seed instant, so the
   simulated "today" starts aligned with the seeded history.

2. **The clock dates SCHEDULED money; immediate actions stay on wall-clock.** The
   money-movement service already accepted a `now` parameter (v0.7.0). The
   **scheduler** passes each occurrence's simulated **due date** as `now`, so a
   fired transfer/bill-pay is dated when it was *due*. **Schedule due-date math**
   (a schedule's `nextRunAt`) and the **statements period window** also read
   `simulationNow()`. Everything else — immediate `POST /api/transfers` /
   `POST /api/movements`, ops actions, reversals, card lifecycle, audit, events —
   keeps wall-clock `new Date()`. Rationale: the clock usually sits still, so
   threading a *static* sim time into immediate actions would collapse many
   same-session entries onto one identical `createdAt` (breaking newest-first
   ordering and any "find the entry I just created" logic). Wall-clock keeps
   immediate entries monotonic and is aligned with sim time at the demo's start
   (the clock is seeded to the seed instant); only the feature that genuinely needs
   simulated time — scheduled firing — uses it. The rule stays simple to state and
   test: "scheduled money is dated at its simulated due date; everything else is
   wall-clock."

3. **The scheduler fires on clock advance — no wall-clock background timer.**
   Because simulated time only moves when an operator advances the clock, the
   natural and deterministic trigger is the advance itself: `advanceClock` →
   `runDueSchedules(upTo = new currentTime)`. This keeps tests deterministic (no
   `setInterval`, no `Date.now()` — both are also unavailable/again-discouraged in
   this codebase's test discipline) and matches the mental model "fast-forward time
   and watch due payments fire." The `speed` column stays informational; automatic
   wall-clock progression is explicitly **out of scope** (a possible later add).

4. **Every fire reuses the v0.7.0 money service — no new ledger mechanics.** A due
   `internal_transfer` calls `createTransfer` (posts BOTH `transfer` legs at the due
   date → nets to zero). A due `bill_pay` calls `createExternalMovement` (writes a
   **pending** `payment` debit + a linked `OperationsRequest` an operator approves,
   exactly like a manual reviewable movement). The scheduler constructs a
   `SessionUser` for the **schedule owner** as the acting principal, so access is
   re-checked by the same primitives a live request uses — the firing actor can
   never exceed the owner's access. Money discipline is therefore inherited, not
   re-implemented.

5. **Catch-up is bounded and honest.** If the clock jumps far ahead, a recurring
   schedule may have many missed occurrences; `runDueSchedules` loops per schedule
   until `nextRunAt > upTo`, capped at a sane maximum per advance. If the cap is
   hit, the remaining `nextRunAt` is fast-forwarded past `upTo` with an audit note
   (so it never loops forever), and the cap is logged — no silent truncation. A fire
   that fails its funds/access check (e.g. insufficient available) does **not**
   throw out of the run: it records a clearly-labelled simulated "payment skipped"
   event + audit and advances/-completes the schedule, so one bad occurrence can't
   wedge the scheduler.

6. **One additive migration.** `PaymentSchedule` (owner + from/to account FKs,
   kind, amount, frequency, `nextRunAt`, status, run bookkeeping) is a new table
   plus back-relations on `User`/`Account`. **No existing table is altered**, so
   money/auth/ops/card tables are untouched — the riskiest shared area stays stable.

7. **Real-time change is minimal and backward-compatible.** The existing
   `sim:heartbeat` payload gains a `simulationTime` field (read best-effort from the
   clock in `attachRealtime`); there is **no new socket event**. A fired reviewable
   `bill_pay` reuses the existing `ops:request_changed` / `ops:external_event`
   channel (operators room only), so the locked socket contract barely moves and the
   ops-room RBAC is unchanged.

8. **Statement cycles are a read-only derivation from the clock.** Pure shared
   helpers (`buildStatementPeriods`, `summarizeStatementPeriod`) compute monthly
   periods ending at sim-now and summarize opening/closing/credits/debits from the
   account's **posted** ledger entries. A new access-scoped
   `GET /api/accounts/:id/statements` and the upgraded `/statements` page surface
   them. No statement is stored; no real PDF — balances stay derived.

## Consequences

- Advancing the clock has real, audited ledger effects; it is gated to
  `ops_agent`/`admin` and forward-only. Customers can read the sim date (for
  display) and manage **their own** schedules only.
- Out of scope for this slice (tracked): wall-clock auto-advance by `speed`; loans /
  CDs / interest accrual (the rest of the broad v0.9.0 theme); scheduled movements
  other than internal transfer + bill pay.
- The simulation-safety rules (no real money/providers, derived balances, reason +
  audit on money-affecting admin actions) are preserved and tested.

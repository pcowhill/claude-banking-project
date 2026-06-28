# Milestone Report — v0.9.0 (Simulation clock & scheduled payments)

> Local **SIMULATION** only. No real money, billers, payment networks, or
> wall-clock timer. Balances stay DERIVED from the append-only ledger.

## Summary

v0.9.0 delivers the **clock-dependent slice** of the v0.9.0 roadmap theme, all on
existing foundations (the v0.7.0 money-movement service, the v0.5.0 ops queue +
action service + real-time, the disciplined ledger, and the access primitives):

1. **Simulation clock** — a controllable, operator-driven "now". An `ops_agent`/
   `admin` advances it **forward only** (audited); "now" for scheduled processing
   and statement windows reads from the clock, not the wall clock.
2. **Recurring / scheduled payments** (the `M-09` item deferred from v0.7.0 because
   it needs the clock) — a customer schedules a one-off-future or recurring
   (`once`/`weekly`/`monthly`) **internal transfer** or **bill pay**; when the clock
   passes the due date a **scheduler** FIRES it through the v0.7.0 money service.
3. **Statement cycles** — monthly statement periods derived read-only from the
   posted ledger as-of the simulated date.

## Scope vs. plan

Delivered the planned v0.9.0 clock + scheduler + statements scope from
`docs/NEXT_SESSION.md` in full. The human's v0.8.0 feedback was a clean
"continue"-style approval (`feedback/FEEDBACK_v0.8.0_2026-06-27_0219.md`), so there
was **no re-scope**. The broader v0.9.0 theme's **loans / CDs / interest accrual**
were intentionally **not** in this clock-and-scheduler slice (recorded in
`ROADMAP_HISTORY.md`); they remain roadmapped.

## Key design decisions (see `docs/process/decisions/ADR-0002`)

- **The scheduler fires on clock advance** — there is no wall-clock background timer
  (simulated time only moves when an operator advances it), which keeps everything
  deterministic and testable.
- **The clock dates SCHEDULED money; immediate actions stay wall-clock.** The
  scheduler dates each fired entry at its simulated due date, and schedule due-dates
  + the statements window read the clock; immediate transfers/movements and ops
  actions keep `new Date()`. Threading a *static* sim clock into immediate actions
  would collapse many same-session entries onto one identical `createdAt` (breaking
  newest-first ordering / "find the entry I just created"); wall-clock keeps them
  monotonic and is aligned with sim time at the demo's start (the clock is seeded to
  the seed instant). Rule: "scheduled money is dated at its simulated due date;
  everything else is wall-clock."
- **Reuse, don't reinvent.** Firing reuses `createTransfer` / `createExternalMovement`
  (no new ledger mechanics); a fired bill-pay reuses the existing `ops:request_changed`
  channel and the v0.7.0 bill-pay request context — **no new socket event**. The only
  real-time change is a backward-compatible `simulationTime` field on `sim:heartbeat`.
- **Forward-only, bounded, honest.** The clock can't rewind (the append-only ledger
  must never be back-dated); each advance is bounded (≤ ~1 year) and audited; catch-up
  fires are bounded per advance; a fire that fails its funds/access check is **skipped**
  (no entry) with a clearly-labelled simulated event + audit — never silently dropped.

## What changed (by area)

### Shared (`@simbank/shared`)
- `clock.ts` — `SimulationClockDTO`, advance bounds + `validateAdvance`/`advanceBy`,
  `SimHeartbeatPayload`.
- `schedules.ts` — kinds/frequencies/statuses, DTOs, `validateCreateSchedule`, the
  calendar-month-safe `addInterval`, `ScheduleFireSummary`, labels/guards.
- `statements.ts` — pure `buildStatementPeriods` + `summarizeStatementPeriod`.

### Backend (the risky, serialized core — built + tested before the frontends)
- **Schema:** additive migration `scheduled_payments` → `PaymentSchedule` (owner +
  from/to account FKs, kind, amount, frequency, `nextRunAt`, status, run bookkeeping)
  + back-relations on `User`/`Account`. **No existing table altered.**
- `clock/clock.ts` — `simulationNow`, forward-only `advanceClock` (audited), typed
  `ClockError`.
- `scheduler/scheduler.ts` — `runDueSchedules(upTo)` (claim-then-fire per occurrence
  so an interruption can't double-charge; bounded catch-up; skip-on-error).
- `scheduler/schedules.ts` — `createSchedule` (access-checked) / `listSchedulesForUser`
  / `listAllSchedules` / `cancelSchedule` (owner-only); typed `ScheduleError`.
- `routes/schedules.ts` (customer), `routes/clock.ts` (clock read + ops advance + ops
  schedules list), `routes/accounts.ts` (statements endpoint), all registered.
- `auth/access.ts` — `getAccountStatements` (access-scoped, read-only derivation).
- `realtime.ts` — the heartbeat reads the clock (best-effort) and carries
  `simulationTime`.
- `seed-plan.ts`/`seed-apply.ts` — two demo schedules + `assertSeedScheduleIntegrity`;
  the clock is reset to seed time on every seed.

### Frontends (parallelized after the API/payload/socket contract was locked)
- **Customer:** `lib/schedules.ts` client; the **`/scheduled-payments`** page
  (create / list / cancel + the simulated date); a Dashboard quick link; the
  **`/statements`** page upgraded from placeholder to a real per-account monthly view.
- **Operations:** a **Simulation clock** page (`/clock`, promoted from the dimmed
  "coming soon" nav): the live simulated date, a fast-forward control showing what
  fired, and a table of every customer schedule; an additive `sim:heartbeat`
  listener feeding a `simulationTime` into the shared ops data context.

## Quality gate

- `npm run verify` ✅ — lint (0 warnings) + typecheck + tests + build all green.
- **332** unit/integration tests (was 282 at v0.8.0): new shared contract tests
  (clock / schedules / statements), **16** clock + scheduler + statements backend
  integration tests, and seed-plan schedule tests.
- **44** Playwright e2e (was 41; **+3**: a customer schedules + cancels a payment, the
  dashboard quick link, an operator advances the clock and watches a due schedule
  fire). One pre-existing dashboard e2e assertion was updated from the old statements
  placeholder to the new derived statements view.
- Runtime `npm audit --omit=dev` = **0** vulnerabilities (dev-tooling advisories still
  tracked in `QUALITY_REPORT.md`).
- A **runtime smoke** against a live backend confirmed: advancing the clock fires the
  seeded schedules as real ledger entries (the internal transfer posts $200 and nets
  to zero; the bill pay queues a $95 pending review), and the clock-reading heartbeat
  boots cleanly.
- Security review: see `HUMAN_REVIEW_v0.9.0.md` (verdict recorded there).

## Money discipline (enforced + tested)

- Every scheduled fire is a `LedgerEntry` appended via the money service; **no balance
  is stored or edited**. An integration test asserts a fired internal transfer leaves
  the system settled total **unchanged** (both legs net to zero) and moves the two
  accounts' derived balances by the amount.
- A fired bill pay writes a **pending** entry + a reviewable ops item; approving posts
  it (settled total then drops by the amount). Insufficient funds → the occurrence is
  **skipped** (no entry) + audited.
- The clock is **forward-only** (rejected non-forward advance, tested) and every
  advance is **audited**. Balances stay DERIVED.

## Git / tag

- Developed on the session branch `claude/happy-franklin-q41de0`.
- Version bumped to **0.9.0** across all workspaces + `version.ts`.
- An annotated tag **`v0.9.0`** is created on the milestone commit **locally**.
  **Pushing tags is blocked by this environment's git policy (HTTP 403)**, so the
  human (re)creates/pushes the tag on merge to `main`:
  ```
  git tag -a v0.9.0 -m "v0.9.0 — Simulation clock & scheduled payments"
  git push origin v0.9.0
  ```
- **No pull request opened** (per the constitution — only on explicit request).

## Sandbox notes (Claude Code Cloud only)

- Prisma engine download is blocked through the egress proxy; resolved the documented
  way — `npm install --ignore-scripts`, curl-mirror the query-engine library +
  schema-engine for `debian-openssl-3.0.x` (engine
  `605197351a3c8bdd595af2d2a9bc3025bca48ea2`), point Prisma at them via
  `PRISMA_QUERY_ENGINE_LIBRARY` + `PRISMA_SCHEMA_ENGINE_BINARY`
  (+ `PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING`). The new **`scheduled_payments`**
  migration was created through the mirrored schema engine.
- Playwright used the pre-installed Chromium via `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium`.
- **None of this affects normal machines or CI** — standard installs work.

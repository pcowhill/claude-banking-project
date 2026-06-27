# Feedback — v0.8.0 (Cards, fraud, disputes)

- Milestone reviewed: v0.8.0
- Date/time: 2026-06-27 02:19 (local)
- Source session label (if known): "v0.8.0 review"

## Raw feedback (verbatim — DO NOT EDIT)

> ```
> All looks good so far.  Keep up the good work!
> ```

## Claude's interpretation

A **clean, "continue"-style approval** of v0.8.0 — Cards, fraud, disputes. No bugs
reported, no change requests, and no re-scope. Per the session protocol (and the
`HUMAN_FEEDBACK_LOG` policy), a "continue"/"looks good" approval is saved verbatim
and interpreted as **approval to proceed with the next planned milestone** — here,
**v0.9.0 — Simulation clock + recurring/scheduled payments** (and statement cycles),
exactly as planned in `docs/NEXT_SESSION.md`, `ROADMAP.md`, and the v0.7.0 deferral
note (`M-09`: recurring/scheduled payments were deferred to v0.9.0 precisely because
they need the simulation clock).

## Resulting task changes

- **v0.9.0 — Simulation clock + recurring/scheduled payments** is **approved to
  start** as the single milestone for this session. Its task list (`SC-xx` clock,
  `SP-xx` schedules/scheduler, plus shared-contract, seed, frontend, test, and
  handoff tasks) is planned in `TASK_BOARD.md` this session per the v0.9.0 scope in
  `docs/NEXT_SESSION.md` and `ROADMAP.md`.
- The carried `M-09` (recurring/scheduled payments, deferred from v0.7.0) is **pulled
  into v0.9.0** and realized by the new `SP-xx` tasks.
- No new bug tasks, no UI follow-ups, no re-scope. The roadmap order is unchanged.

## Accepted feedback

- **"All looks good so far. Keep up the good work!"** Accepted as approval to
  proceed. Proceeding with **v0.9.0 — Simulation clock + recurring/scheduled
  payments** per the planned scope and guardrails (money discipline: every scheduled
  fire is an explicit `LedgerEntry` and never edits a balance; transfers net to zero;
  reviewable movements still flow through the ops queue; the clock + scheduler are the
  **risky shared area** — serialize and review; lock the API + any socket events
  before the frontends; one likely additive Prisma migration for a schedule model).

## Deferred feedback

- None new. Items already deferred by design remain deferred and are *not* changed by
  this feedback: **loans/CDs + interest accrual** (v0.9.0–v1.0.0 per ROADMAP; this
  session focuses on the clock + scheduled payments + statement cycles, the clock-
  dependent slice of the v0.9.0 theme); a **dedicated `credit_card` account product**
  (possible later milestone); **MFA/2FA at login, password reset, remember-device /
  new-device alerts** (later auth pass); **SEC-1 CSRF token / SameSite=Strict**
  (v1.0.0 hardening; Lax + CORS mitigate for the local sim); **TOCTOU notes** (v0.7.0
  funds-check + the cosmetic v0.8.0 fraud-response write — fold into a later
  ledger/ops-hardening pass); **dev-tooling npm-audit advisories** (vite/vitest/
  esbuild — v1.0.0 hardening); **frontend component unit tests** (covered for now by
  build + Playwright + backend/contract tests).

## Rejected or modified feedback

- None. There were no change requests to reject or modify.

## Questions carried forward

- For the human to confirm at the **v0.9.0** review:
  1. Can an operator/admin **advance the simulation clock** (fast-forward), and does
     "now" for scheduled processing read from the **clock**, not the wall clock?
  2. Can a customer **schedule** a one-off-future or **recurring** transfer / bill-pay,
     **see** it listed, and **cancel** it?
  3. When the clock passes a schedule's due date, does the **scheduler fire it as a
     real ledger entry** — an internal scheduled transfer **posts both legs** (nets to
     zero); a reviewable scheduled movement writes a **pending** entry into the ops
     queue — with **no edited balance** anywhere?
  4. Are **statement cycles** now derivable from the clock (the statements surface is
     no longer a bare placeholder)?

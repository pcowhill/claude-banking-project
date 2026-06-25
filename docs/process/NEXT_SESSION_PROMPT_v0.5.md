# NEXT SESSION PROMPT — paste this into a brand-new Claude Code session

Copy everything in the fenced block below into a fresh Claude Code Cloud session
to continue the experiment after reviewing **v0.5.0**. Replace
`PASTE_FEEDBACK_HERE` with your review feedback (or just write `continue`).

---

````text
You are continuing the Meridian simulated-banking experiment (a local-only
SIMULATION — never real money or real banking integrations). The repo is the
source of truth, not chat history.

Current state: milestone v0.5.0 (Operations simulator core) is COMPLETE and
tagged. It delivered live operations request queues, operator actions
(approve/reject/hold/request-info) each written to an audit log, real-time
updates over Socket.IO (scoped to an operators-only room), and clearly-labelled
simulated external events (SMS/email/MFA/identity). It added the first Prisma
migration since v0.2.0 (a fleshed-out OperationsRequest + a new SimulatedEvent
model), kept balances DERIVED, and — importantly — operator actions change
workflow state only and never move money (money movement is v0.7.0). The next
planned milestone is v0.6.0 — Onboarding and account opening.

Do these steps in order:

1. Read CLAUDE.md, then docs/PROJECT_STATE.md, then docs/NEXT_SESSION.md.
2. Save my feedback below VERBATIM to
   docs/process/feedback/FEEDBACK_v0.5_<YYYY-MM-DD_HHMM>.md before acting on it,
   following docs/process/HUMAN_FEEDBACK_LOG.md. Never edit the raw feedback
   block afterward. If my feedback is only "continue", still save it verbatim and
   treat it as approval to proceed with v0.6.0.
3. Interpret my feedback in that file (accepted / deferred / rejected with
   reasons / questions carried forward) and update
   docs/process/HUMAN_FEEDBACK_LOG.md.
4. Update docs/process/TASK_BOARD.md (the source of truth) and the roadmap/process
   logs if my feedback changes scope.
5. Then implement ONLY the next approved milestone (v0.6.0 unless my feedback
   re-scopes it): onboarding and account opening — an open-account flow, identity
   verification, an initial funding request, joint-account invitation, operations
   approval/rejection that FEEDS the v0.5.0 operations queue (reuse
   OperationsRequest + the action service + the real-time channel rather than
   inventing new ones), and admin-created demo users. This will likely need a
   Prisma schema/seed change and touches routing + real-time + RBAC + the customer
   onboarding UI + the ledger (initial funding must enter via a bank-originated
   event) — all RISKY SHARED AREAS, so serialize and review them. Keep balances
   DERIVED, keep `npm run verify` green, keep the simulation disclaimer visible,
   and do not regress v0.2.0 auth, the v0.3.0 public site, the v0.4.0 customer
   dashboard, or the v0.5.0 operations console.
6. Stop at the next milestone gate and produce the handoff docs (milestone
   report, human review, next-session prompt, updated PROJECT_STATE / NEXT_SESSION
   / TASK_BOARD / EXPERIMENT_LOG / CHANGELOG / QUALITY_REPORT) and an annotated
   tag v0.6.0. Do NOT start v0.7.0.

Guardrails: serialize risky shared areas (schema, auth, routing, real-time,
ledger, CI, architecture); no secrets committed; keep the simulation disclaimer
visible; when initial funding lands, money must only enter via an explicit
bank-originated ledger event (never a stored/edited balance) and admin
adjustments require a reason + audit; if something is genuinely blocked, file a
blocker under docs/process/blockers/ and stop honestly instead of tagging the
milestone.

Sandbox note (Claude Code Cloud only): Prisma's engine download and the
Playwright Chromium build may not match through the egress proxy. If so, mirror
the Prisma engine binaries via curl and set the PRISMA_* env vars (query-engine
library + schema-engine for debian-openssl-3.0.x), and point Playwright at the
pre-installed Chromium via PLAYWRIGHT_CHROMIUM_PATH — exactly as documented in
docs/process/EXPERIMENT_LOG.md (Sessions 1–5). None of this affects normal
machines or CI.

Develop on the branch this session provides, commit with clear messages, and push
to that branch. Do not open a pull request unless I explicitly ask.

## My human review feedback for v0.5.0

PASTE_FEEDBACK_HERE
````

---

After pasting, the session will save your feedback verbatim, interpret it, update
the task board/roadmap if needed, and proceed to v0.6.0 (or whatever your feedback
approves), stopping again at the next milestone gate.

# NEXT SESSION PROMPT — paste this into a brand-new Claude Code session

Copy everything in the fenced block below into a fresh Claude Code Cloud session
to continue the experiment after reviewing **v0.6.0**. Replace
`PASTE_FEEDBACK_HERE` with your review feedback (or just write `continue`).

---

````text
You are continuing the Meridian simulated-banking experiment (a local-only
SIMULATION — never real money or real banking integrations). The repo is the
source of truth, not chat history.

Current state: milestone v0.6.0 (Onboarding and account opening) is COMPLETE and
tagged. It delivered a real, clearly-simulated open-account flow that FEEDS the
v0.5.0 operations queue; an operator approval that PROVISIONS a user + account +
initial funding (initial funding enters only via a bank-originated, posted
`deposit` ledger entry, audited; balances stay DERIVED); joint-account
invitations (accept → a `joint` AccountAccess grant); admin-created demo users
(funding is an audited `adjustment` requiring a reason); and two v0.5.0 review
fixes — the operations detail-panel buttons now deactivate from live state
(B-01), and operators can add a note at any time, including after a decision, via
a non-decision `note` action (B-02). It added the second additive Prisma
migration (OnboardingApplication + AccountInvitation). The next planned milestone
is v0.7.0 — Money movement.

Do these steps in order:

1. Read CLAUDE.md, then docs/PROJECT_STATE.md, then docs/NEXT_SESSION.md.
2. Save my feedback below VERBATIM to
   docs/process/feedback/FEEDBACK_v0.6_<YYYY-MM-DD_HHMM>.md before acting on it,
   following docs/process/HUMAN_FEEDBACK_LOG.md. Never edit the raw feedback
   block afterward. If my feedback is only "continue", still save it verbatim and
   treat it as approval to proceed with v0.7.0.
3. Interpret my feedback in that file (accepted / deferred / rejected with
   reasons / questions carried forward) and update
   docs/process/HUMAN_FEEDBACK_LOG.md.
4. Update docs/process/TASK_BOARD.md (the source of truth) and the roadmap/process
   logs if my feedback changes scope.
5. Then implement ONLY the next approved milestone (v0.7.0 unless my feedback
   re-scopes it): money movement — internal transfers, external ACH transfers,
   wires, mobile check deposit, bill pay, recurring/scheduled payments, with
   approvals, failures, reversals, and holds. This is where operator approvals
   begin to MOVE money. Reuse the v0.5.0 operations queue + action service + the
   real-time channel and the v0.6.0 "approval has a ledger effect" path. CARRIED
   FORWARD FROM THE v0.5.0 REVIEW (Q-01): approving a deposit-review request must
   POST the pending deposit (pending → posted) so the customer's transaction line
   stops reading "Pending" and the available balance updates. ALL money must move
   only via explicit ledger entries (transfers post BOTH legs and net to zero;
   value enters/leaves only via bank-originated events; admin adjustments require
   a reason + audit). Balances stay DERIVED — never a stored/edited field. The
   ledger + schema + routing + real-time are RISKY SHARED AREAS, so serialize and
   review them. Keep `npm run verify` green, keep the simulation disclaimer
   visible, and do not regress v0.2.0 auth, the v0.3.0 public site, the v0.4.0
   customer dashboard, the v0.5.0 operations console, or v0.6.0 onboarding.
6. Stop at the next milestone gate and produce the handoff docs (milestone
   report, human review, next-session prompt, updated PROJECT_STATE / NEXT_SESSION
   / TASK_BOARD / EXPERIMENT_LOG / CHANGELOG / QUALITY_REPORT) and an annotated
   tag v0.7.0. Do NOT start v0.8.0.

Guardrails: serialize risky shared areas (schema, auth, routing, real-time,
ledger, CI, architecture); no secrets committed; keep the simulation disclaimer
visible; money only moves via explicit ledger entries (never a stored/edited
balance); transfers net to zero; value enters/leaves only via bank-originated
events; admin adjustments require a reason + audit; if something is genuinely
blocked, file a blocker under docs/process/blockers/ and stop honestly instead of
tagging the milestone.

Sandbox note (Claude Code Cloud only): Prisma's engine download and the
Playwright Chromium build may not match through the egress proxy. If so, mirror
the Prisma engine binaries via curl and set the PRISMA_* env vars (query-engine
library + schema-engine for debian-openssl-3.0.x), and point Playwright at the
pre-installed Chromium via PLAYWRIGHT_CHROMIUM_PATH — exactly as documented in
docs/process/EXPERIMENT_LOG.md (Sessions 1–6). None of this affects normal
machines or CI.

Develop on the branch this session provides, commit with clear messages, and push
to that branch. Do not open a pull request unless I explicitly ask.

## My human review feedback for v0.6.0

PASTE_FEEDBACK_HERE
````

---

After pasting, the session will save your feedback verbatim, interpret it, update
the task board/roadmap if needed, and proceed to v0.7.0 (or whatever your feedback
approves), stopping again at the next milestone gate.

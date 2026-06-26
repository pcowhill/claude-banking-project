# NEXT SESSION PROMPT — paste this into a brand-new Claude Code session

Copy everything in the fenced block below into a fresh Claude Code Cloud session
to continue the experiment after reviewing **v0.6.2**. Replace
`PASTE_FEEDBACK_HERE` with your review feedback (or just write `continue`).

---

````text
You are continuing the Meridian simulated-banking experiment (a local-only
SIMULATION — never real money or real banking integrations). The repo is the
source of truth, not chat history.

Current state: patch release v0.6.2 (Operations sign-in fix) is COMPLETE and
tagged. It fixed the one blocking bug from the v0.6.1 review and started NO new
feature work:
  - B-06: operators could not sign in to the Meridian Operations console — after a
    successful login the dashboard flashed, then the console bounced back to the
    sign-in screen with the v0.6.1 "your session has ended" notice, looping forever
    and surviving a cookie clear (both Sam the operator and Riley the admin
    affected). Root cause: the backend picked the per-surface session cookie
    (mer_session customer / mer_ops_session operations) from the request Origin
    header and defaulted to the CUSTOMER surface when Origin was absent — but
    browsers OMIT Origin on same-origin GET requests, so in a same-origin
    deployment the operator's authenticated /api/ops/* GETs were read as customer,
    found no session, and 401'd; the v0.6.1 recovery handler then escalated that
    401 into an unrecoverable login loop. Fix: each front-end app now declares its
    surface with an explicit header (x-meridian-surface) that the backend trusts
    AHEAD of Origin (Origin stays a fallback, so the Socket.IO handshake,
    cross-origin dev, and existing tests are unchanged). The operations console
    sends `operations` on every authenticated REST call + the socket handshake; the
    customer app was deliberately left unchanged (it already resolves to the
    customer cookie via the least-privileged default and avoids new CORS
    preflights). The surface header only selects WHICH cookie is read — it cannot
    grant access (RBAC role checks unchanged), so session isolation (the v0.3.0
    fix) is preserved and still green.
This patch is built ON TOP OF v0.6.1 (whose B-03 narrow-width ☰ menu and B-04
expired-session recovery still work). The last FEATURE milestone remains
v0.6.0 — Onboarding and account opening: a real open-account flow feeding the
v0.5.0 ops queue; an operator approval that PROVISIONS a user + account + initial
funding (bank-originated, posted `deposit`, audited; balances DERIVED);
joint-account invitations; admin-created demo users. The next planned milestone is
v0.7.0 — Money movement.

Do these steps in order:

1. Read CLAUDE.md, then docs/PROJECT_STATE.md, then docs/NEXT_SESSION.md.
2. Save my feedback below VERBATIM to
   docs/process/feedback/FEEDBACK_v0.6.2_<YYYY-MM-DD_HHMM>.md before acting on it,
   following docs/process/HUMAN_FEEDBACK_LOG.md. Never edit the raw feedback
   block afterward. If my feedback is only "continue", still save it verbatim and
   treat it as approval to proceed with v0.7.0.
3. Interpret my feedback in that file (accepted / deferred / rejected with
   reasons / questions carried forward) and update
   docs/process/HUMAN_FEEDBACK_LOG.md.
4. Update docs/process/TASK_BOARD.md (the source of truth) and the roadmap/process
   logs if my feedback changes scope.
5. Then implement ONLY the next approved milestone (v0.7.0 unless my feedback
   re-scopes it): money movement — internal transfers between a customer's own
   accounts (post BOTH legs so transfers net to zero), external ACH transfers,
   wires, mobile check deposit, bill pay, and recurring/scheduled payments, with
   approvals, failures, reversals, and holds. This is where operator approvals
   begin to MOVE money. Reuse the v0.5.0 operations queue + action service + the
   real-time channel and the v0.6.0 "approval has a ledger effect" path (the
   atomic, audited, bank-originated funding pattern). An approval POSTS the
   movement; a reversal/failure is modeled with ledger statuses (reversed/failed),
   never by editing a balance. CARRIED FORWARD FROM THE v0.5.0 REVIEW (Q-01):
   approving a deposit-review request must POST the pending deposit (status
   pending → posted) so the customer's transaction line stops reading "Pending"
   and the available balance updates — within ledger discipline (audited,
   bank-originated; no stored/edited balance). The seed already has a pending
   "Mobile check deposit" + a `deposit` ops request to wire this to. Build the
   customer money-movement UI (transfer / deposit / bill-pay forms) AND the
   operator side (the money-movement queue actions largely already exist). ALL
   money must move only via explicit ledger entries (transfers post BOTH legs and
   net to zero; value enters/leaves only via bank-originated events; admin
   adjustments require a reason + audit). Balances stay DERIVED — never a
   stored/edited field. The ledger + schema + routing + real-time are RISKY SHARED
   AREAS, so serialize and review them; lock the API + any socket-event additions
   before parallelizing the two frontends. Keep `npm run verify` green, keep the
   simulation disclaimer visible, and do not regress v0.2.0 auth, the v0.3.0 public
   site + the two apps' separate sign-ins, the v0.4.0 customer dashboard, the
   v0.5.0 operations console, or v0.6.0 onboarding (incl. the v0.6.1 ops-console
   fixes — narrow-width nav and session recovery — and the v0.6.2 surface-header
   session resolution).
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
docs/process/EXPERIMENT_LOG.md (Sessions 1–8). None of this affects normal
machines or CI.

Branch note: if your fresh session branch was cut from main, confirm it actually
contains the v0.6.1 + v0.6.2 work before building on it (in the v0.6.2 session the
branch was cut from v0.6.0 and the v0.6.1 commit was unmerged — it had to be
fast-forwarded in). Develop on the branch this session provides, commit with clear
messages, and push to that branch. Do not open a pull request unless I explicitly
ask.

## My human review feedback for v0.6.2

PASTE_FEEDBACK_HERE
````

---

After pasting, the session will save your feedback verbatim, interpret it, update
the task board/roadmap if needed, and proceed to v0.7.0 (or whatever your feedback
approves), stopping again at the next milestone gate.

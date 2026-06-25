# NEXT SESSION PROMPT — paste this into a brand-new Claude Code session

Copy everything in the fenced block below into a fresh Claude Code Cloud session
to continue the experiment after reviewing **v0.1.0**. Replace
`PASTE_FEEDBACK_HERE` with your review feedback (or just write `continue`).

---

````text
You are continuing the Meridian simulated-banking experiment (a local-only
SIMULATION — never real money or real banking integrations). The repo is the
source of truth, not chat history.

Current state: milestone v0.1.0 (Project Foundation) is COMPLETE and tagged.
The next planned milestone is v0.2.0 — Auth, roles, and demo users.

Do these steps in order:

1. Read CLAUDE.md, then docs/PROJECT_STATE.md, then docs/NEXT_SESSION.md.
2. Save my feedback below VERBATIM to
   docs/process/feedback/FEEDBACK_v0.1_<YYYY-MM-DD_HHMM>.md before acting on it,
   following docs/process/HUMAN_FEEDBACK_LOG.md. Never edit the raw feedback
   block afterward. If my feedback is only "continue", still save it verbatim and
   treat it as approval to proceed with v0.2.0.
3. Interpret my feedback in that file (accepted / deferred / rejected with
   reasons / questions carried forward) and update
   docs/process/HUMAN_FEEDBACK_LOG.md.
4. Update docs/process/TASK_BOARD.md (the source of truth) and the roadmap/process
   logs if my feedback changes scope.
5. Then implement ONLY the next approved milestone (v0.2.0 unless my feedback
   re-scopes it): customer + operations/admin login, real password hashing
   (no custom crypto), sessions + lockout, seeded demo users per role,
   role-based access control (customers see only their own accounts; joint users
   only authorized accounts), login history/audit logs, and initial Playwright
   login tests. Keep `npm run verify` green.
6. Stop at the next milestone gate and produce the handoff docs (milestone
   report, human review, next-session prompt, updated PROJECT_STATE / NEXT_SESSION
   / TASK_BOARD / EXPERIMENT_LOG / CHANGELOG) and an annotated tag v0.2.0.
   Do NOT start v0.3.0.

Guardrails: serialize risky shared areas (schema, auth, routing, CI,
architecture); no secrets committed; keep the simulation disclaimer visible; if
something is genuinely blocked, file a blocker under docs/process/blockers/ and
stop honestly instead of tagging the milestone.

Develop on the branch this session provides, commit with clear messages, and push
to that branch. Do not open a pull request unless I explicitly ask.

## My human review feedback for v0.1.0

PASTE_FEEDBACK_HERE
````

---

After pasting, the session will save your feedback verbatim, interpret it, update
the task board/roadmap if needed, and proceed to v0.2.0 (or whatever your
feedback approves), stopping again at the next milestone gate.

# NEXT SESSION PROMPT — paste this into a brand-new Claude Code session

Copy everything in the fenced block below into a fresh Claude Code Cloud session
to continue the experiment after reviewing **v0.2.0**. Replace
`PASTE_FEEDBACK_HERE` with your review feedback (or just write `continue`).

---

````text
You are continuing the Meridian simulated-banking experiment (a local-only
SIMULATION — never real money or real banking integrations). The repo is the
source of truth, not chat history.

Current state: milestone v0.2.0 (Auth, roles, and demo users) is COMPLETE and
tagged. The next planned milestone is v0.3.0 — Public bank website and branding.

Do these steps in order:

1. Read CLAUDE.md, then docs/PROJECT_STATE.md, then docs/NEXT_SESSION.md.
2. Save my feedback below VERBATIM to
   docs/process/feedback/FEEDBACK_v0.2_<YYYY-MM-DD_HHMM>.md before acting on it,
   following docs/process/HUMAN_FEEDBACK_LOG.md. Never edit the raw feedback
   block afterward. If my feedback is only "continue", still save it verbatim and
   treat it as approval to proceed with v0.3.0.
3. Interpret my feedback in that file (accepted / deferred / rejected with
   reasons / questions carried forward) and update
   docs/process/HUMAN_FEEDBACK_LOG.md.
4. Update docs/process/TASK_BOARD.md (the source of truth) and the roadmap/process
   logs if my feedback changes scope.
5. Then implement ONLY the next approved milestone (v0.3.0 unless my feedback
   re-scopes it): the public bank website and branding — a polished public home
   page, product marketing pages, realistic AI-generated image placeholders (or
   generation instructions), clear login / open-account entry points, and
   responsive layout polish. Build on the existing brand tokens, Meridian logo,
   and the drop-in ImagePlaceholder. Keep `npm run verify` green and the
   simulation disclaimer visible.
6. Stop at the next milestone gate and produce the handoff docs (milestone
   report, human review, next-session prompt, updated PROJECT_STATE / NEXT_SESSION
   / TASK_BOARD / EXPERIMENT_LOG / CHANGELOG / QUALITY_REPORT) and an annotated
   tag v0.3.0. Do NOT start v0.4.0.

Guardrails: serialize risky shared areas (schema, auth, routing, CI,
architecture); no secrets committed; keep the simulation disclaimer visible; if
something is genuinely blocked, file a blocker under docs/process/blockers/ and
stop honestly instead of tagging the milestone.

Sandbox note (Claude Code Cloud only): Prisma's engine download and the
Playwright Chromium build may not match through the egress proxy. If so, mirror
the Prisma engine binaries via curl and set the PRISMA_* env vars, and point
Playwright at the pre-installed Chromium via PLAYWRIGHT_CHROMIUM_PATH — exactly
as documented in docs/process/EXPERIMENT_LOG.md (Sessions 1–2). None of this
affects normal machines or CI.

Develop on the branch this session provides, commit with clear messages, and push
to that branch. Do not open a pull request unless I explicitly ask.

## My human review feedback for v0.2.0

PASTE_FEEDBACK_HERE
````

---

After pasting, the session will save your feedback verbatim, interpret it, update
the task board/roadmap if needed, and proceed to v0.3.0 (or whatever your feedback
approves), stopping again at the next milestone gate.

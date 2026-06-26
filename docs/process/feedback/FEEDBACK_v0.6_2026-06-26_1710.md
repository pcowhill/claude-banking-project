# Feedback — v0.6.0 (Onboarding and account opening)

- Milestone reviewed: v0.6.0
- Date/time: 2026-06-26 17:10 (UTC)
- Source session label: "v0.6.0 review"

## Raw feedback (verbatim — DO NOT EDIT)

> ```
> There appears to be a bug within the Meridian Ops.  If I make the width of the window too small, the menu on the left-side of the screen goes away, and there does not appear to be any buttons on the screen to click to switch between the Dashboard, Requests queues, etc.  If there is some way that I am just missing, can you add an explanation within the this version's human review document.  If this is a bug, can you fix it, and explain to me in this version's human review how you fixed it.
>
> There is also another bug.  It seems the Request queues is also not working.  I just see "Not authenticated" in the request queues.  When I try to open a new account within the Meridian customer site, it says that a bank operator will approve it, but I do not see a way to approve it within Meridian Ops.
>
> I would like to make sure these are fixed before moving onto the next minor version release.  Instead of pursuing 0.7, can you instead just pursue what is in my feedback and create version 0.6.1 for me to test.  After I review the version 0.6.1, if everything looks good to me, then the next session can pursue 0.7 next.
>
> Do not proceed with any of the v0.7 tasks.  Instead, only address my feedback and create tag v0.6.1.  As always, create the associated documentation within docs/process and name them with v0.6.1 in the filename.
> ```

## Claude's interpretation

The human reviewed v0.6.0 and reported **two bugs in the Meridian Operations
console** that must be fixed **before** any v0.7.0 work begins. The session is
**re-scoped**: do NOT start v0.7.0 (Money movement). Instead, ship a focused
**patch release v0.6.1** that addresses only this feedback, with v0.6.1-named
process documentation, so the human can test it. If v0.6.1 passes review, a
future session may proceed to v0.7.0.

The two reported bugs:

- **B-03 — Operations console has no navigation at small/narrow window widths.**
  When the browser window is made narrow, the left sidebar (Dashboard / Request
  queues / Simulated messaging nav) disappears and there is no alternative
  control (e.g. a hamburger/mobile menu) to switch sections. The operator gets
  stuck on whatever section is showing. The human asks: if there is in fact a way
  to navigate that they are missing, explain it in the v0.6.1 human-review doc; if
  it is a genuine bug, fix it and explain the fix in that same doc.

- **B-04 — Request queues show "Not authenticated"; approvals are unreachable.**
  The operator, after logging into Ops, sees "Not authenticated" in the Request
  queues view instead of the live queue. Consequently a customer's open-account
  application submitted on the customer site (which promises "a bank operator
  will approve it") cannot be approved anywhere in Ops, because the queue that
  would surface the onboarding request is broken. This breaks the core v0.5.0 +
  v0.6.0 operator workflow (live queue, approve/reject, onboarding → provisioning)
  and must be root-caused and fixed.

Both are regressions/defects relative to the v0.5.0/v0.6.0 acceptance criteria
(a live, authenticated operations queue with working approvals), so they are
**accepted as bugs** and scheduled into v0.6.1.

## Resulting task changes

Added to `docs/process/TASK_BOARD.md` as the **v0.6.1 — Operations fixes (patch)**
milestone (the v0.7.0 backlog is untouched and deferred):

- **B-03** — Ops console: restore navigation at narrow widths (responsive
  sidebar / mobile menu) so all sections remain reachable. If misuse rather than
  a bug, document the existing path in the human-review doc instead. *(accepted)*
- **B-04** — Ops console: fix "Not authenticated" in Request queues so the live
  queue loads for a logged-in operator and onboarding/other requests can be
  approved end-to-end. Root-cause first, then fix. *(accepted)*
- **B-05** — Add/confirm regression coverage for both fixes (queue loads
  authenticated for an operator; navigation reachable at narrow widths) and keep
  `npm run verify` green. *(accepted, supporting)*
- **DOC-061** — Produce v0.6.1-named process docs (milestone report, human
  review with the bug explanations, next-session prompt, updated PROJECT_STATE /
  NEXT_SESSION / TASK_BOARD / EXPERIMENT_LOG / CHANGELOG / QUALITY_REPORT) and an
  annotated tag `v0.6.1`. *(accepted)*

## Accepted feedback

- **B-03 (narrow-width navigation)** — Accepted. Will investigate the operations
  console layout; if the sidebar is unconditionally hidden below a breakpoint with
  no replacement control, add an accessible responsive nav (e.g. a top bar +
  toggle/hamburger menu) so Dashboard / Request queues / Simulated messaging stay
  reachable at any width. The v0.6.1 human-review doc will explain exactly what was
  wrong and how it was fixed (or, if it turns out the human missed an existing
  control, document that control there instead).
- **B-04 ("Not authenticated" queues / approvals unreachable)** — Accepted as a
  bug. Will root-cause the authentication failure in the Request queues data path
  (likely the ops API/socket auth — cookie audience/credentials, session, or
  RBAC) and fix it so a logged-in operator sees the live queue and can approve a
  customer onboarding application end-to-end. Will add regression coverage.
- **Re-scope to v0.6.1 (no v0.7.0)** — Accepted. This session ships ONLY the
  feedback fixes as a patch release `v0.6.1`, with v0.6.1-named docs under
  `docs/process/`. v0.7.0 is not started.

## Deferred feedback

- **v0.7.0 — Money movement** — Deferred (by the human's explicit instruction) to
  the next session, contingent on the human's review of v0.6.1. The carried v0.5.0
  review item **Q-01** (approving a pending deposit should flip it pending→posted)
  remains parked with v0.7.0; it is NOT addressed in v0.6.1.

## Rejected or modified feedback

- None. All feedback accepted as stated; scope narrowed to a patch release exactly
  as requested.

## Questions carried forward

- None new. (Carried from v0.5.0: **Q-01**, addressed in v0.7.0, not here.) After
  v0.6.1 review, confirm whether to proceed to v0.7.0 as planned.

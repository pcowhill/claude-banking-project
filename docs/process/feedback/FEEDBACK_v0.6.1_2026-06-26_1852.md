# Feedback — v0.6.1 (Operations console fixes)

- Milestone reviewed: v0.6.1
- Date/time: 2026-06-26 18:52 (local)
- Source session label (if known): "v0.6.1 review"

## Raw feedback (verbatim — DO NOT EDIT)

> ```
> I am unable to test if the bug is fixed because now there is a new bug preventing me from logging into the Meridian Ops.  When I visit the Meridian Ops page, I see a log-in page.  However, if I try to log in as Sam or the Administrator, I see the dashboard for a fraction of a second, and then I am sent back to the login page where this message appears: "Your operator session has ended (it expired or you were signed out). Please sign in again to continue — your queues and actions will load once you do."  Even after closing my tabs, clearing cookies, and trying to revisit, I cannot log in.
>
> I would like you to fix this bug before moving onto version v0.7 .  Please do not pursue any changes in v0.7 and instead, fix this bug and create v0.6.2 .  Only after I have been able to test v0.6.2, I will provide feedback and guidance for moving onto v0.7
> ```

## Claude's interpretation

A **new, blocking regression** introduced by the v0.6.1 B-04 session-recovery fix:
the operator can no longer sign in to the Meridian Operations console at all. After
a successful login the dashboard renders for a moment, then the operator is bounced
back to the sign-in screen with the v0.6.1 B-04 notice ("Your operator session has
ended …"). It loops forever and survives clearing cookies. Both seeded staff users
(Sam the operator, Riley the admin) are affected — so it is not role-, account-, or
cookie-state-specific; it is a code defect.

**Re-scope:** the human explicitly directs this session **away from v0.7.0 (Money
movement)** to a **patch release v0.6.2** that fixes ONLY this login bug. v0.7.0 must
not be started. The human will test v0.6.2 and only then give guidance for v0.7.0.

### Root cause (confirmed by reproduction)

The backend chooses the per-surface session cookie (`mer_session` for the customer
portal, `mer_ops_session` for the operations console) **from the request `Origin`
header**, defaulting to the customer surface whenever `Origin` is absent or
unrecognized (`apps/backend/src/auth/cookies.ts` → `sessionAudienceForOrigin`).

But **browsers omit the `Origin` header on same-origin GET requests** (they send it
on the login POST, but not on subsequent safe-method GETs). In a deployment where
the console and the API share one origin, the operator's authenticated GETs to
`/api/ops/*` therefore arrived with no `Origin`, were treated as the *customer*
surface, read the empty `mer_session` cookie, and returned **401**. v0.6.0 surfaced
that exact 401 as the "Not authenticated" dead-end (the original B-04 report); the
v0.6.1 recovery handler then escalated the same 401 into an **unrecoverable login
loop**. The standard cross-origin dev setup (`:5174` → `:3000`) always sends
`Origin`, which is why local runs, the curl checks, and the cross-origin Playwright
suite all passed while the human's environment failed.

### The fix (v0.6.2 / B-06)

Each front-end app now **declares its surface with an explicit header**
(`AUTH.surfaceHeader` = `x-meridian-surface`) that the backend trusts **ahead of**
`Origin` (Origin remains a fallback, so the Socket.IO handshake, cross-origin dev,
and existing tests are unchanged). The operations console sends `operations` on
every authenticated REST call and on the socket handshake; the backend resolves the
cookie from the header, so the session survives regardless of whether the browser
sent `Origin`. Session isolation (the v0.3.0 fix) is preserved.

## Resulting task changes

- Added **`B-06`** (root-cause + fix the operations sign-in loop) and **`DOC-062`**
  (v0.6.2 handoff docs + tag) to `TASK_BOARD.md`. No other scope added; **v0.7.0
  remains not started**.

## Accepted feedback

- **Fix the login bug before v0.7.0, as v0.6.2.** Accepted and done: root-caused,
  fixed (surface header), and verified (201 unit/integration tests; 33 Playwright
  e2e in real Chromium, including a new same-origin reproduction that strips
  `Origin` on GETs exactly as a browser would; session-isolation e2e still green).
- **Do not pursue v0.7.0.** Accepted: no money-movement work was started.

## Deferred feedback

- **v0.7.0 — Money movement** is deferred until the human tests v0.6.2 and gives the
  go-ahead, per their instruction.

## Rejected or modified feedback

- None. (Process note for honesty: the verbatim feedback was saved as part of the
  same session in which the fix was implemented; per the session protocol it should
  be saved before acting. The raw block above is preserved exactly and unedited.)

## Questions carried forward

- For the human to confirm at v0.6.2 review: can you now sign in to Meridian
  Operations as **Sam** (`sam.operator@example.com` / `Operator123!`) and as the
  **Administrator** (`riley.admin@example.com` / `Admin123!`), reach the dashboard,
  and open Request queues without being bounced to sign-in? Then we proceed to
  v0.7.0 — Money movement.

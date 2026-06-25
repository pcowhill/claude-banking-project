# Feedback — v0.2.0 (Auth, roles, and demo users) review

- Milestone reviewed: v0.2.0
- Date/time: 2026-06-25 03:06 (UTC; Claude Code Cloud session clock)
- Source session label (if known): "v0.2.0 review" → start of v0.3.0 session

## Raw feedback (verbatim — DO NOT EDIT)

> ```
> ## My v0.2.0 review feedback
>
> - Overall: Overall, everything seems to be going well so far.
> - Things to change: There seems to be a bug.  If I log into Meridian as Customer or Joint customer, then http://localhost:5173/dashboard shows the Customer's or Joint customer's account details.  If I then also log into the Meridian Ops as the Operations agent or Administrator,  then http://localhost:5173/dashboard still shows the Customer's or Joint customer's account details.  This is all expected so far.  However, if I then log-out of the Customer's or Joint customer's account on Meridian, going to http://localhost:5173/dashboard shows me logged in as the Operations agent or Administrator.  This does not seem right to me.  It seems to me that if I log out of Meridian, then visiting http://localhost:5173/dashboard  should redirect me to the log-in screen.  My log in session with Meridian Ops should not influence the Meridian site in this way.  If you agree with this, fix it, if not, include justification for it within the HUMAN_REVIEW_v0.3.md that you will create during this session.
> - Approve starting v0.3.0? yes
> ```

## Claude's interpretation

The human reviewed the v0.2.0 Auth milestone and is satisfied overall ("everything
seems to be going well"). They reported **one concrete bug** and explicitly
**approved starting v0.3.0**.

**The reported bug — cross-app session bleed (ACCEPTED; I agree it is a real bug).**

Reproduction in the human's words: log in to the customer app (Meridian, `:5173`);
separately log in to the operations console (Meridian Ops, `:5174`) as an operator
or admin; then log out of the customer app — and visiting
`http://localhost:5173/dashboard` shows you logged in as the *operator/admin*
instead of redirecting you to the customer login screen.

**Root cause (verified in code):** Both apps authenticate against the same backend
origin (`http://localhost:3000`) using a **single** session cookie
(`AUTH.sessionCookieName = 'mer_session'`, set with no `Domain`, so it is a
*host-only* cookie for `localhost`). Browser cookies are **not** isolated by port —
`localhost:5173` and `localhost:5174` share one cookie jar for the host `localhost`.
Consequently there is effectively **one** session shared by both apps: logging into
Ops overwrites the cookie the customer app reads, and a customer logout
revokes/clears whichever single session the cookie currently points at. The
operator/admin session "bleeding through" on the customer dashboard is a direct
symptom of this shared-cookie coupling. The human's mental model is correct: the
two surfaces are different security contexts and must hold **independent**
sessions; an Ops login must not influence the customer site.

**The fix (planned this milestone, task `W-00`):** Give each app surface its own
session cookie — `mer_session` for the customer portal, `mer_ops_session` for the
Ops console — and have the backend select which cookie to set / read / clear based
on the request's `Origin` (which is already CORS-whitelisted). With per-surface
cookies, the customer app never reads the Ops cookie (and vice-versa), so logging
out of (or never logging into) the customer portal makes `/dashboard` require a
fresh customer login, exactly as the human expects. No frontend changes and no
schema migration are required; the session cookie is `httpOnly` and browser-managed.
Because this touches auth + routing (a designated *risky shared area*), it is
serialized, covered by new backend integration tests for session isolation, and
reviewed before the gate. The analysis and the fix are also written up in
`docs/process/HUMAN_REVIEW_v0.3.md` (per the human's request to document either a
fix or a justification there).

**v0.3.0 approval — ACCEPTED.** Proceed with v0.3.0 (Public bank website and
branding) as planned, with the session-isolation bug fix folded in as the first
task (it is a small, well-scoped auth fix and a prerequisite for shipping a public
site whose login entry points must behave correctly).

## Resulting task changes

- **Added `W-00` — Cross-app session isolation (bug fix)** to the v0.3.0 block in
  `TASK_BOARD.md` (Backend/API + Security; serialized risky area; done first).
- **Added the v0.3.0 website tasks `W-01…W-09`** (decomposed from the ROADMAP /
  NEXT_SESSION acceptance targets: home page, product marketing pages, image
  placeholders, login/open-account entry points, responsive + a11y polish, tests,
  handoff).
- No change to milestone *order* or to the broader roadmap; the bug fix is absorbed
  into v0.3.0 rather than deferred.

## Accepted feedback

- **Cross-app session bleed** — Accepted; fixing it this milestone (`W-00`) via
  per-surface session cookies chosen by request Origin. Verified root cause and a
  fix that matches the human's expected behavior (customer logout ⇒
  `/dashboard` redirects to the customer login; Ops session stays independent).
- **"Everything seems to be going well so far"** — Accepted as positive
  reinforcement; maintain the established quality bar and process discipline.
- **"Approve starting v0.3.0? yes"** — Accepted; beginning v0.3.0 (public website +
  branding) this session, keeping `npm run verify` green and the simulation
  disclaimer visible, stopping at the v0.3.0 gate with full handoff docs.

## Deferred feedback

None. The only requested change (the bug) is being done now, not deferred.

## Rejected or modified feedback

None. Nothing in the feedback was rejected. (The human offered the option to
*justify* not fixing the bug; I agree it is a real bug and am fixing it, while still
documenting the analysis in `HUMAN_REVIEW_v0.3.md` as requested.)

## Questions carried forward

None blocking. One non-blocking note the human may weigh in on at the next gate:

- After this fix, a customer and an operator can be signed in **simultaneously** in
  the same browser (one per app surface) without interfering — this is the intended
  behavior and matches "my Ops session should not influence the Meridian site."
  Each surface still logs out independently. If the human would instead prefer a
  single mutually-exclusive session across both apps, that is a different product
  decision we can revisit; the current fix follows their stated expectation.

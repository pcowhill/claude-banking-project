# Feedback — v0.3.0 (Public bank website and branding) review

- Milestone reviewed: v0.3.0
- Date/time: 2026-06-25 10:53 (UTC; Claude Code Cloud session clock)
- Source session label (if known): "v0.3.0 review" → start of v0.4.0 session

## Raw feedback (verbatim — DO NOT EDIT)

> ```
> ## My human review feedback for v0.3.0
>
> - Overall: Looking good.
> - Things to change:  (1) I notice that when I visit the other pages (Checking, Savings, Cards, Loans & CDs, and About, Open an account, Log in, Security) that it does not automatically scroll up to the top of the page.  I would like it to do this.  Notice that when I visit Dashboard, it does scroll me up to the top as I expect.  Also notice that there are other buttons that get to these pages other than the ones at the top of the page that should likewise scroll to the top after they navigate to the new page (e.g. the buttons at the button of the page and the "See Savings" and "See Checking" buttons at the bottom of the Loans & CDs page).  Furthermore, can the "Security" button navigate to the About page, but then scroll down/up to where the security section exists on that page (2) If I am logged in (to Avery Customer for example), the Home page still has a "Log in" button that sends me to a log-in screen.  This seems a bit strange to me since I am already logged in.  I think that if I am logged in, all the buttons that say things like "Log In" or "Open an account" should instead say something like "Visit your Dashboard".  In general, I would rather just be sent to my dashboard instead of sent to a log-in page when I am already logged in.  Perhaps another good fallback for this is that if someone attempts to visit the log-in page, you can make it so that a page appears that says you are already logged in, and it can have a link to visit the dashboard and a button to log out and go to the login page if they would like.
> - Approve starting v0.4.0? yes
> ```

## Claude's interpretation

The human reviewed v0.3.0 (the public website + branding) and is happy overall
("Looking good"). They reported **two concrete UX change requests** on the public
site and explicitly **approved starting v0.4.0** ("Approve starting v0.4.0? yes").

Both change requests are small, well-scoped, customer-frontend UX fixes to the
v0.3.0 surface. Neither re-scopes v0.4.0; they are accepted and folded into **this**
session as a short "v0.3.0 review follow-ups" polish pass done **before** the v0.4.0
dashboard work (they touch routing/nav, a risky shared area, so doing them first and
verifying keeps the foundation clean for the dashboard). Detail below.

### (1) Scroll-to-top on navigation + a "Security" deep-link — ACCEPTED

Observed behavior: navigating to public pages (Checking, Savings, Cards, Loans &
CDs / `borrow`, About, Open an account, Log in) does **not** reset scroll to the top
of the new page, whereas navigating to Dashboard does. The human wants **every**
client-side navigation to land at the top of the destination page — not only from
the header links but from **all** controls that navigate (footer links, in-page CTAs
like the "See Savings" / "See Checking" buttons at the bottom of the Loans & CDs
page, hero/CTA buttons, etc.).

Root cause (verified): React Router does not restore/reset scroll position on
client-side navigation by default. The Dashboard "works" only incidentally (it's
reached via a full context change / shorter pages). The correct, global fix is a
single **scroll-to-top-on-route-change** behavior (a `ScrollToTop` effect mounted at
the router root) so it applies uniformly to every navigation, regardless of which
control triggered it — no need to touch each button.

Special case — the **"Security"** entry point: it should navigate to the **About**
page and then scroll to the **security section** that already exists there
(`/about#security`). So the global "scroll to top" must yield to an explicit hash
target: when the destination URL has a `#fragment`, scroll that element into view
(and account for the sticky header offset) instead of scrolling to the top. This
gives "scroll to the top on plain navigations" **and** "scroll to the security
section when the Security link is used."

### (2) Logged-in-aware public CTAs + an "already logged in" /login page — ACCEPTED

Observed behavior: when already authenticated (e.g. as Avery Customer), the public
Home page still shows a **"Log in"** button (and "Open an account" CTAs) that send
the user to the login screen, which is confusing when they're already signed in.

The human wants, when authenticated: the public-site CTAs that currently say "Log
in" / "Open an account" to instead say something like **"Visit your Dashboard"** and
route straight to `/dashboard`; and, as a safety net, if an authenticated user does
land on **`/login`**, show an **"already logged in"** state — a message plus a link
to the dashboard and a **log out** button (which then returns them to the login
page) — rather than the login form.

Interpretation in this project's terms: make the public CTAs **session-aware** (the
customer app already has an auth context/provider and session-aware portal nav from
v0.2.0/v0.3.0 — extend that awareness to the public marketing CTAs), and add an
authenticated branch to the `/login` route. This must **not** regress the v0.2.0
protected `/dashboard`/auth or the unauthenticated public site (logged-out visitors
still see "Log in" / "Open an account" and the normal login form).

### v0.4.0 approval — ACCEPTED

Proceed with **v0.4.0 — Customer banking dashboard** this session after the two
follow-ups above: accounts overview, checking/savings detail, transaction history
(pending vs posted) with basic search/filter, a statements/documents placeholder,
and realistic seeded transaction data — with balances kept **derived** from the
append-only ledger (never stored), `npm run verify` green, and the simulation
disclaimer visible. The Prisma schema/seed is a risky shared area → serialize and
review any change.

## Resulting task changes

- **Added a "v0.3.0 review follow-ups" group to `TASK_BOARD.md`** (folded into the
  v0.4.0 session, done first):
  - `R-01` — Global scroll-to-top on route change + hash-aware deep-link (incl. the
    "Security" → `/about#security` link). Frontend Customer.
  - `R-02` — Session-aware public CTAs ("Visit your Dashboard" when logged in) +
    "already logged in" state on `/login` (dashboard link + log-out button).
    Frontend Customer.
- **Added the v0.4.0 dashboard tasks `D-01…D-09`** (decomposed from the
  ROADMAP/NEXT_SESSION acceptance targets: transaction DTOs, seed transaction data +
  read endpoints, accounts overview, account detail, transaction history with
  pending/posted + search/filter, statements placeholder, tests, handoff).
- No change to milestone *order* or to the broader roadmap; the two follow-ups are
  absorbed into this session rather than deferred.

## Accepted feedback

- **(1) Scroll-to-top on navigation + Security deep-link** — Accepted; implementing
  a global route-change scroll reset with hash-aware deep-linking (`R-01`).
- **(2) Logged-in-aware CTAs + already-logged-in /login page** — Accepted;
  implementing session-aware public CTAs and an authenticated `/login` branch
  (`R-02`).
- **"Looking good" / "Approve starting v0.4.0? yes"** — Accepted; beginning v0.4.0
  (customer banking dashboard) this session after the two follow-ups, keeping the
  gate green and the disclaimer visible, stopping at the v0.4.0 gate with full
  handoff docs.

## Deferred feedback

None. Both requested changes are being done now, not deferred.

## Rejected or modified feedback

None rejected. One small **clarification** on request (2): the human suggested the
already-logged-in `/login` page have "a button to log out and go to the login page."
Implemented exactly as asked — but note the primary, recommended path is the
"Visit your Dashboard" link; the log-out button is the secondary action for someone
who genuinely wants to switch accounts. (No behavioral deviation; just noting the
emphasis.)

## Questions carried forward

None blocking. One non-blocking note for the next gate:

- Request (2) means a logged-in customer effectively cannot reach the bare login
  *form* without logging out first (by design, per the human's preference to "just
  be sent to my dashboard"). If the human later wants a quick "switch account"
  affordance that goes straight to a fresh form, that's a small follow-up we can add.

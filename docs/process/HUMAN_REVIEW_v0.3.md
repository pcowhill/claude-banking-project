# HUMAN REVIEW — v0.3.0 (Public bank website and branding)

Your review guide for the third milestone: what changed, how to run and see it,
the bug you reported (with the full analysis you asked for), what's not done yet,
and where to leave feedback.

> Reminder: **Meridian is a local SIMULATION, not a real bank.** No real money,
> accounts, or integrations. The marketing copy, rates, and fees on the new pages
> are illustrative and clearly labelled as simulated.

## Build under review

- **Branch:** `claude/jolly-archimedes-hqljs0` (the Claude Code Cloud session
  branch, used as the milestone branch; intended name `milestone/v0.3-website`).
- **Tag:** `v0.3.0` (annotated) — created locally on the milestone commit.
  **Pushing tags is blocked by this cloud environment's git policy (HTTP 403)**,
  so you create/push the tag on merge (commands below).
- **Commit:** the tip of the branch (`git log -1`).

## The bug you reported (and the fix) — you asked me to document this here

**Your report (v0.2.0 review):** logged into the customer app (Meridian, `:5173`)
and separately into the operations console (Meridian Ops, `:5174`); after logging
out of the customer app, visiting `http://localhost:5173/dashboard` showed you
logged in as the **operator/admin** instead of redirecting to the customer login.

**I agree this is a real bug, and I fixed it.** Investigating it turned up **two**
root causes — both now fixed:

1. **One session cookie was shared by both apps.** Both apps talk to the same
   backend origin (`http://localhost:3000`), and the session cookie was set with
   no `Domain`, making it a *host-only* cookie for `localhost`. Browser cookies
   are **not isolated by port**, so `localhost:5173` and `localhost:5174` shared a
   single cookie jar — effectively one session for both apps. Logging into Ops
   overwrote the cookie the customer app read.
   - **Fix:** each surface now gets its **own** session cookie (`mer_session` for
     the customer portal, `mer_ops_session` for the operations console), chosen
     per request by the request `Origin` (also matched by the ops port, so it
     works on a LAN host too). The two sessions are now fully independent.

2. **The customer logout never actually logged you out.** The customer app's
   logout sent a `POST` with `Content-Type: application/json` **but no body**.
   The backend (correctly, by default) rejects an empty JSON body with **HTTP
   400**, so the logout handler never ran — the session was never revoked and the
   cookie never cleared. The app *looked* logged out (it clears its own state
   best-effort), but the server session stayed alive. This was masked in v0.2.0
   because no test navigated to a protected route after logout.
   - **Fix:** the client no longer sends a JSON content-type on bodyless requests,
     and the backend now tolerates an empty JSON body (treats it as `{}`).

Together these produced exactly what you saw: the Ops login overwrote the shared
cookie, and the customer "logout" failed to clear it — so `/dashboard` resolved
the still-valid operator session. **Now:** logging out of the customer app (or not
being logged in) makes `/dashboard` redirect to the customer login, and the two
apps' sessions never affect each other.

**How it's verified:** a backend integration test (`session-isolation.test.ts`)
drives both surfaces with their cookies; a backend regression test confirms a
bodyless-JSON logout still revokes; and a **browser-level** Playwright test
(`session-isolation.spec.ts`) reproduces your exact two-tab scenario and asserts
the redirect-to-login. All green.

## What else changed (the v0.3.0 milestone)

A polished, multi-page **public marketing website** built on the existing brand
tokens and Meridian logo:

- **Home** — hero, value props, product highlights, "bank from anywhere" cards, a
  security teaser, a (clearly-simulated) testimonial, and a closing call to action.
- **Product pages** — `/checking` and `/savings` (features, **simulated** rates/
  fees with disclaimers, FAQs) and `/cards` + `/borrow` (loans & CDs) presented as
  **"coming soon"** with the milestone that delivers each capability.
- **About** (`/about`) — the simulation story, a **Security** section (anchored
  from the home page + footer), and a roadmap snapshot.
- **Open account** (`/open-account`) — an onboarding placeholder that routes to the
  working demo login (full onboarding lands in v0.6.0).
- **Responsive + accessible** — a sticky header with the full product nav, an
  accessible **mobile menu**, a **skip-to-content** link, semantic landmarks/
  headings, labelled controls, and descriptive `alt` text. The **simulation
  disclaimer stays visible site-wide** (banner on every page + footer notice).
- **Images** — all photos are drop-in `ImagePlaceholder` slots (branded gradients
  until real files are added to `apps/customer/public/images/`). Prompts for every
  slot are in `assets/prompts/IMAGE_GENERATION_PROMPTS.md`.

## How to run it locally

```bash
git pull
npm install
npm run db:reset      # seeds the demo users (required for login)
npm run verify
npm run dev           # backend :3000, customer :5173, operations :5174
```

Open **http://localhost:5173** and browse Home → Checking → Savings → Cards →
Loans & CDs → About → Open account. Try the mobile layout by narrowing the window.

### See the bug fix for yourself

1. Log in to the customer app (`:5173`) as **Avery** (`avery.customer@example.com`
   / `Customer123!`).
2. In another tab, log in to the operations console (`:5174`) as **Riley**
   (`riley.admin@example.com` / `Admin123!`) or **Sam** (`sam.operator@…`).
3. Back on `:5173`, click **Log out**, then visit
   **http://localhost:5173/dashboard** → you are redirected to the **customer
   login** (not shown as the operator/admin). The Ops tab stays logged in.

## Expected check status

- `npm run verify` → **passes** (lint, typecheck, **70** unit/integration tests,
  build).
- `npm run test:e2e` → **14 passed** (Chromium) — public-site nav, login journeys,
  RBAC, redirect, and the cross-app session-isolation scenario.

## Known limitations (by design for this milestone)

- **Marketing images are placeholders.** Branded gradients render until you drop
  real files into `apps/customer/public/images/` (prompts provided). No code change
  needed to adopt them.
- **`/open-account` is a placeholder.** Real onboarding (application, identity,
  funding) is the v0.6.0 milestone; the page routes you to the demo login for now.
- **Cards and Loans/CDs pages are "coming soon"** previews (v0.8.0 / v0.9.0); the
  features they describe are not built yet and say so.
- **Security follow-ups (Low, unchanged from v0.2.0):** CSRF token before real
  mutation endpoints (v0.7.0), config-driven cookie `secure` flag, helmet + login
  rate-limit (v1.0.0). Tracked in `docs/process/QUALITY_REPORT.md`.

## Failed or skipped checks

- **None failed.** Frontend component **unit** tests remain intentionally deferred;
  the public site is covered by the build + Playwright journeys. The prior
  dev/test-tooling npm audit advisories (vite, vitest, esbuild) remain — dev-only,
  not shipped; tracked for the v1.0.0 hardening pass.

## About branches & merging

Built in Claude Code Cloud on `claude/jolly-archimedes-hqljs0`. The annotated
`v0.3.0` tag was created locally but **could not be pushed** (the environment
returns HTTP 403 for tag pushes; only the session branch is pushable). To adopt
v0.3.0, after reviewing the branch run locally:

```bash
git fetch origin
git checkout main
git merge --no-ff origin/claude/jolly-archimedes-hqljs0
git tag -a v0.3.0 -m "v0.3.0 — Public bank website and branding"
git push origin main
git push origin v0.3.0
```

No pull request was opened (none requested) — say the word if you'd like one.

## Questions for you (each with my recommendation)

1. **Session model after the fix:** a customer and an operator can now be signed in
   **simultaneously** in one browser (one per app) without interfering — matching
   your "Ops shouldn't influence the Meridian site." _Recommendation: keep._ If
   you'd instead prefer a single mutually-exclusive session across both apps, say
   so and I'll change it.
2. **Backend hardening (empty JSON body → `{}`):** I added this so a bodyless POST
   can't silently 400 again. _Recommendation: keep_ (small, standard, tested).
3. **Coming-soon pages** for Cards and Loans/CDs now, vs. waiting until those
   milestones build them. _Recommendation: keep_ — they set expectations and keep
   the nav complete; each is clearly tagged "not built yet."
4. **v0.4.0 scope** (customer banking dashboard: accounts overview, transaction
   history, statements placeholder, richer seeded data) — proceed as planned?
   _Recommendation: proceed._

## Leave your feedback here

Copy this block, fill it in, and paste it into your next session (or commit it).
Your next session will **save it verbatim** under `docs/process/feedback/` before
acting on it (the raw text is never edited afterward).

```markdown
## My v0.3.0 review feedback

- Overall: <thumbs up / changes needed>
- Answers to the questions above (1–4):
- Things to change:
- Things to add/deprioritize:
- Approve starting v0.4.0? <yes / not yet>
```

> Tip: if your only feedback is "continue", that's fine — it will be saved verbatim
> and treated as approval to proceed to v0.4.0.

## Next session

Use the ready-made prompt in `docs/process/NEXT_SESSION_PROMPT_v0.3.md`.

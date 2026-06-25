# HUMAN REVIEW — v0.2.0 (Auth, roles, and demo users)

Your review guide for the second milestone: what changed, how to run and test it,
what to expect, what's not done yet, and where to leave feedback.

> Reminder: **Meridian is a local SIMULATION, not a real bank.** No real money,
> accounts, or integrations. The demo passwords below are non-secret on purpose.

## Build under review

- **Branch:** `claude/gifted-hawking-x44wtg` (the Claude Code Cloud session
  branch, used as the milestone branch; intended name `milestone/v0.2-auth`).
- **Tag:** `v0.2.0` (annotated) — created locally on the milestone commit.
  **Pushing tags is blocked by this cloud environment's git policy (HTTP 403)**,
  so you create/push the tag on merge (commands below).
- **Commit:** the tip of the branch (`git log -1`).
- **Merge to `main`:** pending your review — see "About branches & merging".

## What changed (high level)

Real authentication and access control over the simulated data:

- **Login** for customers (customer app) and bank staff (operations console),
  with **real password hashing** (bcryptjs — no custom crypto).
- **Cookie sessions** (opaque token; only its SHA-256 hash is stored), an idle
  timeout, logout, and **account lockout** after repeated failed logins.
- **Role-based access control**: customers see only their own accounts; the joint
  customer sees only the shared account; operations/admin endpoints are
  role-gated.
- **Seeded demo users** for every role, **login history** ("recent sign-in
  activity" on the dashboard), and **audit-log** rows on notable auth events.
- A **read-only security review** ran before the gate — no blockers.

Full list: `CHANGELOG.md` → [0.2.0]. Engineering detail:
`docs/process/MILESTONE_REPORT_v0.2.md`.

## How to run it locally

### Windows 11 — PowerShell  /  WSL Ubuntu

```bash
git pull
npm install
npm run db:reset      # creates + seeds the demo users (required)
npm run verify
npm run dev
```

> Browser smoke/auth tests (optional, first time): `npm run test:e2e:install`
> then `npm run test:e2e`.

### URLs

- **Customer app:** http://localhost:5173
- **Operations simulator:** http://localhost:5174 _(second tab/window)_
- Backend: http://localhost:3000/health and http://localhost:3000/status

## Demo accounts (non-secret, seeded by `npm run db:reset`)

| Role | App | Email | Password |
| --- | --- | --- | --- |
| Customer | Customer (`:5173`) | `avery.customer@example.com` | `Customer123!` |
| Joint customer | Customer (`:5173`) | `jordan.joint@example.com` | `Joint123!` |
| Operations agent | Operations (`:5174`) | `sam.operator@example.com` | `Operator123!` |
| Bank admin | Operations (`:5174`) | `riley.admin@example.com` | `Admin123!` |

Each login screen has a **"Demo logins"** panel — click one to fill the form.

## What to test manually

1. **Customer login (5173 → Log in):** sign in as **Avery**. You land on the
   dashboard greeting you by name, with **two** accounts (Everyday Checking, Goal
   Savings) showing Available vs Current balances (DERIVED from the ledger), and a
   **"Recent sign-in activity"** card. The header shows your name + **Log out**.
2. **RBAC (joint):** log out, sign in as **Jordan** (joint). You see **only**
   Everyday Checking (the shared account) — not Goal Savings. That's the
   access-control working.
3. **Protected route:** while logged out, open http://localhost:5173/dashboard —
   you're redirected to the login page.
4. **Wrong password / lockout:** enter a wrong password a few times; after 5 the
   account is temporarily locked (the message says so). A correct password is
   refused while locked. (Re-seed with `npm run db:reset` to clear it.)
5. **Operations console (5174):** sign in as **Sam** (ops) or **Riley** (admin).
   The console shows a live "Platform overview" strip and your operator identity +
   role in the header. Try signing in there as **Avery** (a customer) — you're
   rejected with "this console is for bank staff only".
6. **Resilience:** stop the backend and reload — the apps still render and degrade
   gracefully (status pill turns red; data sections show an offline message).

## Expected check status

- `npm run verify` → **passes** (lint, typecheck, **65** tests, builds).
- `npm run test:e2e` → **8 passed** (if you installed browsers).
- No new runtime audit advisories from the auth work.

## Known limitations (by design for this milestone)

- **MFA, password reset, remember-device, new-device alerts** are deferred within
  the auth theme to later milestones (they pair with the operations queues).
- Account/transaction data is still the seeded demo set; real money movement is
  v0.4.0/v0.7.0.
- **Security follow-ups (Low, non-blocking):** add a CSRF token before real
  state-mutating endpoints land (v0.7.0), make the cookie `secure` flag
  config-driven, and add helmet + a login rate-limit (v1.0.0 hardening). Tracked
  in `docs/process/QUALITY_REPORT.md` (SEC-1..3).

## Failed or skipped checks

- **None failed.** Frontend component unit tests remain intentionally deferred
  (auth UIs covered by build + Playwright login journeys).
- The prior **dev/test-tooling npm audit advisories** (vite, vitest, esbuild)
  remain, unchanged — dev-only, not shipped; tracked for the v1.0.0 hardening
  pass in `QUALITY_REPORT.md`.

## About branches & merging

Built in Claude Code Cloud on `claude/gifted-hawking-x44wtg`. The annotated
`v0.2.0` tag was created locally but **could not be pushed** (the environment
returns HTTP 403 for tag pushes; only the session branch is pushable). To adopt
v0.2.0, after reviewing the branch run locally:

```bash
git fetch origin
git checkout main
git merge --no-ff origin/claude/gifted-hawking-x44wtg
git tag -a v0.2.0 -m "v0.2.0 — Auth, roles, and demo users"
git push origin main
git push origin v0.2.0
```

No pull request was opened (none requested) — say the word if you'd like one.

## Questions for you (each with my recommendation)

1. **bcryptjs (pure-JS) for hashing** instead of native bcrypt/argon2 — OK?
   _Recommendation: keep._ It's a real, standard library and needs no native
   toolchain (best for cross-platform local dev); argon2 can be a later option.
2. **Printing demo passwords** in the README and on the login screens — keep them
   visible? _Recommendation: keep._ They unlock only fake data and make the demo
   easy; trivial to hide later if you prefer.
3. **Security follow-ups (SEC-1..3)** — defer to the milestones noted, or pull any
   forward? _Recommendation: defer_; they don't matter until real mutation
   endpoints/deployment exist.
4. **v0.3.0 scope** (public bank website + branding: home page, product marketing
   pages, image placeholders, responsive polish) — proceed as planned?
   _Recommendation: proceed._
5. **Anything to change** about the auth UX or the process/docs before it
   compounds? _Recommendation: keep as-is; it's working._

## Leave your feedback here

Copy this block, fill it in, and paste it into your next session (or commit it).
Your next session will **save it verbatim** under `docs/process/feedback/` before
acting on it (the raw text is never edited afterward).

```markdown
## My v0.2.0 review feedback

- Overall: <thumbs up / changes needed>
- Answers to the questions above (1–5):
- Things to change:
- Things to add/deprioritize:
- Approve starting v0.3.0? <yes / not yet>
```

> Tip: if your only feedback is "continue", that's fine — it will be saved
> verbatim and treated as approval to proceed to v0.3.0.

## Next session

Use the ready-made prompt in `docs/process/NEXT_SESSION_PROMPT_v0.2.md`.

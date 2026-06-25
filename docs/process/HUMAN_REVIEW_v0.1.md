# HUMAN REVIEW — v0.1.0 (Project Foundation)

This is your review guide for the first milestone. It tells you what changed, how
to run and test it on Windows PowerShell and WSL Ubuntu, what to expect, what's
not done yet, and where to leave feedback.

> Reminder: **Meridian is a local SIMULATION, not a real bank.** No real money,
> accounts, or integrations.

## Build under review

- **Branch:** `claude/stoic-mayer-y1ik2y` (the Claude Code Cloud session branch,
  used as the milestone branch; intended name `milestone/v0.1-foundation`).
- **Tag:** `v0.1.0` (annotated) — points at the milestone commit on that branch.
- **Commit:** the tip of the branch / the `v0.1.0`-tagged commit (`git log -1`).
- **Merge to `main`:** pending your review — see "About branches & merging".

## What changed (high level)

A complete, runnable project foundation:

- TypeScript monorepo (npm workspaces): `packages/shared`, `apps/backend`,
  `apps/customer`, `apps/operations`.
- Backend (Fastify 5 + Socket.IO + Prisma/SQLite) with `/health`, `/status`,
  `/api/meta`, a 6-model schema, an initial migration, and seed/reset.
- Customer app (marketing home, login placeholder, dashboard shell with derived
  balances) and Operations simulator app (queues, scenario controls, simulated
  responses) — both branded and clearly labeled simulations.
- Shared **money + ledger** library with tests (derived balances; money can't
  appear from nowhere).
- Branding (Meridian compass logo SVGs, design tokens, image prompts).
- Tests (20 unit/integration + 3 Playwright smoke), CI, and the full
  docs/process framework.

Full list: `CHANGELOG.md` → [0.1.0].

## How to run it locally

### Windows 11 — PowerShell

```powershell
git pull
npm install
npm run db:reset
npm run verify
npm run dev
```

### WSL Ubuntu (on Windows 11)

```bash
git pull
npm install
npm run db:reset
npm run verify
npm run dev
```

> First time only, if you want to run the browser smoke tests yourself:
> ```
> npm run test:e2e:install
> npm run test:e2e
> ```

### URLs to open

- **Customer app:** http://localhost:5173
- **Operations simulator:** http://localhost:5174 _(open in a second tab/window)_
- Backend: http://localhost:3000/health and http://localhost:3000/status

## What to test manually

1. **Customer home (5173):** headline + product cards; a green "Backend online ·
   v0.1.0 · db ready" pill (proves API wiring); the gold **Simulation** banner at
   the top and the disclaimer in the footer.
2. **Login (5173 → "Log in"):** the form submits and explains real auth arrives
   in v0.2.0 (nothing is actually authenticated).
3. **Dashboard (5173 → "Dashboard" or the login page's "Preview the dashboard"):**
   two account cards showing **Available** vs **Current** balances. These are
   *derived* from sample ledger entries, not hard-coded numbers (Everyday
   Checking shows a pending hold note).
4. **Operations console (5174):** dark operator UI with pending-request queues
   (Approve/Reject/Hold/Request info buttons, disabled for now), scenario
   controls, and "Simulated external responses" — plus a banner stating this app
   simulates external/bank operations.
5. **Responsiveness:** narrow the window; layouts should adapt.
6. **Resilience:** stop the backend (Ctrl+C) and reload 5173 — the app still
   renders; the status pill turns red ("Backend offline").

## Expected check status

- `npm run verify` → **passes** (lint, typecheck, 20 tests, builds).
- `npm run test:e2e` → **3 passed** (if you installed browsers).
- `npm audit --omit=dev` (runtime) → **0 vulnerabilities**.

## Known limitations (by design for a foundation)

- No real authentication, sessions, or RBAC yet (v0.2.0).
- No real account/transaction data or money movement (v0.4.0+); dashboard uses
  sample data.
- Operations actions are placeholders (wired up from v0.5.0).
- Marketing photos are placeholders (drop files into
  `apps/customer/public/images/`; see `assets/prompts/IMAGE_GENERATION_PROMPTS.md`).

## Failed or skipped checks

- **None failed.** Frontend component unit tests are intentionally **deferred**
  (apps covered by build + smoke). 
- **Dev/test-tooling npm audit advisories remain** (vite, vitest, esbuild — 1
  critical, 1 high, 3 moderate), all dev-only and not in any shipped artifact.
  See `docs/process/QUALITY_REPORT.md` for details and the remediation plan.

## About branches & merging

This milestone was built in Claude Code Cloud on the session branch
`claude/stoic-mayer-y1ik2y` and tagged `v0.1.0`. The intended git model is:
`main` = latest completed milestone. To adopt v0.1.0 as `main`, review this
branch and merge it (the `v0.1.0` tag marks the milestone commit). No pull
request was opened (none was requested) — say the word if you'd like one.

## Questions for you (each with my recommendation)

1. **Bank brand "Meridian"** (navy/teal/white + gold, compass mark) — keep it?
   _Recommendation: keep._ It's distinctive and clearly fictional; easy to rename
   later if you prefer.
2. **Dev-tooling audit advisories** — fix now (major Vite/Vitest upgrades) or
   defer to a hardening pass? _Recommendation: defer_ to keep the foundation
   stable; runtime is already clean. I'll schedule it before v1.0.0.
3. **Auth approach for v0.2.0** — password hashing with **bcrypt** + httpOnly
   **cookie sessions** (simple, mainstream)? _Recommendation: yes_, unless you
   prefer argon2 or JWTs.
4. **v0.2.0 scope** — proceed exactly as planned in `ROADMAP.md` /
   `NEXT_SESSION.md`? _Recommendation: proceed._
5. **Anything to change about the process/docs framework** before it compounds
   over future milestones? _Recommendation: keep as-is; it's working._

## Leave your feedback here

Copy this block, fill it in, and paste it into your next session (or commit it).
Your next session will **save it verbatim** under `docs/process/feedback/` before
acting on it (and the raw text is never edited afterward).

```markdown
## My v0.1.0 review feedback

- Overall: <thumbs up / changes needed>
- Answers to the questions above (1–5):
- Things to change:
- Things to add/deprioritize:
- Approve starting v0.2.0? <yes / not yet>
```

> Tip: if your only feedback is "continue", that's fine — it will be saved
> verbatim and treated as approval to proceed to v0.2.0.

## Next session

Use the ready-made prompt in `docs/process/NEXT_SESSION_PROMPT_v0.1.md`.

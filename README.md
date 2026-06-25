# Meridian — Simulated Banking Platform (local demo)

> ⚠️ **This is a LOCAL SIMULATION. It is not a real bank.** No real money, real
> accounts, real cards, or real banking/SMS/email integrations are involved.
> Do not use it for anything financial. It exists to explore great banking UX
> and to run a multi-session, milestone-gated AI development experiment.

Meridian is a TypeScript monorepo with three runnable pieces:

| App | What it is | Local URL |
| --- | --- | --- |
| **Customer app** | Public marketing **website** + authenticated banking portal | http://localhost:5173 |
| **Operations simulator** | Internal console that *simulates* external banks & bank-employee actions | http://localhost:5174 |
| **Backend API** | Fastify + Socket.IO + Prisma/SQLite | http://localhost:3000 |

**Current milestone:** `v0.3.0 — Public bank website and branding` (see `ROADMAP.md`).

## Tech stack

TypeScript · npm workspaces · React + Vite (×2) · Node.js + Fastify ·
Socket.IO · Prisma + SQLite · Tailwind CSS (shadcn-style components) · Vitest ·
Playwright · GitHub Actions. No Docker required.

## Prerequisites

- **Node.js ≥ 20** (LTS) and **npm ≥ 10**. (Node 22 is fine.)
- Git.
- That's it — SQLite is file-based, no database server to install.

## Quick start

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

`npm run dev` starts all three apps together. Then open:

- **Customer app:** http://localhost:5173
- **Operations simulator:** http://localhost:5174 (open in a second tab/window)
- Backend health check: http://localhost:3000/health and http://localhost:3000/status

> On WSL, the apps bind with host networking so `localhost:5173` / `:5174` work
> from your Windows browser via WSL2 localhost forwarding.

## Signing in (demo accounts)

Authentication is **real** as of v0.2.0 (passwords are bcrypt-hashed; sessions
are httpOnly cookies) but it guards only fake, seeded demo data. The demo
passwords below are **intentionally non-secret** so you can explore each role.
Run `npm run db:reset` first to seed these users.

| Role | Where to log in | Email | Password | Can see |
| --- | --- | --- | --- | --- |
| Customer | Customer app (`:5173`) | `avery.customer@example.com` | `Customer123!` | Both own accounts (checking + savings) |
| Joint customer | Customer app (`:5173`) | `jordan.joint@example.com` | `Joint123!` | Only the **shared** checking account |
| Operations agent | Operations console (`:5174`) | `sam.operator@example.com` | `Operator123!` | Operations summary; staff console |
| Bank admin | Operations console (`:5174`) | `riley.admin@example.com` | `Admin123!` | Operations + admin user roster |

Sign in repeatedly with the wrong password and the account temporarily locks
(after 5 tries) — that's the lockout policy, not a bug. Every sign-in attempt is
recorded; the customer dashboard shows recent sign-in activity.

### New in v0.3.0 (public website)

- **Browse the public site at http://localhost:5173** — a polished home page plus
  **Checking**, **Savings**, **Cards** and **Loans & CDs** (coming-soon overviews),
  **About**, and an **Open account** page. Try the responsive **mobile menu** by
  narrowing the window. Marketing photos are drop-in placeholders (branded
  gradients until you add files to `apps/customer/public/images/`).
- **Independent app sessions:** the customer portal and the operations console now
  keep **separate** sessions. Logging into Ops no longer affects the customer site,
  and logging out of the customer app makes `/dashboard` redirect to the customer
  login (fixes the v0.2.0 review bug — see `docs/process/HUMAN_REVIEW_v0.3.md`).

### What to look at in v0.2.0

- **Customer login → dashboard:** sign in as Avery and see live accounts with
  *derived* balances (from the ledger, not hard-coded), plus recent sign-in
  activity. Sign in as Jordan (joint) to see only the shared checking account —
  the role-based access control in action.
- **Operations console login:** sign in as Sam (ops) or Riley (admin); a
  customer login is rejected from the staff console.
- The operations console with placeholder queues, scenario controls, and
  simulated external-response panels (they light up in later milestones).
- The always-on **simulation disclaimer** banner/footer in both apps.
- A live "backend online / db ready" indicator (proves the API wiring).

## Common commands

| Command | Description |
| --- | --- |
| `npm run dev` | Run backend + customer + operations concurrently. |
| `npm run db:reset` | Drop & recreate the SQLite DB, apply migrations, seed demo data. |
| `npm run db:seed` | Re-seed demo data. |
| `npm run verify` | **The gate:** lint + typecheck + unit/integration tests + build. |
| `npm run test` | Vitest unit/integration tests. |
| `npm run test:e2e` | Playwright smoke tests (run `npm run test:e2e:install` once first). |
| `npm run build` | Build all three apps. |
| `npm run lint` / `npm run format` | Lint / format the repo. |
| `npm run clean` | Remove build artifacts, generated code, and the local DB. |

### Running one app at a time

```bash
npm run dev:backend       # http://localhost:3000
npm run dev:customer      # http://localhost:5173
npm run dev:operations    # http://localhost:5174
```

## Project layout

```
apps/backend      Fastify API, Socket.IO, Prisma schema + seed
apps/customer     Customer React app
apps/operations   Operations simulator React app
packages/shared   Shared types, constants, brand tokens, money/ledger logic
assets/           Brand SVGs and image-generation prompts
docs/             Project state + the process/experiment framework
```

## The disciplined ledger (why balances are trustworthy)

Account balances are **never** stored as an editable number. They are derived
from an append-only ledger of entries (`packages/shared/src/ledger.ts`), and all
money is stored as integer minor units (cents). The test suite enforces that
money cannot appear or vanish except through explicit, bank-originated entries.
See `TECHNICAL_ARCHITECTURE.md`.

## For contributors / future AI sessions

Start with `CLAUDE.md`, then `docs/PROJECT_STATE.md` and `docs/NEXT_SESSION.md`.
The roadmap is in `ROADMAP.md`; the live task board is
`docs/process/TASK_BOARD.md`.

## Safety & scope

No real money. No real banking/SMS/email. No secrets committed. No custom
crypto. Not FDIC insured — because it is not a bank. See `QUALITY_BAR.md` and
`docs/process/decisions/ADR-0001-project-foundation.md`.

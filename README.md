# Meridian — Simulated Banking Platform (local demo)

> ⚠️ **This is a LOCAL SIMULATION. It is not a real bank.** No real money, real
> accounts, real cards, or real banking/SMS/email integrations are involved.
> Do not use it for anything financial. It exists to explore great banking UX
> and to run a multi-session, milestone-gated AI development experiment.

Meridian is a TypeScript monorepo with three runnable pieces:

| App | What it is | Local URL |
| --- | --- | --- |
| **Customer app** | Public marketing site + authenticated banking portal (shell) | http://localhost:5173 |
| **Operations simulator** | Internal console that *simulates* external banks & bank-employee actions | http://localhost:5174 |
| **Backend API** | Fastify + Socket.IO + Prisma/SQLite | http://localhost:3000 |

**Current milestone:** `v0.1.0 — Project Foundation` (see `ROADMAP.md`).

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

### What to look at in v0.1.0

- The customer marketing home, placeholder **Log in** page, and **Dashboard**
  shell (balances are *derived* from sample ledger entries, not hard-coded).
- The operations console with placeholder queues, scenario controls, and
  simulated external-response panels.
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

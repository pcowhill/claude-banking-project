# TECHNICAL_ARCHITECTURE

## Overview

A TypeScript monorepo (npm workspaces) with three runnable apps and one shared
library. Local-first, no Docker required.

```
┌─────────────────┐        ┌─────────────────────┐
│  Customer app   │        │  Operations sim app │
│  React + Vite   │        │  React + Vite       │
│  :5173          │        │  :5174              │
└────────┬────────┘        └──────────┬──────────┘
         │ HTTP (fetch) + WebSocket (Socket.IO)    │
         └───────────────┬────────────────────────┘
                         ▼
                ┌──────────────────┐
                │   Backend API    │
                │  Fastify :3000   │
                │  Socket.IO       │
                │  Prisma → SQLite │
                └──────────────────┘
                         │
                ┌──────────────────┐
                │ packages/shared  │  types · constants · brand
                │ (source import)  │  money + ledger logic (tested)
                └──────────────────┘
```

## Stack & versions (v0.1.0)

| Concern | Choice | Notes |
| --- | --- | --- |
| Language | TypeScript ~5.6 | `strict`, `moduleResolution: bundler` |
| Monorepo | npm workspaces | `packages/*`, `apps/*` |
| Customer/Ops UI | React 18.3 + Vite 5.4 | Two independent apps |
| Styling | Tailwind CSS 3.4 | shadcn-style components, `cn()` helper |
| Backend | Node + Fastify 5.8 | `@fastify/cors` 11 |
| Real-time | Socket.IO 4.8 | attached to the Fastify HTTP server |
| ORM / DB | Prisma 5.22 + SQLite | file-based, local only |
| Unit/integration tests | Vitest 2.1 | node env; `app.inject()` for the API |
| E2E / smoke | Playwright 1.61 | both apps load + disclaimers |
| Lint / format | ESLint 9 (flat) + Prettier 3 | typescript-eslint, react-hooks |
| CI | GitHub Actions | verify job + Playwright job |
| Bundling (backend) | tsup (esbuild) | bundles `@simbank/shared` source |

These versions were chosen for stability and broad documentation so future
sessions are not fighting the toolchain.

## Workspaces

- **`packages/shared`** — dependency-free TypeScript shared by every app:
  version/meta, brand tokens, constants, domain types, and the **money + ledger
  logic**. Exported as **source** (`exports → ./src/index.ts`); consumers (Vite,
  tsx, tsup) transpile it. No build step needed.
- **`apps/backend`** — Fastify API. `buildServer()` constructs the app with no
  side effects (no `listen`, no sockets) so tests can use `app.inject()`.
  `index.ts` is the runtime entrypoint that attaches Socket.IO and listens.
- **`apps/customer`** / **`apps/operations`** — React + Vite apps with their own
  routing, Tailwind config (brand palette mirrored from shared), and a small
  shadcn-style component set.

## Key decisions

### Disciplined ledger (the heart of the money model)

`packages/shared/src/ledger.ts` and `money.ts`:

- Money is stored as **integer minor units**; only formatting divides by 100.
- `LedgerEntry` has a positive `amountMinor`, a `direction` (`credit`/`debit`),
  a `status`, and an `origin`.
- `deriveBalances(entries)` computes **current** (posted/settled) and
  **available** (current − holds − pending debits) balances. Pending credits are
  tracked but conservatively excluded from available.
- `settledTotalMinor(entries)` is the system "money supply" used to prove
  conservation. Internal transfers net to zero; only bank-originated origins
  (`seed`, `interest`, `fee`, `adjustment`, `deposit`) may change the system
  total.
- Balances are **never** stored as editable fields in the DB; they are always
  derived. This is enforced by unit tests (`ledger.test.ts`, `seed-plan.test.ts`)
  including a test that a tampered seed "conjuring money from nowhere" is
  rejected.

### Database schema (extensible foundation)

`apps/backend/prisma/schema.prisma` defines `User`, `Account`, `LedgerEntry`,
`SimulationClock`, `AuditLog`, and `OperationsRequest`. SQLite has no enums, so
enum-like columns are strings whose allowed values live in `@simbank/shared`
(single source of truth). The schema is intentionally broader than v0.1.0 needs
so later milestones extend rather than restructure.

### Cross-platform SQLite path

Prisma resolves a relative `file:` SQLite URL **relative to the schema
directory** for both the CLI and the generated client, so `file:./dev.db` always
points to `apps/backend/prisma/dev.db` regardless of the working directory or OS.
A small `prisma/prisma-cli.mjs` wrapper supplies that URL to the CLI so the same
commands work on Windows PowerShell, WSL, macOS, and Linux **without committing
a `.env`**. The runtime client sets the same default in `src/db.ts`.

### Backend / real-time split

`buildServer()` (testable, side-effect-free) is separate from `index.ts`
(runtime). Socket.IO attaches to `app.server` only at runtime and emits a
welcome + heartbeat for now. `/health` never touches the DB (fast, safe for CI
to wait on); `/status` reports version + DB readiness and degrades gracefully.

### Frontend ↔ backend wiring

Apps read `VITE_API_URL` (default `http://localhost:3000`) and show a live
backend-status indicator. All API calls degrade gracefully so the UI renders
even when the backend is offline. Brand colors are defined once in
`packages/shared/src/brand.ts` and mirrored into each app's `tailwind.config.js`.

### Drop-in marketing images

The customer app references fixed image paths via an `ImagePlaceholder`
component that shows a branded gradient until a real file exists at
`apps/customer/public/images/<name>.jpg` — then it uses the file with no code
change. Prompts live in `assets/prompts/IMAGE_GENERATION_PROMPTS.md`.

## Build & test pipeline

- `npm run verify` = `lint → typecheck → test → build`. This is the milestone
  gate.
- Typecheck runs per workspace (`tsc -p`), build runs per workspace (tsup for
  backend, `vite build` for apps).
- Vitest workspace (`vitest.workspace.ts`) covers `packages/shared` and
  `apps/backend`. Playwright (`playwright.config.ts`) smoke-tests both apps with
  an auto-started full stack; it is intentionally **not** part of `verify` (kept
  fast/deterministic) but runs in CI as a separate job.

## Security posture (foundation)

No secrets in the repo; `.env` git-ignored. No custom crypto. Real password
hashing and RBAC arrive with auth in v0.2.0. Sensitive/admin actions are
designed to write `AuditLog` rows. See `QUALITY_BAR.md` and the
Security/Permissions reviewer agent.

## Known constraints / future work

- Runtime dependencies report **0 npm audit vulnerabilities**; some **dev/test
  tooling** (vite, vitest, esbuild) has open advisories that require major
  upgrades — tracked in `docs/process/QUALITY_REPORT.md` for a hardening pass.
- Component-level frontend unit tests are deferred; apps are covered by build +
  Playwright smoke for now (see `TEST_STRATEGY.md`).

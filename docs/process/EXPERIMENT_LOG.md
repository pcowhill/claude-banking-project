# EXPERIMENT_LOG

A chronological, append-only log of the AI-development experiment: what each
session set out to do, key decisions, surprises, and outcomes. Newest entries at
the top within each milestone. **Append; do not rewrite history.**

---

## Session 1 — v0.1.0 Project Foundation — 2026-06-25

**Goal:** Initialize the repo and complete only `v0.1.0 — Project Foundation`:
durable foundation, docs/process framework, local dev setup, and CI.

**Execution mode:** Emulated-sequential. The controlled multi-agent roles
(Planner, Backend, Frontend ×2, Testing/QA, Security, Process Scribe) are defined
in `.claude/agents/`, but v0.1.0 is almost entirely *risky shared area* work
(schema, routing, architecture, CI, repo structure) which the project rules say
to **serialize**. So a single session performed the plan → implement → test →
review → scribe steps in sequence and authored the agent definitions for future
parallelizable milestones.

**What was built:** see `CHANGELOG.md` [0.1.0] and `docs/PROJECT_STATE.md`.
Monorepo, shared money/ledger library, Fastify+Socket.IO+Prisma backend, two
React+Vite apps, branding, tests, CI, and the full docs/process framework.

**Key decisions (see ADR-0001):**
- Stack pinned to stable, mainstream versions for future-session ergonomics.
- **Disciplined ledger from day one** — derived balances, integer minor units,
  conservation tests — even though no real transactions exist yet, so the
  discipline is structural rather than retrofitted.
- **Fastify 5** (not 4): the audit flagged the Fastify-4 → `fast-uri` chain;
  Fastify 5.8.5 is patched, so the backend runtime has **0 audit
  vulnerabilities**. APIs used are v5-compatible.
- **No committed `.env`:** a small `prisma-cli.mjs` wrapper provides the local
  SQLite URL cross-platform; Prisma resolves relative `file:` paths against the
  schema dir for both CLI and client, so `file:./dev.db` is unambiguous.

**Surprises / environment friction (sandbox only — not a product issue):**
- Prisma's engine downloader could not reach `binaries.prisma.sh` through the
  Claude Code Cloud egress proxy (ECONNRESET). Resolved by hosting a **local
  mirror** of the engine binaries (curl works through the proxy) and pointing
  Prisma at it via `PRISMA_ENGINES_MIRROR` + `PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING`.
  Normal machines and GitHub Actions download engines normally — no project
  change needed.
- The pre-installed Chromium (1194) didn't match Playwright 1.61's expected
  build (1228). Added an **opt-in** `PLAYWRIGHT_CHROMIUM_PATH` config hook (no-op
  for normal users/CI) and pointed it at the pre-installed browser.
- Initial seed invariant was too strict (treated a legitimate external
  *payment* outflow as "missing money"). Reframed to the correct invariants:
  transfers net to zero, and every settled credit is bank-originated or a
  transfer leg.

**Outcome:** `npm run verify` passes; 20 unit/integration + 3 smoke tests green;
runtime audit clean. Milestone complete and tagged `v0.1.0`. Stopped at the
gate; did **not** begin v0.2.0.

**Carried forward / open items:** dev-tooling audit advisories (vite, vitest,
esbuild); deferred frontend component tests. Tracked in `QUALITY_REPORT.md`.

---

## Blocker-handling policy (applies every session)

If a required task genuinely fails after real attempts: try to fix it; if still
blocked, write a file under `docs/process/blockers/` containing what failed, what
was attempted, remaining errors, likely cause, options (retry / simplify / defer
/ remove / replace), a recommendation, and an exact suggested prompt for the next
session. Then **do not** mark the milestone complete or tag it; stop with a
truthful blocker report. Prioritize truthful project state over appearing done.

_No blockers were filed for v0.1.0._

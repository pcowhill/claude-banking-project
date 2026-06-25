# ADR-0001 — Project foundation choices

- **Status:** Accepted
- **Date:** 2026-06-25
- **Milestone:** v0.1.0
- **Deciders:** Session 1 (emulated multi-agent)

## Context

We are bootstrapping a local-first simulated banking platform that must (a) feel
like a real bank, (b) never touch real money/integrations, and (c) be carried
forward across many fresh Claude Code sessions. The foundation must be stable,
boring, and self-explanatory so future sessions extend rather than fight it.

## Decisions

1. **TypeScript monorepo with npm workspaces.** `packages/shared`, `apps/backend`,
   `apps/customer`, `apps/operations`. Rationale: matches the brief, no extra
   package-manager dependency, easy for future sessions.

2. **Stack pinned to stable, mainstream majors.** React 18 + Vite 5, Tailwind 3,
   Prisma 5 + SQLite, Socket.IO 4, Vitest 2, Playwright. Rationale: maximum
   documentation and reliability; avoid bleeding-edge churn.

3. **Fastify 5 (not 4).** The dependency audit flagged the Fastify-4 →
   `fast-uri` chain; Fastify 5.8.5 is patched and our usage is API-compatible.
   Result: runtime dependencies have 0 audit vulnerabilities.

4. **Disciplined ledger in the foundation.** Balances are derived from an
   append-only ledger; money is integer minor units; conservation is unit-tested
   (including rejecting a tampered seed). Rationale: correctness of money must
   precede any feature that depends on it; retrofitting is risky.

5. **`@simbank/shared` consumed as source.** `exports → ./src/index.ts`; Vite,
   tsx, and tsup transpile it. Rationale: no build-order coupling; one source of
   truth for types/brand/logic.

6. **No committed `.env`; cross-platform SQLite path.** A `prisma-cli.mjs`
   wrapper supplies a local `file:./dev.db` URL to the CLI; Prisma resolves
   relative SQLite paths against the schema directory for both CLI and client, so
   the path is unambiguous on Windows/WSL/macOS/Linux. Rationale: zero-secret,
   zero-config local setup that "just works".

7. **Testable server construction.** `buildServer()` has no side effects;
   Socket.IO and `listen` live only in the runtime entrypoint. `/health` never
   touches the DB. Rationale: fast, reliable tests and CI/e2e startup.

8. **`verify` = lint + typecheck + test + build; Playwright separate.** Keeps the
   gate fast and dependency-light; smoke runs in CI as its own job. Rationale:
   the gate should be runnable anywhere without browser downloads.

9. **Process framework as a first-class deliverable.** `CLAUDE.md` +
   `docs/PROJECT_STATE.md` + `docs/NEXT_SESSION.md` + `docs/process/*` drive the
   fresh-session handoff model; `TASK_BOARD.md` is the source of truth and GitHub
   Issues are a mirror only. Rationale: the experiment's core requirement.

10. **Controlled multi-agent roles defined, executed sequentially for v0.1.0.**
    `.claude/agents/` holds the roles; v0.1.0 is mostly risky-shared-area work so
    it was serialized. Rationale: avoid concurrent edits to schema/routing/CI.

## Consequences

- A clean, runnable, well-documented foundation; `npm run verify` passes.
- Future sessions can extend the schema, add auth/RBAC, and build features
  without re-architecting.
- Two follow-ups are explicitly tracked: a dependency-hardening pass for
  dev-tooling audit advisories (vite/vitest/esbuild), and frontend component
  tests once interactive logic lands.
- Some sandbox-only setup (Prisma engine mirror, Playwright executable-path hook)
  was needed in Claude Code Cloud; it does not affect normal machines or CI.

## Alternatives considered

- **Fastify 4** — rejected (audit chain). **pnpm/yarn** — rejected (extra
  dependency; brief specifies npm). **Storing balances as fields** — rejected
  (violates the money-integrity principle). **Committing `.env`** — rejected
  (secret-hygiene + the relative-path solution is cleaner). **Tailwind v4 / React
  19 / Vite 6** — deferred (favor maximally documented stable versions for now).

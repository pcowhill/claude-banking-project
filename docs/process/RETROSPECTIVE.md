# RETROSPECTIVE

Per-milestone reflection: what went well, what didn't, and what to change. Honest
and specific. Append a new section each milestone.

---

## v0.1.0 — Project Foundation — 2026-06-25

### What went well
- **Disciplined ledger from day one.** Building derived balances, integer minor
  units, and conservation tests into the foundation (rather than retrofitting)
  means the money model is correct before any feature relies on it. The "reject a
  tampered seed that conjures money" test is a strong guardrail.
- **Clean, testable backend split.** `buildServer()` with no side effects made
  API tests trivial (`app.inject()`), and keeping `/health` DB-free made CI/e2e
  startup reliable.
- **Cross-platform DB path solved properly.** Understanding that Prisma resolves
  relative SQLite paths against the schema dir (CLI *and* client) let `file:./dev.db`
  work everywhere with no committed `.env`.
- **The gate is real.** `npm run verify` actually passing, plus 3 Playwright
  smoke tests, gives an honest "it runs" signal.
- **Docs-first handoff.** The repo is self-explanatory for a fresh session, which
  is the whole point of the experiment.

### What was harder than expected
- **Prisma engine download through the egress proxy** failed (ECONNRESET). Cost
  some time to diagnose; resolved with a local engine mirror. This is sandbox
  friction, not a product issue, but worth remembering for future sessions in the
  same environment.
- **Playwright/browser version mismatch** in the sandbox required an opt-in
  executable-path hook.
- **Getting the money invariant right.** The first formulation wrongly treated a
  legitimate external payment as "missing money." Tightening the definition
  (transfers net to zero; credits must be bank-originated or transfer legs) made
  it both correct and meaningful.
- **Dependency audit.** A banking-themed repo showing "critical/high" looks bad;
  upgrading Fastify to 5 cleared all *runtime* findings, but dev-tool advisories
  (vite/vitest) remain and need major bumps — deliberately deferred and
  documented rather than rushed.

### What to change next time
- **Plan the sandbox setup early.** Verify Prisma/Playwright connectivity before
  building, so environment quirks surface up front.
- **Parallelize where safe.** v0.1.0 was serialized (mostly risky shared areas).
  From v0.2.0, independent UI surfaces can use the Frontend agents in parallel
  once the backend contracts are fixed.
- **Schedule a dependency-hardening pass.** Track the vite/vitest upgrades so the
  audit is clean before v1.0.0 (or sooner if prioritized).

### Process check
- Milestone scope respected: only v0.1.0 built; stopped at the gate; did not
  start v0.2.0.
- Truthful reporting: all skips/deferrals/advisories are documented, not hidden.
- Handoff docs complete and consistent.

### One-line summary
A solid, honest foundation with a correct money model and a self-explanatory
process framework; remaining work is feature-building and a future dependency
cleanup — both clearly tracked.

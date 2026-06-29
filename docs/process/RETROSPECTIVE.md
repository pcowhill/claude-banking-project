# RETROSPECTIVE

Per-milestone reflection: what went well, what didn't, and what to change. Honest
and specific. Append a new section each milestone.

---

## v1.0.0 — Polish, hardening, loans/CDs/interest, final retrospective — 2026-06-29

The final milestone, and the experiment's capstone.

### What went well
- **The two clean primitives from earlier milestones paid off hugely.** Loans, CDs,
  AND interest accrual were built with **no new money mechanics** — a CD/loan is just a
  new account whose balance the disciplined ledger already derives, opening/paying is a
  net-zero `transfer` pair (the v0.7.0 service), and interest is a bank-originated
  `interest` entry fired on clock advance (the v0.9.0 scheduler hook). The disciplined
  ledger + the simulation clock turned a "big feature" into a small, safe extension.
- **The reported date bug was fixed at the class, not the symptom.** Rather than patch
  the one bill-pay approve path, every money/business route was routed through
  `simulationNow()`, and the original v0.9.0 objection (same-instant ordering) was met
  head-on with a deterministic `id` tiebreak instead of an exception. A regression test
  reproduces the human's exact scenario across a 300-day jump.
- **Serialize-then-parallelize held up under the largest milestone yet.** The risky core
  (date fix → shared lending contract → schema → services + accrual → routes → seed) was
  built and tested green BEFORE any UI; only then were the two frontends + the security
  review + the test expansion run in parallel against a locked contract. Backend money
  invariants were asserted before a single page was written.
- **CSRF landed without a test bloodbath** because the double-submit token was gated on
  session-cookie presence — which also made it *semantically* correct (CSRF only
  protects authenticated actions) and kept the "unauthenticated → 401" contract intact.
- **The security review found real, cheap improvements** (constant-time compare, a
  symmetric accrual guard, accrual logging) and confirmed the two subtle new boundaries
  sound — exactly what a pre-gate read-only audit is for.

### What was harder than expected
- **Scope.** A single milestone carrying a major feature (loans/CDs/interest) + a
  security control (CSRF) + a correctness fix + a UI cleanup + first frontend tests + the
  capstone docs is a lot. It worked only because each piece reused an established pattern;
  a genuinely novel feature at this size would have wanted its own milestone.
- **Enforcing CSRF retroactively** meant teaching the whole test suite + both frontends
  to present a token. The shared `mutatingHeaders` test helper + per-app `lib/csrf.ts`
  kept it bounded, but it touched many files — a reminder that security controls are
  cheaper when designed in from the start (SEC-1 was tracked since v0.2.0).
- **Same sandbox friction** (Prisma engines, Playwright Chromium) — now a one-command
  ritual (`source penv.sh`), but it remains a per-session tax that doesn't exist on a
  normal machine or in CI.

### What I'd change
- **Bake CSRF + a single shared API-fetch wrapper in from v0.2.0.** Each customer client
  re-implements its own `jsonInit`; one wrapper would have made the CSRF retrofit a
  one-line change instead of eight.
- **Introduce frontend component tests earlier.** Deferring them to the final milestone
  meant the UIs rode on build + e2e for nine milestones; a small jsdom harness at v0.4.0
  would have caught display-logic regressions sooner.

### Capstone — across v0.1.0 → v1.0.0
- **The repo-as-source-of-truth, milestone-gated process delivered.** Ten feature
  milestones (+ three patch releases) each ended runnable, gate-green, security-reviewed,
  and handed off so a fresh session with zero chat history could continue — and did,
  every time. The `docs/process/` artifacts (task board, experiment log, feedback log,
  ADRs, retrospective, per-milestone reports) were as load-bearing as the code.
- **Money discipline was the best early decision.** Deciding at v0.1.0 that balances are
  DERIVED from an append-only ledger — never stored/edited — meant every later money
  feature (transfers, deposits, cards, disputes, fraud reversals, scheduled payments,
  and now loans/CDs/interest) was a constrained, testable, conserve-by-construction
  extension. The conservation invariant ("settled total only moves by a bank-originated
  entry") is asserted in tests across the whole arc.
- **Stopping at every gate for human review caught what tests couldn't** — the v0.2.0
  session-bleed, the v0.6.x ops sign-in regressions, and this milestone's date bug + stale
  placeholders all came from a human actually using the app. The discipline of saving
  feedback verbatim, interpreting it, and re-scoping honestly kept the project aligned.
- **Controlled multi-agent execution scaled the work** without losing the serialize-risky-
  areas rule: the planner/backend/frontend/testing/security/scribe split mapped cleanly
  onto "lock the contract, then fan out."
- **Honesty over green-washing.** Findings, TOCTOU, and dev-tooling advisories were
  tracked and dispositioned in the open rather than hidden; the one thing the project
  never did was claim to be production or bank-grade. It is, and remains, a transparent
  simulation.

---

## v0.3.0 — Public bank website and branding — 2026-06-25

### What went well
- **The reported bug was fixed at the cause, not the symptom.** Reproducing the
  reviewer's scenario surfaced not one but **two** root causes (shared host-only
  cookie + a logout that 400'd and never revoked). Fixing both — per-surface
  cookies and a working logout — makes the behavior match the user's mental model.
- **A browser-level test caught what unit tests missed.** The logout-400 defect was
  invisible to the backend tests (which called logout correctly) and to the v0.2.0
  e2e (which only checked the client UI). Driving both apps in one shared cookie jar
  and re-fetching a protected route after logout is what exposed it.
- **A reusable component kit kept the site consistent and the pages short.** One
  `marketing.tsx` module (hero, sections, feature grid, FAQ, rate table, CTA) made
  six pages quick to build and visually coherent.
- **Accessibility and the simulation framing were built in, not bolted on** — skip
  link, landmarks, labelled mobile menu, alt text, and the disclaimer on every page.

### What was harder than expected
- **The logout bug was sneaky.** The client swallows logout errors best-effort, so
  the UI *looked* logged out while the server session lived on — a classic masked
  failure. Lesson recorded: **test the server-side effect of logout**, not just the
  client state.
- **Same sandbox friction (Prisma engines, Playwright Chromium).** Now well-trodden:
  `--ignore-scripts` install + curl-mirror the engines (the remote gz names differ
  from the local filenames) + the executable-path hook. Documented again so the next
  session doesn't re-derive it.
- **A first-cut e2e race** (logout click then immediate navigation) initially looked
  like a fix failure; tightening the wait both fixed the race and revealed the real
  bug underneath it.

### What to change next time
- **When fixing a reported bug, reproduce it end-to-end first.** The per-surface
  cookie fix alone passed the backend tests but would *not* have fully satisfied the
  user; only the browser repro proved the logout half was still broken.
- **For v0.4.0 (dashboard + seed/schema):** lock the transaction DTO + read-API
  contract before parallelizing, and serialize the Prisma schema/seed change.

### Process check
- Milestone scope respected: only v0.3.0 built (with the approved bug fix folded in);
  stopped at the gate; did not start v0.4.0.
- Truthful reporting: the second root cause, the placeholder images, and the
  coming-soon pages are all documented honestly; no skips hidden.
- Handoff docs complete and consistent; tag `v0.3.0` created locally.

### One-line summary
A polished, accessible public site shipped on the existing brand — and the
reviewer's bug fixed at both root causes, with the masked logout failure turned into
gate-level regression coverage.

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

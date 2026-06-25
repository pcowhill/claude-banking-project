# QUALITY_BAR

The standard every milestone must clear before it is called complete. If the bar
cannot be met, file a blocker under `docs/process/blockers/` and stop honestly —
do not tag the milestone.

## Definition of done (every milestone)

- [ ] `npm run verify` passes (lint + typecheck + unit/integration tests + build).
- [ ] All three apps run locally (`npm run dev`) and `npm run db:reset` works.
- [ ] New logic has tests; existing tests still pass.
- [ ] Docs updated: `CHANGELOG.md`, `docs/PROJECT_STATE.md`,
      `docs/NEXT_SESSION.md`, the milestone report, the human-review doc, the
      next-session prompt, the task board, and the experiment log.
- [ ] The simulation disclaimer is visible in README and in both apps' UI.
- [ ] No secrets committed; `.env` stays git-ignored.
- [ ] Honest reporting of anything skipped, deferred, or failed.

## Engineering standards

- **TypeScript strict.** No `any` without justification; prefer precise types
  and union-from-`as const` over loose enums.
- **Money discipline.** Integer minor units only; balances derived from the
  ledger, never stored as editable fields; adjustments carry a reason + audit.
- **Pure logic is tested first.** Especially money/ledger and seed invariants.
- **Side-effect-free construction.** The server builds without listening so it
  is testable; modules avoid import-time side effects where practical.
- **Graceful degradation.** The UI renders even when the backend is offline.
- **Accessibility & responsiveness.** Semantic HTML, labelled controls,
  mobile-first layouts.
- **Consistent style.** ESLint + Prettier; match the surrounding code's idioms.

## Security & safety bar (grows with features)

- No real money, no real banking/SMS/email integrations, no external financial
  services. Never claim production/bank-grade.
- No custom cryptography. Real password hashing once auth exists (v0.2.0).
- Role-based access control once auth exists; customers see only their own
  accounts; joint users only authorized accounts.
- Sensitive/admin operations write audit logs.
- Validate inputs; never trust client-supplied amounts, ids, or ownership.

## Definition of "blocked"

A requirement is blocked when it has been genuinely attempted and still fails.
Then: write a blocker file (what failed, what was tried, remaining errors,
likely cause, options, recommendation, suggested next-session prompt), do **not**
mark the milestone complete, and stop with a truthful report.

## Current status (v0.1.0)

`npm run verify` passes; 20 unit/integration tests + 3 Playwright smoke tests
green; runtime dependencies report 0 npm audit vulnerabilities. Open items
(dev-tooling audit advisories; deferred component tests) are tracked in
`docs/process/QUALITY_REPORT.md`.

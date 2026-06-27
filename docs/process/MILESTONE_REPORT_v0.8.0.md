# Milestone Report — v0.8.0 (Cards, fraud, disputes)

> Local **SIMULATION** only. No real card networks, PANs, issuers, fraud
> providers, or money rails. Balances stay DERIVED from the append-only ledger.

## Summary

v0.8.0 adds three customer-facing capabilities, all built on existing
foundations (the v0.5.0 operations queue + action service + real-time, the
v0.7.0 ledger reversal + approval-has-a-ledger-effect path, and the v0.2.0/v0.4.0
access primitives):

1. **Cards** — a new `Card` lifecycle: issue a simulated debit/credit card,
   freeze/unfreeze, report lost/stolen (→ a replacement card), and travel
   notices. Card lifecycle **moves no money** (it never writes a ledger entry).
2. **Fraud** — a `fraud_alert` ops item the customer confirms/denies and an
   operator resolves: **confirm fraud** reverses the suspicious charge + freezes
   the linked card; **dismiss** treats it as legitimate.
3. **Disputes** — a customer disputes a posted transaction (it flips to
   `disputed`); an operator **upholds** (reverse → refund as a ledger status
   change) or **denies** (back to `posted`).

Plus the human's requested **R-03 "Reversed" tag**: a reversed money movement /
upheld dispute / confirmed fraud now shows a distinct **"Reversed"** tag
alongside the still-present **"Approved"** badge wherever the item is listed.

## Scope vs. plan

Delivered the planned v0.8.0 scope from `docs/NEXT_SESSION.md` in full, plus the
one optional UI request the human left to our judgement (accepted as **R-03** —
see `HUMAN_REVIEW_v0.8.0.md` and `feedback/FEEDBACK_v0.7.0_2026-06-27_0107.md`).
**No re-scope** otherwise; recurring/scheduled payments remain deferred to
**v0.9.0** (they need the simulation clock).

## What changed (by area)

### Shared (`@simbank/shared`)
- `cards.ts` — `CARD_TYPES`/`CARD_NETWORKS`/`CARD_STATUSES`/`TRAVEL_NOTICE_STATUSES`,
  DTOs, pure validators (`validateIssueCard`/`validateReportCard`/`validateTravelNotice`),
  status guards (`canFreezeCard`/`canUnfreezeCard`/`canReportCard`/`canAddTravelNotice`/
  `isTerminalCardStatus`), and display helpers (`maskedCardNumber`/`formatCardExpiry`/labels).
- `risk.ts` — fraud (`FRAUD_RESPONSES`, `FraudPayload`, `asFraudPayload`) + dispute
  (`DISPUTE_REASONS`, `DisputeRequest`, `DisputePayload`, `validateDispute`,
  `asDisputePayload`) contracts.
- `operations.ts` — `isRequestReversed(payload)` (drives R-03).

### Backend (the risky, serialized core)
- **Schema:** additive migration `cards` → `Card` (+ `replacesCardId` self-link) and
  `CardTravelNotice`; relations on `User`/`Account`. **No existing table altered.**
- `cards/cards.ts` — the lifecycle service (access-checked, audited, no ledger).
- `risk/disputes.ts` + `risk/fraud.ts` — create/respond + the operator-resolution
  helpers; both reuse the **generalized** `reverseLedgerEntries` core added to
  `money/movements.ts`.
- `ops/requests.ts` — new `dispute` + `fraud_alert` resolution branches in
  `applyOperatorAction` (atomic + audited).
- `routes/cards.ts`, `routes/risk.ts` (registered in `routes/index.ts`).
- `seed-plan.ts`/`seed-apply.ts` — seeded cards + linked fraud/dispute demos +
  `assertSeedCardIntegrity`.

### Frontends (parallelized after the API/payload/socket contract was locked)
- **Customer:** `lib/cards.ts` + `lib/risk.ts` clients; **`/wallet`** cards manager;
  Dashboard fraud-alert confirm/deny + a `/wallet` quick link; a **Dispute** affordance
  + "Disputed" badge in `TransactionList`.
- **Operations:** a `ReversedBadge` (R-03) on the queue cards, dashboard, and detail
  panel; fraud + dispute **context blocks** in `RequestDetailPanel` (reusing the
  existing action bar — no new endpoint).

## Quality gate

- `npm run verify` ✅ — lint (0 warnings) + typecheck + tests + build all green.
- **281** unit/integration tests (was 240; **+41**: 12 shared cards, 8 shared risk,
  5 seed-plan card, 16 cards/fraud/dispute backend integration).
- **41** Playwright e2e (was 37; **+4**: card freeze, customer dispute filing,
  operator confirm-fraud → Reversed tag, operator uphold-dispute → Reversed tag).
  One pre-existing v0.7.0 e2e assertion was scoped to its specific card to stay
  deterministic now that the R-03 "Reversed" tag exists.
- Runtime `npm audit` unchanged (0 runtime advisories; dev-tooling advisories still
  tracked in `QUALITY_REPORT.md`).
- Security review: see `HUMAN_REVIEW_v0.8.0.md` (verdict recorded there).

## Money discipline (enforced + tested)

- Card lifecycle writes **no** `LedgerEntry` (a test asserts the ledger count is
  unchanged across issue/freeze/report/travel).
- A dispute uphold and a confirmed fraud flip the entry to `reversed` via the ledger;
  a denied dispute returns it to `posted`; **no balance is stored or edited**.
- Reversals keep a **reason + audit** row. Balances stay derived; tests assert the
  settled total moves by exactly the reversed amount.

## Git / tag

- Developed on the session branch `claude/keen-einstein-rxfkq0`.
- Version bumped to **0.8.0** across all workspaces + `version.ts`.
- An annotated tag **`v0.8.0`** is created on the milestone commit **locally**.
  **Pushing tags is blocked by this environment's git policy (HTTP 403)**, so the
  human (re)creates/pushes the tag on merge to `main`:
  ```
  git tag -a v0.8.0 -m "v0.8.0 — Cards, fraud, disputes"
  git push origin v0.8.0
  ```

## Sandbox notes (Claude Code Cloud only)

- Prisma engine download is blocked through the egress proxy; resolved the
  documented way — `npm install --ignore-scripts`, curl-mirror the query-engine
  library + schema-engine for `debian-openssl-3.0.x` (engine
  `605197351a3c8bdd595af2d2a9bc3025bca48ea2`), point Prisma at them via
  `PRISMA_QUERY_ENGINE_LIBRARY` + `PRISMA_SCHEMA_ENGINE_BINARY`
  (+ `PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING`). The new **`cards`** migration was
  created through the mirrored schema engine.
- Playwright used the pre-installed Chromium via `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium`.
- **None of this affects normal machines or CI** — standard installs work.

# MILESTONE REPORT — v0.7.0 (Money movement)

The first milestone where an operator approval **MOVES money** — always through the
disciplined, append-only ledger, never by editing a balance. Local SIMULATION
throughout: no real money, payment networks, ACH/wire rails, billers, or providers.

## Scope (approved by human feedback)

The v0.6.2 review (`feedback/FEEDBACK_v0.6.2_2026-06-26_2025.md`) approved proceeding
to v0.7.0 ("The fixes look good to me! We should be good to move onto v0.7.0."). No
re-scope, with **one transparent deferral** (recurring/scheduled payments → v0.9.0,
see below).

| Item | Summary | Result |
| --- | --- | --- |
| **M-01** | Shared money-movement contract (kinds, `MovementPayload`, pure validators) + `bill_pay` ops type | **Done** — `packages/shared/src/money-movement.ts`; 16 unit tests; contract locked before UI |
| **M-02** | Money-movement service: transfer (both legs), external (pending), post/fail/reverse | **Done** — `apps/backend/src/money/movements.ts` |
| **M-03** | Routes + approval→post / reject→fail branches + real-time + ops reverse | **Done** — `routes/money.ts`, `applyOperatorAction` branches, `POST /api/ops/movements/:id/reverse` |
| **M-04** | Seed: link the pending mobile-check deposit (Q-01) + ACH/bill-pay demos; movement invariant | **Done** — approving the seeded deposit posts it |
| **M-05** | Customer money-movement UI (`/move-money`, tabbed) | **Done** — wired from dashboard + account detail |
| **M-06** | Operator money-movement context + reverse affordance | **Done** — in `RequestDetailPanel` |
| **M-07** | Tests (unit/integration + e2e) + verify | **Done** — 240 Vitest, 37 e2e, gate green |
| **M-08** | Security review + handoff docs + tag | **Done** — review PASS-with-findings; this report + docs; version 0.7.0; tag `v0.7.0` |
| **M-09** | Recurring/scheduled payments | **Deferred to v0.9.0** (needs the simulation clock) |

## Design (how money moves, within discipline)

A "transaction" is a row of the append-only `LedgerEntry`; **balances are DERIVED**.
v0.7.0 adds two customer entry points and reuses the v0.5.0 ops queue + the v0.6.0
"approval has a ledger effect" path:

- **Internal transfer (immediate)** — `POST /api/transfers` posts a `transfer`
  **debit** on the source and a `transfer` **credit** on the destination, same amount
  and instant, inside one transaction, so the pair **nets to zero**. Validated for
  non-viewer access to BOTH accounts + sufficient available funds.
- **Reviewable external movement** — `POST /api/movements` writes ONE **pending**
  ledger entry (a bank-originated `deposit` credit for inbound money; a `payment`
  debit for outbound) + a linked `OperationsRequest` (type `deposit`/`ach`/`wire`/
  `bill_pay`) whose `payload` carries the movement context and the `ledgerEntryIds`.
  A pending debit reserves available immediately (a hold); nothing settles yet.
- **Operator approval posts it** — `applyOperatorAction` gained money-movement
  branches mirroring onboarding: **approve** flips the linked pending entries to
  `posted` (atomic, audited); **reject** flips them to `failed` (releasing the hold);
  **hold/request-info** leave them pending.
- **Reversal** — `POST /api/ops/movements/:requestId/reverse` (ops/admin) flips a
  posted movement's entries to `reversed` (removing the balance effect) and
  **requires a reason** (audited), mirroring the admin-adjustment rule.

**No Prisma migration** was needed: the ledger already carried `status`
(`pending`/`posted`/`failed`/`reversed`), `origin` (`transfer`/`deposit`/`payment`),
and `reason`, and the movement context rides on the existing
`OperationsRequest.payload` JSON. This kept the riskiest shared area (schema) untouched.

## Money invariants (enforced + tested)

- A **transfer nets to zero** — the system-wide settled total is unchanged by a
  transfer (`money.test.ts`).
- External value **enters only** via a bank-originated, posted `deposit` credit and
  **leaves only** via a posted `payment` debit; the settled total moves by exactly the
  posted amount on approval, and back on reversal.
- Failures and reversals are **ledger status changes** (`failed`/`reversed`), never
  balance edits; balances stay derived.
- A customer can only move money on accounts they hold (owner/joint/authorized — not
  viewer), enforced server-side on both legs (RBAC test: a joint user can't pull from
  an account they don't hold).
- The movement payload's `ledgerEntryIds` are **server-set** (from the entry the
  server just created); the customer routes don't accept them, so an operator action
  can't be steered onto an unrelated account's entry.

## Q-01 closed (carried from the v0.5.0 review)

The seeded "Mobile check deposit" pending entry is now **linked** to its
`deposit-mobilecheck` review item (via `ledgerEntryIds` threaded through the seed at
apply time). Approving it flips the customer's transaction line from **Pending →
Posted** and updates the available balance — within ledger discipline (bank-originated,
audited; no stored/edited balance). Asserted in `money.test.ts` and exercised in the
operator e2e.

## What changed (code)

- **`packages/shared`:** new `money-movement.ts` (kinds, direction/origin mapping,
  bounds, `MovementPayload` + `asMovementPayload`, `validateTransfer` /
  `validateExternalMovement`, `movementOpsType`); `bill_pay` added to
  `OPS_REQUEST_TYPES` (+ label + the `money` queue lane); barrel export.
- **`apps/backend`:** `money/movements.ts` (the service); money-movement branches in
  `ops/requests.ts` `applyOperatorAction`; `routes/money.ts` (`/api/transfers`,
  `/api/movements`) + the reverse route in `routes/ops.ts`; registered in
  `routes/index.ts`; `seed-plan.ts` / `seed-apply.ts` link the pending deposit/ACH/
  bill-pay entries to their review items + a new `assertSeedMovementIntegrity`.
- **`apps/customer`:** `lib/money.ts` client; `pages/MoveMoney.tsx` (the tabbed page);
  route + dashboard quick-links + account-detail entry points.
- **`apps/operations`:** `RequestDetailPanel` money-movement context + reverse
  affordance; `opsApi.reverseMovement` + the data-context `reverse`.
- **Version:** `version.ts` → `0.7.0` / `v0.7.0` / "Money movement"; all five
  `package.json` versions → `0.7.0`.

## Verification

- **`npm run verify` ✅** — lint (0 errors / **0 warnings**) + typecheck (×4
  workspaces) + **240** Vitest unit/integration (was 201; **+39**) + build (backend
  tsup + customer/operations vite).
  - `@simbank/shared` `money-movement.test.ts` (**16**), `@simbank/backend`
    `routes/money.test.ts` (**18**), `seed-plan.test.ts` (**+5**).
- **`npm run test:e2e` ✅ — 37 passed** in **real Chromium** (was 33; **+4**) in
  `e2e/money-movement.spec.ts`: a customer transfer; a customer mobile-check deposit
  queued for review; the dashboard quick links → /move-money; and an operator seeing
  the movement context, **approving (posting) then reversing** the seeded deposit. The
  existing v0.3.0 isolation, v0.4.0 dashboard, v0.5.0 ops, v0.6.x e2e stay green
  (the dashboard "pending deposit" assertion was updated for the cleaner seed
  description).
- **Runtime `npm audit --omit=dev` = 0 vulnerabilities.** No new runtime deps.

## Security review (pre-gate, read-only) — ✅ PASS-with-findings

The Security/Permissions reviewer audited the full money-movement surface. **Verdict:
PASS-with-findings — none blocking.** Confirmed correct: RBAC/IDOR on both customer
routes + the ops-only reverse; **payload-trust** (the client cannot inject
`ledgerEntryIds`; approve/reject/reverse act only on server-recorded entries); money
discipline (no stored balance; transfers net to zero; status-only failures/reversals;
reversal reason+audit); server-side validation + amount bounds; simulation safety; no
secrets; no regression to v0.2.0 auth / v0.3.0 isolation / v0.5.0 socket RBAC / v0.6.0
guarantees. Findings (all Low/tracked):

| ID | Item | Disposition | Target |
| --- | --- | --- | --- |
| F-1 (SEC-1) | CSRF: SameSite=Lax + CORS allowlist mitigate the new state-mutating POSTs (cross-site `fetch` omits the cookie; a cross-site form can't send `application/json`) | Accepted for the local simulation; **does not block** | CSRF token / SameSite=Strict at v1.0.0 hardening |
| F-2 | Check-then-act (TOCTOU) on the available-funds gate (read outside the write transaction); not a money-integrity break (balances derived; worst case a transient, auditable negative; SQLite serializes writers; single-user sim) | Accepted and tracked | v0.8.0+ ledger hardening |
| F-3 | Reversal doesn't re-assert net-zero for a (future) multi-leg movement; today each links exactly one entry | Accepted (add a guard when multi-leg movements arrive) | future |

## Deferred (transparently) — recurring/scheduled payments → v0.9.0

The v0.7.0 list included "recurring/scheduled payments." These require the
**simulation clock + scheduled-event processing** already roadmapped at **v0.9.0**;
building a scheduler now, with nothing to fire it, would be a non-functional stub.
Deferred and carried forward (`M-09`); recorded in `ROADMAP_HISTORY.md` and raised in
the human review so the human can pull it earlier if desired. Everything else in money
movement (one-off transfers / ACH / wire / mobile-check deposit / bill pay, with
approvals, failures, reversals, holds) is delivered.

## Git / tag

- Branch (Claude Code Cloud session branch): `claude/sweet-newton-44widz`. Intended
  name: `milestone/v0.7.0-money-movement`. It was cut from `main` and **already
  contained** v0.6.0 + v0.6.1 + v0.6.2 (verified via `git log`), so no fast-forward
  was needed this session.
- Annotated tag **`v0.7.0`** created locally on the milestone commit. As in prior
  sessions, **pushing tags is blocked by this environment's git policy (HTTP 403)**,
  so the human (re)creates/pushes the tag on merge to `main`:
  ```bash
  git tag -a v0.7.0 -m "v0.7.0 — Money movement"
  git push origin v0.7.0
  ```
- **No pull request opened** (per the constitution — only on explicit request).
- **No v0.6.2 tag is present in-repo** (the prior session's tag was local-only and
  never pushed; the human confirmed they had not tagged v0.6.2). Corrected the
  "v0.6.2 tagged" wording in the state/board docs.

## Sandbox note (Claude Code Cloud only)

Same Prisma engine-download block as Sessions 1–8 (ECONNRESET to `binaries.prisma.sh`
from Prisma's fetcher; curl reaches it). Resolved the documented way — `npm install
--ignore-scripts`, curl-mirror the query-engine library + schema-engine for
`debian-openssl-3.0.x`, point Prisma at them via `PRISMA_QUERY_ENGINE_LIBRARY` +
`PRISMA_SCHEMA_ENGINE_BINARY` (+ `PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING`). Prisma
5.22.0, engine `605197351a3c8bdd595af2d2a9bc3025bca48ea2`. **No migration this
milestone.** Playwright used the pre-installed Chromium via `PLAYWRIGHT_CHROMIUM_PATH`
(`/opt/pw-browsers/chromium` → the 1194 build). None of this affects normal machines
or CI.

## Stop point

Stopped at the milestone gate. **Did not start v0.8.0.** Awaiting the human's review of
v0.7.0 before Cards/fraud/disputes proceeds (and a decision on whether to pull
recurring/scheduled payments forward from v0.9.0).

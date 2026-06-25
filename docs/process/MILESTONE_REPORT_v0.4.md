# MILESTONE REPORT — v0.4.0 (Customer banking dashboard)

- **Date:** 2026-06-25
- **Status:** ✅ Complete (gate green; tagged `v0.4.0`)
- **Branch:** `claude/dreamy-allen-p2zd8w` (session/milestone branch; intended
  name `milestone/v0.4-dashboard`)
- **Session:** 4 of the experiment

## Objective

Build the customer banking dashboard over the (still fully simulated) data:
accounts overview, checking/savings detail, transaction history with pending vs
posted, basic search/filter, a statements/documents placeholder, and realistic
seeded transaction data. Keep balances **DERIVED** from the append-only ledger
(never stored), keep `npm run verify` green, keep the simulation disclaimer
visible, and do not regress the v0.2.0 auth/protected dashboard or the v0.3.0
public site. Also: address the human's v0.3.0 review feedback — two public-site UX
fixes (`R-01` scroll-to-top + a Security deep-link; `R-02` session-aware entry
points) — folded in first.

## Delivered

| Area | Delivered |
| --- | --- |
| R-01 (review follow-up) | Router-level `ScrollToTop`: every navigation lands at the top; a `#hash` (e.g. "Security" → `/about#security`) scrolls that section in, with `scroll-mt` under the sticky header |
| R-02 (review follow-up) | Session-aware CTAs (`resolveCtas`): "Log in"/"Open an account" → a single **"Visit your Dashboard"** when signed in (hero, footer, CTA band); `/login` shows an **"already signed in"** panel (dashboard link + log-out) |
| Shared contract (D-01) | `@simbank/shared/transactions`: `TransactionDTO`, `AccountTransactionsResponse`, `TransactionQuery`, and pure helpers (`toTransactionDTOs`, `filterTransactions`, `groupForStatus`, `originLabel`, `signedMinor`) |
| Seed (D-02) | ~3 months of dated history on Avery's checking & savings (payroll, rent, groceries, utilities, subscriptions, card spend, ATM, a fee, a refund, transfers both ways, interest) + current **pending**/**held** items; 7 → **56** entries; **no schema change** |
| Endpoint (D-03) | `GET /api/accounts/:id/transactions` — account header + derived transactions (newest-first, signed amounts, running balance), scoped by the SAME rules as `/api/accounts/:id`, with server-side `?q=&group=&origin=` filter/search |
| Overview (D-04) | `/dashboard` reworked: combined total, per-account cards (derived available + current) linking into detail; sign-in activity retained |
| Detail (D-05) | `/accounts/:id` (protected): account header + balances (available/current, pending out, on hold, pending in) + transactions; 403/404/offline states |
| Transactions (D-06) | `TransactionList`: **pending vs posted** groups, per-row **running balance**, status/category badges, instant **search** + **status/category filter** (shared helper) |
| Statements (D-07) | `/statements` (protected) placeholder — clearly "coming soon" (v0.9.0), no real PDFs; linked from dashboard + detail |
| Versioning | Platform bumped to `0.4.0` (shared meta + 5 `package.json` + lockfile; About roadmap status) |
| Tests | 70 → **93** Vitest unit/integration; 14 → **22** Playwright e2e |

## Acceptance criteria check

| Criterion (from ROADMAP / NEXT_SESSION) | Status |
| --- | --- |
| Accounts overview | ✅ combined total + per-account cards → detail |
| Checking/savings detail (ledger-derived balances) | ✅ `/accounts/:id`, balances derived server-side |
| Transaction history with pending vs posted | ✅ grouped, badged, running balance on posted |
| Basic search/filter | ✅ description search + status/category filter (client + server) |
| Statements/documents placeholder | ✅ `/statements`, clearly not-yet-available |
| Realistic seeded transaction data | ✅ 56 dated entries; invariants enforced |
| Balances DERIVED (never stored) | ✅ no stored balance column; derived in shared logic |
| Simulation disclaimer visible | ✅ banner + footer + per-page notes |
| No regression of v0.2.0 auth / v0.3.0 site | ✅ all prior unit + e2e green |
| v0.3.0 review feedback (R-01, R-02) addressed | ✅ both, with e2e |
| `npm run verify` passes; tag `v0.4.0` | ✅ (tag push blocked by env policy — see below) |
| Stop after v0.4.0; do not start v0.5.0 | ✅ |

## Key design decision — no schema migration

A "transaction" in Meridian **is** a row of the append-only `LedgerEntry` table,
which already carries `status` (pending/posted/held/…), `origin`, `amountMinor` +
`direction`, `description`, and `postedAt`/`createdAt`. So v0.4.0 needed **no
Prisma migration**: the work was (1) a pure shared contract + derivation, (2) a
richer seed (with per-entry dating), (3) one access-scoped read endpoint, and (4)
the dashboard UI. This kept the milestone out of the riskiest shared area
(schema) entirely while still delivering real transaction history. Balances and
the running balance are computed server-side from the ledger; nothing is stored.

## Verification evidence

- `npm run verify` → lint ✓ (0 warnings), typecheck ✓ (4 workspaces), test ✓
  (**93/93**), build ✓ (3 apps).
- `npm run test:e2e` → **22/22** passed (Chromium): the new `dashboard.spec.ts`
  (overview → detail → transactions, pending/posted visible, search + status
  filter, statements placeholder, R-01 scroll-to-top + `/about#security`, R-02
  logged-in CTAs + already-logged-in `/login`) plus all prior auth/public-site/
  session-isolation/smoke specs.
- Live check via the access helper against the seeded DB: checking current
  $10,596.36 / available $10,515.61 (− $5.75 pending debit − $75.00 hold; the
  $320.00 pending credit correctly excluded from available); running balances
  accumulate statement-style; `?q=Simmons` → 7 rows; `?group=pending` → 3 rows.
- Screenshots of the overview, account detail, pending filter, statements, and the
  already-logged-in `/login` reviewed.

## Security review

Ran the read-only Security/Permissions reviewer before the gate. **Verdict: PASS**
— no new findings at Medium or above. Verified: the new endpoint reuses the exact
v0.2.0 access primitive (`getAccountRelationship`) so it is IDOR-safe (unknown id →
404, no-relationship → 403, ops/admin → 403 on customer accounts); the DTO exposes
only display fields (no hashes/PII/cross-account data); `?q=&group=&origin=` are
whitelisted (unknown values dropped) and filtering is in-memory over already-
authorized rows with no raw SQL / dynamic `RegExp` (no injection/ReDoS); seed
passwords stay non-secret + bcrypt-hashed and the money invariants hold; the R-02
flows add no client-side trust for protection (RequireAuth + server `requireAuth`
unchanged), no open redirect, and logout still revokes server-side. Pre-existing
follow-ups (CSRF, config-driven cookie `secure`, helmet + rate-limit, dev-tooling
advisories) remain tracked in `QUALITY_REPORT.md`.

## Execution notes

The risky shared area this milestone was the **API contract + the data every
screen reads** (no schema change). It was serialized: the shared DTOs/derivation
(`D-01`) were written and unit-tested first to lock the contract, then the seed
(`D-02`) and the access-scoped endpoint (`D-03`) with their integration tests,
and only then the dashboard UI (`D-04…D-07`) built against the locked contract.
The two review follow-ups (`R-01` touches routing) were done first and e2e-tested.
A security read-through ran before the gate.

## Git: branch, tag, and merge (manual steps for the human)

Built and pushed on the Claude Code Cloud session branch
`claude/dreamy-allen-p2zd8w` (intended name `milestone/v0.4-dashboard`). No PR
opened (none requested). The annotated tag `v0.4.0` is created locally on the
milestone commit, but **pushing tags is blocked by this environment's git egress
policy (HTTP 403)** — only the session branch is pushable here. To adopt the
milestone, after reviewing the branch run locally:

```bash
git fetch origin
git checkout main
git merge --no-ff origin/claude/dreamy-allen-p2zd8w
git tag -a v0.4.0 -m "v0.4.0 — Customer banking dashboard"
git push origin main
git push origin v0.4.0
```

## Deviations / honest caveats

- **Tag push** blocked by environment policy (above) — local tag exists; human
  pushes it on merge.
- **Statements** are a labelled placeholder (no real PDFs) until v0.9.0 statement
  cycles; **transfers/money-movement** that would create new transactions arrive in
  v0.7.0 — today's transactions are all seeded.
- **Search/filter runs client-side** in the UI over the account's already-fetched
  rows (snappy, no refetch) using the same shared `filterTransactions` the **server**
  endpoint uses for `?q=&group=&origin=` (which is independently tested).
- **Frontend component unit tests remain deferred** — the dashboard is covered by
  the build + Playwright journeys (consistent with prior milestones); tracked in
  `QUALITY_REPORT.md`.
- **Sandbox-only setup:** same Prisma engine mirror (engines fetched via curl, paths
  via `PRISMA_*` env) and Playwright executable-path hook as Sessions 1–3; neither
  affects normal machines or CI.

## Blockers

None.

## Handoff

- Review guide: `docs/process/HUMAN_REVIEW_v0.4.md`.
- Next-session prompt: `docs/process/NEXT_SESSION_PROMPT_v0.4.md`.
- Next milestone: **v0.5.0 — Operations simulator core** (not started).

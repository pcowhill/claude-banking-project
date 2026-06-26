# NEXT_SESSION

> Read this third (after `CLAUDE.md` and `docs/PROJECT_STATE.md`). It tells the
> next session exactly what to do.

## Where we are

`v0.7.0 — Money movement` is **complete** and tagged (annotated tag created locally;
the human pushes it on merge to `main` — tag push is blocked in this environment).
It is the first milestone where an operator approval **MOVES money**, always via the
append-only ledger:

- **Internal transfers** (`POST /api/transfers`) post BOTH legs and net to zero.
- **Reviewable external movements** (`POST /api/movements` — mobile check deposit,
  external ACH, wire, bill pay) write a **pending** ledger entry + a linked ops-queue
  item; an operator **approve** posts it (pending→posted), **reject** fails it
  (pending→failed, releasing reserved funds), **hold/request-info** leave it pending.
- **Reversal** (`POST /api/ops/movements/:id/reverse`, ops/admin, reason required)
  flips a posted entry to `reversed`.
- Customer **/move-money** UI (tabbed) + operator money-movement context + reverse
  affordance. **Carried Q-01 closed:** approving the seeded mobile-check deposit flips
  the customer's line Pending→Posted and updates available.
- **No Prisma migration** was needed. Gate: **240** unit/integration + **37** e2e
  green; security review **PASS-with-findings** (all Low/tracked).

The earlier patches (v0.6.1 B-03/B-04, v0.6.2 B-06) and v0.6.0 onboarding are all
intact. **One scope item was deferred:** **recurring/scheduled payments** moved to
**v0.9.0** (they need the simulation clock; see `HUMAN_REVIEW_v0.7.0.md`). The next
planned milestone is **`v0.8.0 — Cards, fraud, disputes`**.

## Session-start protocol (must do, in order)

1. Read `CLAUDE.md`, then `docs/PROJECT_STATE.md`, then this file.
2. **Save the human's pasted feedback VERBATIM** to
   `docs/process/feedback/FEEDBACK_v0.7.0_<YYYY-MM-DD_HHMM>.md` BEFORE acting on it.
   Use the structure in `docs/process/HUMAN_FEEDBACK_LOG.md`. The raw block is never
   edited afterward.
   - If the feedback is only "continue" (or similar), still save it verbatim and
     treat it as approval to proceed with v0.8.0.
3. Interpret the feedback in that file (accepted / deferred / rejected with reasons /
   questions carried forward); update `docs/process/HUMAN_FEEDBACK_LOG.md`.
4. Update `docs/process/TASK_BOARD.md` (source of truth), and the roadmap/process
   logs if the feedback changes scope. **If the human asks to pull recurring/scheduled
   payments forward, fold it into this session** (it pairs with the simulation clock,
   so consider whether to bring a minimal clock forward or keep execution manual).
5. Do **only** v0.8.0 (or the re-scoped milestone the feedback approves).
6. Stop at the next gate and produce the milestone handoff docs.

## Planned scope for v0.8.0 — Cards, fraud, disputes

Acceptance targets (refine from feedback before building):

- **Cards:** issue a (simulated) debit/credit card for an account; **freeze/unfreeze**;
  **lost/stolen** flow (replace → new card number, old one frozen); **travel notices**.
  Card activity already exists as a `card`-origin ledger entry — build the card
  **lifecycle** on top.
- **Fraud:** suspicious-transaction **alerts** feeding the v0.5.0 operations queue
  (reuse the queue + action service + real-time channel); a customer can confirm/deny;
  an operator can act. The seed already has a `fraud_alert` item to build on.
- **Disputes:** a customer **disputes** a posted transaction → a `dispute` ops item;
  the operator can resolve it, which may **reverse** the disputed entry (reuse the
  v0.7.0 reversal: posted→`reversed`, reason+audit) or mark it `disputed`. The ledger
  already supports the `disputed` status (treated as posted, flagged) — wire it.
- **Money discipline unchanged:** any money effect (a fraud reversal, a dispute credit)
  goes through the **ledger** (status change or a bank-originated entry), never a
  balance edit; reversals keep the reason + audit.

### Suggested first steps

1. Plan tasks with the Milestone Planner role; record them in `TASK_BOARD.md`.
2. Decide the schema delta early (a `Card` model is likely the one **risky migration**
   this milestone — serialize it). Fraud/dispute may need only new ops request
   subtypes + payload (no migration), like v0.7.0.
3. Reuse, don't reinvent: the **operations queue + action service + audit + real-time**
   (v0.5.0); the **approval→ledger** + **reversal** paths (v0.6.0 / v0.7.0); the
   **disciplined ledger** (`disputed`/`reversed` statuses already exist); the **access
   primitives** + `requireRole`. Lock the API + any socket-event additions before
   parallelizing the two frontends.

## Guardrails
- Serialize risky shared areas (schema, auth, routing, real-time, **ledger**, CI,
  architecture).
- No secrets committed; `.env` stays ignored.
- Maintain the simulation disclaimer in README and both apps.
- Money moves ONLY via explicit ledger entries (never a stored/edited balance);
  transfers net to zero; value enters/leaves only via bank-originated events; admin
  adjustments + reversals require a reason + audit. Balances stay DERIVED.
- Truthful state: if blocked, file a blocker under `docs/process/blockers/` and stop —
  do not tag the milestone.

## Open follow-ups to consider (tracked, non-blocking)
- **Recurring/scheduled payments** — deferred to v0.9.0 (needs the sim clock).
- **SEC-1 (CSRF token / SameSite=Strict)** — accepted for the local sim
  (SameSite=Lax + CORS mitigate it); targeted at the v1.0.0 hardening pass.
- **TOCTOU on the money funds-check** (v0.7.0 review F-2) — Low; fold into a v0.8.0+
  ledger-hardening pass (move the available check inside the write path).
- Dev-tooling npm-audit advisories (vite/vitest/esbuild) — v1.0.0 hardening.

## Sandbox note (Claude Code Cloud only)
Prisma's engine download and the Playwright Chromium build may not match through the
egress proxy. Mirror the Prisma engine binaries via curl + `PRISMA_*` env vars
(query-engine library + schema-engine for `debian-openssl-3.0.x`), and point
Playwright at the pre-installed Chromium via `PLAYWRIGHT_CHROMIUM_PATH` — see
`docs/process/EXPERIMENT_LOG.md` (Sessions 1–9). v0.7.0 needed **no** migration; if
v0.8.0 adds a `Card` model it will need the mirrored schema engine for the migration.
None of this affects normal machines or CI.

## The copy/paste starter prompt
A ready-to-use prompt for a brand-new Claude Code Cloud session lives at
`docs/process/NEXT_SESSION_PROMPT_v0.7.0.md` (it includes the feedback placeholder).

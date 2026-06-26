# Next-session starter prompt (paste into a fresh Claude Code Cloud session)

> This is the ready-to-use prompt to begin the **v0.8.0 — Cards, fraud, disputes**
> session after the human has reviewed **v0.7.0 — Money movement**. Replace the
> feedback block at the bottom with the human's pasted review (or "continue").

---

You are continuing the Meridian simulated-banking experiment (a local-only
SIMULATION — never real money or real banking integrations). The repo is the source
of truth, not chat history.

Current state: **v0.7.0 — Money movement is COMPLETE and tagged** (annotated tag
created locally; the human pushes it on merge to `main` — tag push is blocked in this
environment). v0.7.0 is the first milestone where an operator approval MOVES money,
always via the append-only ledger (balances stay DERIVED; no balance is ever edited):

- **Internal transfers** (`POST /api/transfers`) post BOTH legs and net to zero.
- **Reviewable external movements** (`POST /api/movements` — mobile check deposit,
  external ACH, wire, bill pay) write a **pending** ledger entry + a linked ops-queue
  item; an operator **approve** posts it (pending→posted), **reject** fails it
  (pending→failed, releasing reserved funds), **hold/request-info** leave it pending.
- **Reversal** (`POST /api/ops/movements/:id/reverse`, ops/admin, reason required)
  flips a posted entry to `reversed`.
- Customer **/move-money** UI (tabbed: Transfer / Deposit a check / Send money / Pay a
  bill) + operator money-movement context + reverse affordance. **No Prisma migration**
  was needed (the ledger + `OperationsRequest.payload` already sufficed).
- **Carried Q-01 closed:** approving the seeded mobile-check deposit flips the
  customer's line Pending→Posted and updates available.
- Gate: **240** unit/integration + **37** e2e green; runtime audit clean; security
  review PASS-with-findings (all Low/tracked). The v0.6.0 onboarding and the
  v0.6.1/v0.6.2 ops-console fixes are all intact.
- **Deferred transparently:** recurring/scheduled payments → **v0.9.0** (they need the
  simulation clock). The human may ask to pull them forward.

Do these steps in order:

1. Read `CLAUDE.md`, then `docs/PROJECT_STATE.md`, then `docs/NEXT_SESSION.md`.
2. Save my feedback below VERBATIM to
   `docs/process/feedback/FEEDBACK_v0.7.0_<YYYY-MM-DD_HHMM>.md` before acting on it,
   following `docs/process/HUMAN_FEEDBACK_LOG.md`. Never edit the raw feedback block
   afterward. If my feedback is only "continue", still save it verbatim and treat it as
   approval to proceed with v0.8.0.
3. Interpret my feedback in that file (accepted / deferred / rejected with reasons /
   questions carried forward) and update `docs/process/HUMAN_FEEDBACK_LOG.md`.
4. Update `docs/process/TASK_BOARD.md` (the source of truth) and the roadmap/process
   logs if my feedback changes scope. **If I ask to pull recurring/scheduled payments
   forward, fold it into this session** (consider a minimal simulation clock).
5. Then implement ONLY the next approved milestone (v0.8.0 unless my feedback
   re-scopes it): **Cards, fraud, disputes** —
   - **Cards:** issue a simulated debit/credit card for an account; freeze/unfreeze;
     lost/stolen → replace; travel notices. (Card spend already exists as `card`-origin
     ledger entries; build the lifecycle on top.)
   - **Fraud:** suspicious-transaction alerts feeding the v0.5.0 operations queue
     (reuse the queue + action service + real-time); customer confirm/deny; operator
     acts. (The seed already has a `fraud_alert` item.)
   - **Disputes:** a customer disputes a posted transaction → a `dispute` ops item; the
     operator resolves it, which may **reverse** the disputed entry (reuse the v0.7.0
     reversal) or mark it `disputed` (the ledger status already exists).
   - Keep money discipline: any money effect goes through the **ledger** (status change
     or a bank-originated entry), never a balance edit; reversals keep a reason + audit.
   - A `Card` model is likely the **one risky migration** — serialize the schema change
     and review it; lock the API + any socket-event additions before parallelizing the
     two frontends.
6. Stop at the next milestone gate and produce the handoff docs (milestone report,
   human review, next-session prompt, updated PROJECT_STATE / NEXT_SESSION / TASK_BOARD
   / EXPERIMENT_LOG / CHANGELOG / QUALITY_REPORT / ROADMAP_HISTORY if the roadmap
   changed) and an annotated tag `v0.8.0`. Do NOT start v0.9.0.

Guardrails: serialize risky shared areas (schema, auth, routing, real-time, ledger,
CI, architecture); no secrets committed; keep the simulation disclaimer visible; money
only moves via explicit ledger entries (never a stored/edited balance); transfers net
to zero; value enters/leaves only via bank-originated events; admin adjustments +
reversals require a reason + audit; if something is genuinely blocked, file a blocker
under `docs/process/blockers/` and stop honestly instead of tagging the milestone. Do
not regress v0.2.0 auth, the v0.3.0 public site + the two apps' separate sign-ins, the
v0.4.0 dashboard, the v0.5.0 ops console, v0.6.0 onboarding (incl. the v0.6.1/v0.6.2
fixes), or v0.7.0 money movement.

Sandbox note (Claude Code Cloud only): Prisma's engine download and the Playwright
Chromium build may not match through the egress proxy. If so, mirror the Prisma engine
binaries via curl and set the PRISMA_* env vars (query-engine library + schema-engine
for debian-openssl-3.0.x), and point Playwright at the pre-installed Chromium via
PLAYWRIGHT_CHROMIUM_PATH — exactly as documented in `docs/process/EXPERIMENT_LOG.md`
(Sessions 1–9). v0.8.0 will likely need a Prisma migration (the `Card` model) through
the mirrored schema engine. None of this affects normal machines or CI.

Branch note: develop on the branch this session provides, commit with clear messages,
and push to that branch. Do not open a pull request unless I explicitly ask.

## My human review feedback for v0.7.0

<PASTE YOUR v0.7.0 REVIEW HERE — or just "continue" to proceed to v0.8.0.>

# Feedback — v0.9.0 (Simulation clock & scheduled payments)

- Milestone reviewed: v0.9.0
- Date/time: 2026-06-29 01:05 (local)
- Source session label (if known): "v0.9.0 review"

## Raw feedback (verbatim — DO NOT EDIT)

> ```
> It seems that there are some places on the Maridian page that still have placeholders that should no longer be there.  For example, the "Cards" and "Loans & CDs" sections on the main page say they arrive in v0.8.0 and v0.9.0 respectively, but since this is v0.9.0, both should already be done.  Is this right?  Furthermore, going to the Cards page or the Loans & CDs page, there are even more mentions that this "will arrive" in later versions.  These should be removed.  Or if you think they should not be removed, and I am missing something, please explain within the next human review document.
>
> Also, I think I found a small bug in the time travel.  For the Bill Payment to City Power and Light, I notice that when I travel into the future, it shows up as a pending purchase in Avery's checking account.  However, when I then approve it within Meridian Ops, it displays as being made on June 28th (the actual current date, and not the simulated date).  Can you change this so that everything in the program uses the simulated date and nothing uses the actual date.
>
> I was mentioned that Loans / CDs / interest accrual was not pursued in v0.9.0 since the simulated clock had to be put in place first.  I think this makes a lot of sense.  Now that the clock is in place, can these be pursued within the v1.0.0 as well?  If so, do them.  If not, explain in the next human review.
>
> I believe we are good to move onto v1.0.0
> ```

## Claude's interpretation

Four items, all **accepted**. The human approves moving to **v1.0.0** and, in the
same breath, **pulls loans / CDs / interest accrual into v1.0.0** and reports two
polish/correctness issues. This **re-scopes v1.0.0** from a pure hardening-and-finish
pass into a combined **feature (loans/CDs/interest) + hardening + polish** milestone.

1. **Stale "coming soon" placeholders on the marketing site.** The human is right and
   the answer is *partly yes*:
   - **Cards** shipped in **v0.8.0** (the customer `/wallet`). The marketing homepage
     "Cards" tile and the `/cards` page still frame cards as a future ("arrives in
     v0.8.0") item. That copy is now **stale and should be updated** to present cards as
     a live, signed-in feature (kept clearly simulated).
   - **Loans & CDs** are **not built yet** — they were explicitly carried forward from
     the v0.9.0 clock-and-scheduler slice (see `ROADMAP_HISTORY.md`). The homepage tile
     citing "v0.9.0" is **inaccurate** regardless (v0.9.0 did not include loans/CDs).
     Because the human is **also asking us to build loans/CDs/interest in v1.0.0**
     (item 3), the correct fix is to **build the feature and then make the marketing
     copy reflect the real, shipped feature** — not merely delete the placeholder. If
     any sub-part can't land, its copy will be made accurate (not a false "v0.X" promise)
     and explained in the human review.
2. **Time-travel date bug (real, in scope).** A scheduled **bill pay** that fires when
   the operator advances the simulation clock is **posted/approved using the wall-clock
   date** (e.g. "June 28") instead of the **simulated** date. The directive is explicit
   and broader than the one symptom: **everything in the program must use the simulated
   clock; nothing may use the real wall-clock date** for any money/event timestamp.
   Accepted as a hardening/correctness task (**audit every `new Date()` / `Date.now()`
   on the money + ops + scheduler paths** and route them through the simulation clock).
3. **Loans / CDs / interest accrual — pulled into v1.0.0.** The human explicitly
   authorizes building them now that the clock exists ("If so, do them"). This is the
   confirmation the v0.9.0 handoff asked for. **Accepted** and added to v1.0.0 scope,
   built on the existing **disciplined ledger + clock + scheduler** (interest accrual is
   a clock-driven, bank-originated `interest` ledger posting; a loan/CD is modeled with
   ledger entries, never a stored/edited balance). If a sub-part proves infeasible at the
   quality bar within the milestone, it will be cut **honestly** with an explanation here
   and in the human review rather than shipped half-done.
4. **"Good to move onto v1.0.0."** Approval to proceed. v1.0.0 is the **final**
   milestone; it ends with the experiment's capstone retrospective + an annotated tag.

## Resulting task changes

v1.0.0 is **re-scoped** (recorded in `ROADMAP.md` / `ROADMAP_HISTORY.md` and the task
board). New/changed task groups in `TASK_BOARD.md`:

- **`PH-xx` — Placeholder & marketing accuracy:** update the homepage product tiles and
  the `/cards`, `/borrow` (Loans & CDs) pages so copy matches shipped reality
  (cards live; loans/CDs live once built); remove false version-dated "coming soon"
  promises; keep the simulation disclaimer.
- **`DT-xx` — Simulated-date correctness:** audit and fix every money/ops/scheduler
  timestamp to read the **simulation clock**, not the wall clock (the bill-pay
  approve-date bug is the lead symptom); add regression tests asserting a fired/approved
  entry carries the **simulated** date.
- **`LN-xx` — Loans / CDs / interest accrual** (the pulled-in feature): schema (additive
  migration), shared contracts + pure math (amortization/interest), backend services
  (clock-driven accrual via the scheduler; ledger-only), routes, customer + operations
  UI, seed data, tests.
- **`HD-xx` — Hardening:** **SEC-1** real CSRF protection for state-changing POSTs;
  **L-2 / L-3** scheduler bookkeeping + funds-check TOCTOU disposition; **dev-tooling
  npm-audit** advisories (vite/vitest/esbuild) — remediate or document final disposition.
- **`QA-xx` — Test expansion:** first frontend component unit tests; broaden e2e where
  thin (loans/CDs journeys, the date-correctness regression, CSRF).
- **`RT-xx` — Capstone:** final retrospective + experiment report; full handoff docs +
  annotated `v1.0.0` tag.

## Accepted feedback

- **All four items accepted.** Placeholder cleanup (build-then-truthful-copy), the
  simulated-date fix, loans/CDs/interest accrual pulled into v1.0.0, and the go-ahead to
  start v1.0.0. Guardrails unchanged: money moves only via explicit `LedgerEntry` rows
  (no stored/edited balance); interest/loan/CD effects are bank-originated ledger entries
  dated at the **simulated** date; transfers net to zero; admin adjustments + reversals
  require a reason + audit; risky shared areas (schema, auth/CSRF, routing, real-time,
  ledger, the clock/scheduler, CI, architecture) are serialized + reviewed; the
  simulation disclaimer stays visible; no secrets committed.

## Deferred feedback

- None newly deferred by the human. If any **sub-part** of loans/CDs/interest cannot
  meet the quality bar within this final milestone, it will be cut with an explicit,
  honest note here and in `HUMAN_REVIEW_v1.0.0.md` (a blocker filed if it blocks the
  gate) — rather than tagging v1.0.0 with a half-finished feature.

## Rejected or modified feedback

- **Modified (not rejected) — the "remove the placeholders" instruction for Loans & CDs:**
  rather than *deleting* the Loans & CDs placeholder, we **build the feature** (per item
  3) and then make the copy describe the real, shipped product. The human offered this
  exact latitude ("Or if you think they should not be removed … please explain"). For
  **Cards**, the placeholder copy is simply updated to reflect the already-shipped
  feature. The net effect honors the intent: no stale "coming in a future version"
  promises remain on the site.

## Questions carried forward

- For the human to confirm at the **v1.0.0** review (the experiment's final gate):
  1. Are the marketing pages now accurate — Cards and Loans & CDs presented as live
     (clearly-simulated) features with no false version-dated "coming soon" copy?
  2. Does **every** money/ops/scheduler timestamp now read the **simulated** clock — in
     particular, does approving a clock-fired bill pay show the **simulated** date?
  3. Do **loans / CDs / interest accrual** post only through the disciplined ledger
     (bank-originated `interest`/loan/CD entries, dated at the simulated date, balances
     derived), and do they behave correctly across a clock advance?
  4. Is the security posture acceptable for the 1.0 capstone — **CSRF** now enforced on
     state-changing POSTs; the ledger/scheduler TOCTOU + bookkeeping items dispositioned;
     dev-tooling audit advisories remediated or formally accepted?

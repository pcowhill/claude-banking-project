# ROADMAP_HISTORY

Tracks how the roadmap evolves over the experiment. Append a dated entry
whenever the milestone plan changes (scope added/removed/reordered). The live
roadmap is `ROADMAP.md`; the live task board is `TASK_BOARD.md`.

---

## 2026-06-25 — Initial roadmap established (v0.1.0)

The initial 10-milestone plan was set during the foundation session, matching the
project brief:

1. **v0.1.0** — Project foundation ✅
2. v0.2.0 — Auth, roles, and demo users
3. v0.3.0 — Public bank website and branding
4. v0.4.0 — Customer banking dashboard
5. v0.5.0 — Operations simulator core
6. v0.6.0 — Onboarding and account opening
7. v0.7.0 — Money movement
8. v0.8.0 — Cards, fraud, disputes
9. v0.9.0 — Loans, CDs, simulated time
10. v1.0.0 — Polish, hardening, and final retrospective

No changes from the original brief. The fraud/risk model is explicitly an
explainable rules engine (no AI/ML), and a disciplined ledger underpins all
money features — both reflected in the foundation rather than deferred.

_Future changes will be appended below with date, what changed, and why._

---

## 2026-06-27 — v0.8.0 delivered as planned; one small UX item folded in

v0.8.0 (Cards, fraud, disputes) shipped with **no scope change** from the brief. Two
notes:

- **R-03 ("Reversed" tag)** — a small operator-console UX item from the human's v0.7.0
  review was accepted and folded into v0.8.0 (a reversed movement / upheld dispute /
  confirmed fraud shows a "Reversed" tag beside "Approved"). Additive presentation, not
  a roadmap change.
- **Recurring/scheduled payments** remain deferred (from v0.7.0) to **v0.9.0**, which is
  now framed as **simulation clock + recurring/scheduled payments (+ statement cycles)** —
  consistent with the original "v0.9.0 — Loans, CDs, simulated time" theme (simulated
  time is the enabling piece). Loans/CDs may share v0.9.0 or move later depending on the
  human's priorities at the v0.8.0 review.

## 2026-06-27 — v0.9.0 delivered as the clock + scheduler + statements slice; loans/CDs/interest carried forward

**What shipped:** **v0.9.0 — Simulation clock & scheduled payments** delivered the
**simulation-time-enabling slice** of the broader "v0.9.0 — Loans, CDs, simulated time"
roadmap theme: a controllable **forward-only simulation clock** (advance fires due
schedules), **recurring/scheduled payments** (internal transfer / bill pay; once / weekly
/ monthly, firing through the v0.7.0 money service), and real **statement cycles** (monthly
periods derived from the simulated date, read-only over the posted ledger). One additive
`scheduled_payments` migration; new ADR
`docs/process/decisions/ADR-0002-simulation-clock-and-scheduler.md`.

**`M-09` (recurring/scheduled payments) — now DONE.** The recurring/scheduled-payments item
carried from v0.7.0 (deferred there because it needs a clock; tracked as `M-09` on the task
board) is **delivered in v0.9.0**. The "needs the clock" dependency is satisfied: schedules
fire on clock advance.

**Carried forward (roadmapped beyond this slice): loans, CDs, and interest accrual.** The
rest of the original v0.9.0 theme — **loans, CDs, and interest accrual** — was **explicitly
not** built in this slice and is **carried forward** on the roadmap. The simulation clock
delivered here is the enabling primitive for time-based accrual when those features land.
The **milestone structure and order are otherwise unchanged**: the next (and final)
milestone remains **v1.0.0 — Polish, hardening, and final retrospective**, which now also
carries the accepted **SEC-1 (CSRF)** item and the dev-tooling audit advisories. Whether
loans/CDs/interest are pulled into v1.0.0 or scheduled as additional work is the human's
call at the v0.9.0 review.

## 2026-06-29 — v1.0.0 re-scoped by the human: loans/CDs/interest pulled in (+ date fix + placeholder cleanup)

**What changed:** at the **v0.9.0 review** the human **pulled loans / CDs / interest
accrual into v1.0.0** ("Now that the clock is in place, can these be pursued within the
v1.0.0 as well? If so, do them.") and reported two polish/correctness items. So the
**final** milestone **v1.0.0** grows from a pure hardening-and-finish pass into a combined
**feature + hardening + polish** capstone:

- **Loans / CDs / interest accrual** — the carried-forward remainder of the original
  "v0.9.0 — Loans, CDs, simulated time" theme — are **built in v1.0.0**, on the
  v0.9.0 clock + the disciplined ledger (interest = bank-originated `interest` ledger
  entries dated at the simulated accrual date; CD/loan principal moves as net-zero
  `transfer` legs; balances stay derived).
- **Simulated-date correctness** — a reported time-travel bug (a clock-fired bill pay
  posted/approved on the **wall-clock** date) is fixed by making the **simulation clock
  the single authoritative "now"** for every money/business timestamp, **superseding
  ADR-0002 decision #2** (which had kept immediate actions on wall-clock to avoid
  collapsing same-session entries — resolved instead with a deterministic ordering
  tiebreaker). Auth/session/operational timestamps stay wall-clock by design.
- **Marketing placeholder cleanup** — stale "coming in vX.Y" copy on the homepage tiles
  and the `/cards` + `/borrow` pages is corrected to reflect shipped reality (cards from
  v0.8.0; loans/CDs once built this milestone).
- **Carried hardening** (already planned for v1.0.0) stays: **SEC-1 (CSRF)**, the
  dev-tooling npm-audit advisories, and the ledger/scheduler TOCTOU + bookkeeping
  disposition.

The **milestone count/order is unchanged** — v1.0.0 remains the final milestone; it now
simply absorbs the carried-forward loans/CDs/interest theme rather than leaving it for a
hypothetical post-1.0 milestone. Recorded in `feedback/FEEDBACK_v0.9.0_2026-06-29_0105.md`
and decomposed into `V-/L-/H-/Q-/R-` tasks on the board; the lending + date decisions are
recorded in **ADR-0003**.

## 2026-06-25 — v0.3.0 absorbed a bug fix (no scope change)

No change to the milestone **structure or order**. Noted for the record: the
v0.2.0 review reported a cross-app session-bleed bug; rather than defer it, the fix
(`W-00`) was folded into **v0.3.0** alongside the website work (it is a small,
well-scoped auth fix and a prerequisite for shipping a public site whose login
entry points must behave correctly). The 10-milestone plan is unchanged; v0.3.0 is
now complete and v0.4.0 (Customer banking dashboard) is next.

---

## 2026-06-26 — patch releases v0.6.1 + v0.6.2 (no structural change)

Two human-requested **patch releases** were inserted on top of the v0.6.0 feature
milestone to fix operations-console bugs found in review — **v0.6.1** (B-03
narrow-width nav, B-04 expired-session recovery) and **v0.6.2** (B-06 operator
sign-in / surface-header session resolution). These are patches on v0.6.0, not new
milestones; the 10-milestone feature plan is unchanged. The last **feature**
milestone remained v0.6.0 until v0.7.0.

---

## 2026-06-26 — recurring/scheduled payments moved from v0.7.0 to v0.9.0

**What changed:** the **recurring / scheduled payments** sub-item, originally listed
under **v0.7.0 — Money movement**, is moved to **v0.9.0 — Loans, CDs, simulated time**.

**Why:** a scheduled/recurring payment needs a **clock** to fire it on a future date,
and the **simulation clock + scheduled-event processing** is already planned for
**v0.9.0**. Implementing a scheduler in v0.7.0 with nothing to execute it would be a
non-functional stub. Moving it next to the clock that powers it keeps each milestone
shippable and honest. All other money movement (one-off internal transfers, external
ACH, wires, mobile-check deposit, bill pay, with approvals/failures/reversals/holds)
**shipped in v0.7.0**. The milestone **structure and order are unchanged**; only this
sub-item's home moved. Raised in `HUMAN_REVIEW_v0.7.0.md` so the human can pull it
forward (with a minimal clock) if they prefer. v0.7.0 is complete; v0.8.0 (Cards,
fraud, disputes) is next.

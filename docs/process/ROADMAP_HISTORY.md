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

## 2026-06-25 — v0.3.0 absorbed a bug fix (no scope change)

No change to the milestone **structure or order**. Noted for the record: the
v0.2.0 review reported a cross-app session-bleed bug; rather than defer it, the fix
(`W-00`) was folded into **v0.3.0** alongside the website work (it is a small,
well-scoped auth fix and a prerequisite for shipping a public site whose login
entry points must behave correctly). The 10-milestone plan is unchanged; v0.3.0 is
now complete and v0.4.0 (Customer banking dashboard) is next.

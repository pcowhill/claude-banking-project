# ROADMAP

Milestone-gated plan from foundation to v1.0.0. Each milestone ends in a
runnable state with `npm run verify` passing, a human review, and a clean
handoff. **One milestone per session. Stop at each gate for human approval.**

Status legend: ✅ complete · ▶️ in progress · ⏳ planned

| Milestone | Theme | Status |
| --- | --- | --- |
| v0.1.0 | Project foundation | ✅ complete |
| **v0.2.0** | Auth, roles, and demo users | ✅ complete |
| v0.3.0 | Public bank website and branding | ⏳ planned (next) |
| v0.4.0 | Customer banking dashboard | ⏳ planned |
| v0.5.0 | Operations simulator core | ⏳ planned |
| v0.6.0 | Onboarding and account opening | ⏳ planned |
| v0.7.0 | Money movement | ⏳ planned |
| v0.8.0 | Cards, fraud, disputes | ⏳ planned |
| v0.9.0 | Loans, CDs, simulated time | ⏳ planned |
| v1.0.0 | Polish, hardening, final retrospective | ⏳ planned |

---

### v0.1.0 — Project foundation ✅
Monorepo setup · customer app shell · operations app shell · backend API shell ·
SQLite/Prisma setup · seed/reset script scaffold · basic routing · shared
UI/component setup · CI/check scripts · project documentation/process logging
structure.

### v0.2.0 — Auth, roles, and demo users (next)
Customer login · operations/admin login · password hashing · sessions · seeded
demo users · role-based access control · login history/audit logs · initial
Playwright login tests.

### v0.3.0 — Public bank website and branding
Fictional bank name/logo system (built) · public home page · product marketing
pages · realistic AI-generated image placeholders or generation instructions ·
login/open-account entry points · responsive layout polish.

### v0.4.0 — Customer banking dashboard
Accounts overview · checking/savings details · transaction history · pending vs
posted transactions · search/filter · statements/documents placeholder ·
realistic seeded transaction data.

### v0.5.0 — Operations simulator core
Pending request queues · approve/reject/hold/request-more-info actions · audit
log · real-time updates with WebSockets · simulated SMS/email/MFA/identity
verification events.

### v0.6.0 — Onboarding and account opening
Open-account flow · identity verification · initial funding request · joint
account invitation · operations approval/rejection · admin-created demo users.

### v0.7.0 — Money movement
Internal transfers · external ACH transfers · wires · mobile check deposit ·
bill pay · recurring/scheduled payments · approvals, failures, reversals, holds.

### v0.8.0 — Cards, fraud, disputes
Debit/credit cards · freeze/unfreeze · lost/stolen flow · travel notices ·
disputes · fraud alerts · suspicious transaction scenarios.

### v0.9.0 — Loans, CDs, simulated time
Personal/auto/mortgage-style loans · payment schedules · CDs · interest accrual ·
statement cycles · fast-forward simulation clock · scheduled event processing.

### v1.0.0 — Polish, hardening, and final retrospective
UX cleanup · test expansion · bug fixing · performance pass · security review
(including the dev-tooling audit advisories) · final process retrospective ·
final experiment report.

---

Roadmap changes over time are tracked in
`docs/process/ROADMAP_HISTORY.md`. The live, task-level board is
`docs/process/TASK_BOARD.md`.

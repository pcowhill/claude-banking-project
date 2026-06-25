# HUMAN REVIEW — v0.5.0 (Operations simulator core)

This is the review guide for the v0.5.0 milestone — the bank-side operations
console comes alive. Everything is a local **SIMULATION**: no real money, no real
SMS/email/MFA/identity providers, no external integrations.

## TL;DR

- The operations console's placeholder queues are now **live**: real pending work
  items you can **approve / reject / hold / request more info**, each written to an
  **audit log**, with the queue updating **in real time** over WebSockets.
- A **Simulated messaging** screen generates fake SMS / email / MFA / identity
  events (clearly labelled simulated) that stream into a live feed.
- **Money is untouched:** acting on a request changes its workflow status only —
  it never moves money or posts to the ledger (that comes in v0.7.0). Balances
  stay **derived**.
- `npm run verify` passes (**145** unit/integration tests); **25** Playwright e2e
  tests pass. Security review: **PASS** (its one Medium — a test for the socket
  access control — was added this milestone).

## How to run it

```bash
npm install
npm run db:reset     # seeds demo users + transactions + a 10-item ops queue
npm run dev          # backend :3000, customer :5173, operations :5174
```

Open the **operations console** at **http://localhost:5174** and sign in with a
seeded, **non-secret** staff login:

| Role | Email | Password |
| --- | --- | --- |
| Operator (Sam) | `sam.operator@example.com` | `Operator123!` |
| Admin (Riley) | `riley.admin@example.com` | `Admin123!` |

(Customer logins are still rejected from this staff-only console.)

## What to click through

1. **Dashboard** (`/`): a live overview — open-request count, a per-status queue
   snapshot, a **Needs attention** list, and a **recent simulated events** feed. A
   green **Live** pill shows the real-time socket is connected.
2. **Request queues** (sidebar → *Request queues*): the live queue. Filter by
   **status** (Pending / On hold / Info requested / Approved / Rejected — counts
   update live) or by **queue lane** (Onboarding & identity / Deposits & transfers
   / Fraud & disputes / Support). Each card has **Approve / Reject / Hold / Request
   info** buttons.
3. **Action a request:** click any action on a card — the status badge updates
   immediately and the change is audited. Click a card to open its **detail
   panel**: the full context, the **history** (every action, who did it, the note),
   any **linked simulated events**, and a **note** box (your note is recorded in the
   audit log).
4. **Real-time, for real:** open the console in **two browser windows** (or two
   tabs) as the operator. Action a request in one — it updates in the **other**
   without a refresh. (Under the hood, only operator sessions receive these
   updates.)
5. **Simulated messaging** (sidebar → *Simulated messaging*): send a simulated
   **SMS / email / MFA / identity** event (success or failure). It appears in the
   live feed instantly. Every row is clearly a simulation — no real provider is
   contacted.

## Things worth knowing

- **No money moves.** Approving a "Mobile check deposit" or "Outbound ACH" request
  in this milestone only changes the request's status and writes an audit entry; it
  does **not** create a ledger entry or change any balance. Money movement (and the
  ledger effects of an approval) is the v0.7.0 milestone. This is enforced by a
  test, not just a promise.
- **Everything is audited.** Each operator action and each simulated event writes
  an `AuditLog` row with the actor, the note/reason, and the status change. The
  detail panel shows the trail.
- **Real-time is access-controlled.** The customer app and the operations console
  share one WebSocket server, but operator events are sent to an operators-only
  "room" that only a signed-in `ops_agent`/`admin` joins. A customer's browser
  never receives operator data — there's now an automated test that proves it.
- **First database migration since auth (v0.2.0).** This milestone added real
  tables (a fuller `OperationsRequest` + a new `SimulatedEvent`). It's additive —
  the money/auth tables are unchanged — and `npm run db:reset` rebuilds everything.

## Known limitations (by design)

- Operator actions are **workflow-only** — no money movement yet (v0.7.0).
- The simulated messaging is **recorded, never sent** — there is no real provider
  behind any of it, ever.
- Onboarding/account-opening (which would create *new* customers and feed the
  onboarding queue from a real flow) is the **next** milestone (v0.6.0); today the
  queue is seeded.
- Frontend component unit tests remain deferred (the console is covered by the
  build + Playwright journeys + backend/contract tests); tracked in
  `QUALITY_REPORT.md`.
- Pre-existing hardening follow-ups (CSRF, config-driven cookie `secure`, helmet +
  login rate-limit) and the dev-tooling npm-audit advisories remain tracked — no
  new ones were introduced. A Low note to cap a future user-supplied applicant name
  (once onboarding is user-facing) is logged for v0.6.0.

## Next milestone

**v0.6.0 — Onboarding and account opening** (open-account flow, identity
verification, initial funding request, joint-account invitation, operations
approval/rejection feeding the queue you just used, admin-created demo users). It
is **not** started. Per the protocol I stopped at this gate.

**Please review and reply with:** anything you want changed, and whether you
approve starting **v0.6.0**.

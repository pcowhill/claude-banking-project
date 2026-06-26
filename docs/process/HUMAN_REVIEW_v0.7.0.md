# HUMAN REVIEW — v0.7.0 (Money movement)

This is the milestone where **moving money actually works** — and where an operator
approving a request, for the first time, makes money move on a customer's account.
Everything is still a local **SIMULATION**: no real money, no real banks, no ACH/wire
networks, no billers, fake demo data only. Money only ever moves by adding entries to
the append-only ledger; **a balance is never edited directly**.

## TL;DR

- **Customers can now move money** in four ways: **transfer** between their own
  accounts (instant), **deposit a check**, **send money** (ACH or wire), and **pay a
  bill**. The last three are **reviewable**: they show as **Pending** until an
  **operator approves** them in the ops console.
- **An operator approval now posts the movement.** Approving a deposit/transfer/
  payment in **Request queues** flips it from *Pending → Posted* and updates the
  customer's balance. An operator can also **reject** it (it fails, and any held funds
  are released) or **reverse** an already-posted movement (with a reason).
- **The thing you asked about earlier is fixed (Q-01):** approving a pending **mobile
  check deposit** now flips the customer's line from *Pending* to *Posted* and updates
  their available balance.
- `npm run verify` passes (**240** tests); **37** Playwright end-to-end tests pass in a
  real browser; runtime dependency audit is clean; a security review passed.
- **One thing I deferred on purpose:** *recurring / scheduled* payments — see the last
  section.

## What you can try (please run these)

```bash
npm install
npm run db:reset     # seeds demo data incl. reviewable money movements
npm run dev          # backend :3000, customer :5173, operations :5174
```

**As a customer (Avery)** at `:5173` — sign in `avery.customer@example.com` /
`Customer123!`:

1. From the dashboard, click **Transfers** (or go to `/move-money`). On the **Transfer**
   tab, move, say, $25 from **Everyday Checking** to **Goal Savings** and submit. You
   get an instant "Transfer complete" with both updated balances. (Open each account —
   you'll see the matching transfer lines; the two cancel out, so no money was created.)
2. On the **Deposit a check** tab, deposit, say, $142.50 into checking. You get a
   reference (e.g. `MOV-…`) and a note that it stays **Pending** until an operator posts
   it. Open the account — you'll see the **Pending** deposit line.
3. Try **Send money** (ACH/wire) and **Pay a bill** too — each is queued for review.

**As an operator (Sam)** at `:5174` — sign in `sam.operator@example.com` /
`Operator123!`:

4. Open **Request queues**. You'll see the customer's submissions plus seeded items,
   including **"Mobile check deposit awaiting review ($320.00)."** Click one to open it.
5. The detail panel shows the **Money movement** context (type, amount, direction,
   etc.). **Approve** it. Back on the customer side, that line is now **Posted** and the
   balance has updated. (This is the Q-01 fix.)
6. After approving, a **Reverse movement** box appears. Enter a reason and reverse it —
   the movement shows **Reversed** and the balance effect is undone. (Or **Reject** a
   pending one instead: it's marked failed and any held funds are released.)

Demo logins (seeded, **non-secret**, fake data):

| Role | Email | Password |
| --- | --- | --- |
| Customer (Avery) | `avery.customer@example.com` | `Customer123!` |
| Operator (Sam) | `sam.operator@example.com` | `Operator123!` |
| Admin (Riley) | `riley.admin@example.com` | `Admin123!` |

## How the money stays honest (in plain language)

- **Nothing has a stored "balance" field.** A balance is always *calculated* from the
  list of ledger entries. To move money, the system *adds entries* — it never edits a
  number.
- **A transfer adds two entries** — money out of one account, the same amount into the
  other — so it **nets to zero**. No money is created or destroyed.
- **Money only comes in** as a clearly-labelled *deposit* and **only goes out** as a
  *payment/debit*. While a movement is waiting for review it's **Pending** (and an
  outgoing one already reserves the funds, so you can't spend them twice).
- **Approve = post it. Reject = mark it failed. Reverse = undo a posted one** (and a
  reversal always records a reason). All of this is just changing an entry's *status*,
  never touching a balance — and every step is written to the audit log.
- You can only move money on **your own** accounts; the operator-only actions are
  locked to bank staff.

## What did NOT change / still works

- v0.2.0 auth, the v0.3.0 public site **and the two apps' separate sign-ins**, the
  v0.4.0 dashboard, the v0.5.0 operations console, and v0.6.0 onboarding/approvals are
  all unchanged and still passing — including the v0.6.1 narrow-width menu, the v0.6.2
  operator sign-in fix, and session isolation.
- No database migration was needed (the ledger already had everything required).
- The simulation disclaimer is visible on the new screens; no secrets added.

## One deferral (your call) — recurring / scheduled payments

The v0.7.0 list mentioned **recurring / scheduled** payments. I deferred those to
**v0.9.0** on purpose: a *scheduled* payment needs a **clock** to fire it on a future
date, and the simulation clock + scheduled-event processing is already planned for
**v0.9.0**. Building a scheduler now — with nothing to actually run it — would be a
button that doesn't really do anything, which I'd rather not ship. **Everything else**
in money movement (one-off transfers, ACH, wires, mobile-check deposit, bill pay, with
approvals, failures, reversals, and holds) is done.

If you'd like, I can bring a **minimal simulation clock forward** so recurring/scheduled
payments work in v0.8.0 instead — just say so and I'll fold it in.

## Next step (your call)

Please test v0.7.0 using the steps above. If money movement works the way you expect —
a customer can move money, an operator approval posts it (and the pending deposit flips
to Posted), and a reversal undoes a posted one — reply that you approve, and the next
session will proceed to **v0.8.0 — Cards, fraud, disputes** (folding in
recurring/scheduled payments earlier if you want it). If anything is off, tell me and
I'll fix it before v0.8.0 begins.

### Small tracked items (not blocking, for transparency)

- **CSRF token** — the new "move money" actions are protected today by the session
  cookie's `SameSite=Lax` setting + the allowed-origins list (a malicious other site
  can't ride your session); a dedicated CSRF token is a belt-and-suspenders upgrade
  planned for the v1.0.0 hardening pass.
- **A theoretical double-spend race** on the funds check (two requests at the exact
  same instant) — extremely unlikely in this single-user simulation and self-correcting
  (balances are always recalculated); slated for a small ledger-hardening pass.

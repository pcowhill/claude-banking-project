# HUMAN REVIEW — v0.6.0 (Onboarding and account opening)

This is the review guide for the v0.6.0 milestone — a real, clearly-**simulated**
account-opening flow that **feeds the operations queue you used in v0.5.0**, and
the moment an operator **approval starts to have real effects** (it provisions a
user + account + initial funding). Everything is a local **SIMULATION**: no real
money, no real SMS/email/MFA/identity providers, no external integrations.

This milestone also folds in **two fixes from your v0.5.0 review** and answers
**two questions** you raised (deposit "Pending", and what Simulated Messaging is
for). Those four items are addressed directly below.

## TL;DR

- **Open an account for real (simulated):** the `/open-account` page is now a
  working application — applicant details, product, a simulated opening deposit,
  an optional joint-owner invite, and consent. Submitting it creates a **pending
  onboarding work item in the operations queue** (live, in real time).
- **Operator approval now provisions the account:** approving the onboarding
  request creates the **User + Account**, and any opening deposit enters as an
  explicit **bank-originated, posted ledger entry** — money only ever enters via
  that audited event; balances stay **derived**. Rejecting marks the application
  declined and creates nothing.
- **Joint-account invitations:** an account owner can invite a second person;
  accepting creates a `joint` access grant and the invitee starts seeing the
  account.
- **Admin-created demo users:** an admin can provision a demo user (and optionally
  open + fund an account — funding is an **audited adjustment that requires a
  reason**).
- **Your two v0.5.0 fixes shipped:** the detail-panel buttons now deactivate
  correctly (B-01), and you can **add a note at any time, including after the
  decision** (B-02).
- `npm run verify` passes (**189** unit/integration tests); **30** Playwright e2e
  tests pass. Security review: **PASS** (no Critical/High/Medium findings).

## Your v0.5.0 review — what changed and what I'm answering

### 1. Bug: the action buttons didn't always deactivate — FIXED (B-01)

You were right. On the **Request queues** page the left column is the list of
request **cards** (each with its own Approve/Reject/Hold/Request-info buttons) and
the right column is the **detail panel** (also with action buttons). They were
driven by two *different* copies of the request's status: acting from a **card**
updated the shared live queue (so the card's buttons disabled), but the open
**detail panel** kept its own stale copy and never noticed — so its buttons stayed
active. Now the detail panel reads the **live** queue state, so its status badge
and buttons update the instant a request becomes resolved — whether you acted from
the card, from the panel, or another operator did it in real time.

### 2. Request: let me leave a note after I've clicked the button — ADDED (B-02)

Done. The decision buttons (Approve/Reject/Hold/Request info) still disable once a
request is resolved, but there is now a dedicated **"Add note"** button beside them
that is **always available** — type a note and add it **at any time, including
after** a request is approved or rejected. Each note is recorded in the request's
**History** (the audit trail) with who wrote it and when. A note changes no status
and — like every operator action this milestone except an onboarding approval —
**moves no money**.

### 3. Question: should approving a Mobile check deposit un-"Pending" the customer's line? — Deferred to v0.7.0, here's why

Short answer: **it's correct that it does not update yet, and the reason is money
discipline + milestone gating.**

- The seeded "Mobile check deposit" line in the customer's account is a **pending
  ledger entry**. Flipping it from *Pending* to *Posted* **changes the account's
  available balance** — i.e. it is a **money-movement** event. By design, operator
  actions in v0.5.0/v0.6.0 are **workflow-only** for existing customer money: they
  change a request's status + write an audit row, but they do **not** post to the
  ledger. Mobile check deposit (and transfers, ACH, wires, bill pay) are the
  **v0.7.0 — Money movement** milestone.
- v0.6.0 **does** introduce the first case where an operator approval has a
  **ledger effect** — but only the **narrow, safe** one: **initial funding at
  account opening**, where money **enters** a brand-new account via an explicit
  **bank-originated `deposit`** entry, audited. Retrofitting deposit *posting*
  (which needs the holds/availability/reversal rules that go with real deposits)
  ahead of the milestone that designs them would ship a half-built path, so I
  deliberately did not.
- **What v0.7.0 will do (recorded as an acceptance note on the roadmap):**
  approving a deposit-review request will **post** the pending entry (pending →
  posted), so the customer's line stops reading *Pending* and the available
  balance updates — all within ledger discipline (audited, bank-originated, no
  stored/edited balance). So your instinct is right; it's simply the next
  milestone's job.

### 4. Question: what is Simulated Messaging for? Will it play a real role (e.g. 2FA)? — Yes; here's the explanation

**Simulated Messaging is the "seam" where a real SMS/email/MFA/identity provider
*would* plug in — but, by the simulation-safety rules, never does.** It records a
clearly-labelled fake event instead of contacting anyone.

- **Today (and already in v0.5.0):** it's an operator tool to generate fake
  SMS/email/MFA/identity events into the live feed, and the **Request info** action
  already auto-creates a simulated email. It demonstrates the channel end-to-end
  (event → feed → linked to a request) with no real provider.
- **It now has its first *real* use (v0.6.0):** submitting an account-opening
  application emits onboarding **simulated events** — an "application received"
  email, an **identity-verification** step, and an **MFA enrollment** offer — all
  linked to the new onboarding queue item. Approving the application emits an
  "**identity verified — account opened**" event (and a joint-invite email if one
  was requested). So onboarding's identity/MFA story is exactly the
  `SimulatedEvent` model you asked about, now driven by a real flow.
- **Your 2FA example is precisely the future direction:** when customer-facing
  **MFA / 2-factor-at-login / new-device verification** lands (a deferred item in
  the auth theme), a login will create a `SimulatedEvent` — an OTP "sent" via
  SMS/email, an MFA challenge — the operator console will show it, and an operator
  can approve/deny the verification. The event is always **simulated**; the seam
  exists so a real integration *could* be added later but intentionally never is in
  this experiment.

## How to run it

```bash
npm install
npm run db:reset     # seeds demo users + transactions + ops queue + an
                     # APPROVABLE onboarding application + a pending joint invite
npm run dev          # backend :3000, customer :5173, operations :5174
```

Demo logins (seeded, **non-secret**):

| Role | Email | Password |
| --- | --- | --- |
| Customer (Avery) | `avery.customer@example.com` | `Customer123!` |
| Joint customer (Jordan) | `jordan.joint@example.com` | `Joint123!` |
| Operator (Sam) | `sam.operator@example.com` | `Operator123!` |
| Admin (Riley) | `riley.admin@example.com` | `Admin123!` |

## What to click through

### A) Open an account end-to-end (the headline flow)

1. On the **customer site** (`:5173`), open **Open an account** (`/open-account`).
   Fill in the simulated application: name, email (use a NEW email, e.g.
   `casey.new@example.com`), a password you'll remember, a product, an opening
   deposit (e.g. `$250`), optionally invite a joint owner, tick consent, submit.
   You'll get a **reference** and a "an operator will review it" confirmation.
2. On the **operations console** (`:5174`, sign in as **Sam**), go to **Request
   queues** → the **Onboarding & identity** lane. Your application is there as a
   live **New account application**. Open it: the detail panel shows the
   **Application** context (product, opening deposit, any joint invite).
3. Click **Approve**. Behind the scenes this creates the user + account and posts
   the opening deposit as a bank-originated ledger entry. You'll see an
   "**account opened (simulated)**" event in the feed.
4. Back on the **customer site**, **sign in with the email + password you chose**
   in step 1 — your new account is there, with the opening deposit as its balance
   (derived from the ledger).

> Shortcut: the seed already includes **one approvable application** — "New account
> application — Everyday Checking" for **Taylor Prospect**
> (`taylor.prospect@example.com`, $250 opening deposit). Approve it as Sam and
> then sign in as Taylor with `Prospect123!` to see the same result without filling
> the form.

### B) Joint-account invitation

1. Sign in to the customer site as **Avery**, open the **Goal Savings** account.
   As the **owner** you'll see **Invite a joint owner** — invite Jordan
   (`jordan.joint@example.com`). (The seed also already has a **pending** Avery→
   Jordan invite for savings.)
2. Sign in as **Jordan**: the **Dashboard** shows an **Invitations** inbox. Click
   **Accept** — the **Goal Savings** account now appears for Jordan (a `joint`
   access grant was created). **Decline** is also there.

### C) Admin-created demo user

1. Sign in to the operations console as **Riley (admin)** — an **admin-only**
   sidebar item, **Create demo user**, appears. Create a user (optionally open +
   fund an account; funding **requires a reason** — it's an audited adjustment).
   The page shows the new user's non-secret **demo password** to share.

### D) Your two fixes

- **B-01:** open a request's detail panel, then click **Approve** on its **card**
  on the left — the panel's buttons now disable too (try it with two windows for
  the real-time version).
- **B-02:** approve or reject a request, then type a note and click **Add note** —
  it lands in the **History** even though the decision buttons are disabled.

## Things worth knowing

- **Money still only enters via a bank-originated, audited ledger event.** The two
  places money is created this milestone — onboarding **initial funding** (origin
  `deposit`) and an admin **funded** account (origin `adjustment`, reason required)
  — are both posted ledger entries with audit rows. Balances stay **derived**; a
  test asserts the system-wide settled total moves by **exactly** the funded
  amount and by nothing else. Submitting an application, adding a note, and every
  non-onboarding operator action move **no** money.
- **Approval is the gate, and it's guarded.** Approving an onboarding request is
  blocked (and rolled back) if the applicant's email already belongs to a user, so
  you can't double-provision. Approval runs in a transaction, so a failure leaves
  the request still actionable rather than half-approved.
- **The password is never exposed.** An applicant's chosen password is hashed
  immediately (bcrypt) and stored only as a hash on the application; it is never
  put in the operations queue DTO or shown to an operator.
- **Second additive migration.** v0.6.0 adds `OnboardingApplication` +
  `AccountInvitation` tables. It's additive — money/auth tables unchanged — and
  `npm run db:reset` rebuilds everything.

## Known limitations (by design)

- **Deposit posting is v0.7.0** (see answer #3 above) — approving an existing
  pending mobile-check-deposit does not yet flip the customer's line to *Posted*.
- Customer-facing **MFA/2FA at login** is still deferred (see answer #4) — v0.6.0
  uses the simulated-messaging seam for **onboarding** identity/MFA; login-time 2FA
  arrives with the auth follow-ups.
- The joint invite is "delivered" only as a **simulated email** — there is no real
  email, ever. For the demo, an invitee accepts from their own signed-in dashboard.
- Frontend component unit tests remain deferred (the apps are covered by build +
  Playwright journeys + backend/contract tests); tracked in `QUALITY_REPORT.md`.
- Pre-existing hardening follow-ups (CSRF, config-driven cookie `secure`, helmet +
  login rate-limit) and the dev-tooling npm-audit advisories remain tracked — see
  `QUALITY_REPORT.md`. The v0.5.0 "cap a user-supplied applicant name" note is
  **closed**: the open-account validator bounds the name (and all free text).

## Next milestone

**v0.7.0 — Money movement** (internal transfers, external ACH, wires, **mobile
check deposit posting** — i.e. the pending→posted change from answer #3 — bill pay,
and the approvals/failures/reversals/holds that go with them). It is **not**
started. Per the protocol I stopped at this gate.

**Please review and reply with:** anything you want changed, and whether you
approve starting **v0.7.0**.

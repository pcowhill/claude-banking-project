# HUMAN REVIEW — v0.4.0 (Customer banking dashboard)

This is the review guide for the v0.4.0 milestone. It covers the new customer
banking dashboard **and** the two public-site UX fixes you asked for in the
v0.3.0 review. Everything is a local **SIMULATION** — no real money, accounts, or
integrations.

## TL;DR

- **Both of your v0.3.0 change requests are done** (scroll-to-top everywhere +
  Security deep-link; and "Visit your Dashboard" / "already signed in" when
  logged in).
- **New:** an accounts overview, per-account detail with transaction history
  (pending vs posted), search/filter, a statements placeholder, and ~3 months of
  realistic seeded transactions.
- Balances stay **derived** from the append-only ledger. `npm run verify` passes
  (93 unit/integration tests); 22 Playwright e2e tests pass. Security review: PASS.

## How to run it

```bash
npm install
npm run db:reset     # seeds 4 demo users + 56 dated ledger entries
npm run dev          # backend :3000, customer :5173, operations :5174
```

Open the customer app at **http://localhost:5173** and sign in (these are
seeded, **non-secret** demo logins):

| Role | Email | Password |
| --- | --- | --- |
| Customer (Avery) | `avery.customer@example.com` | `Customer123!` |
| Joint customer (Jordan) | `jordan.joint@example.com` | `Joint123!` |

Avery owns **Everyday Checking** + **Goal Savings** and has the full transaction
history. Jordan is a **joint** user on the checking only (good for confirming
access scoping).

## What changed from your v0.3.0 feedback

**(1) Scroll-to-top on navigation + the Security deep-link — done.**
- Every client-side navigation now lands at the **top** of the destination page —
  not just the top-nav links, but the footer links and the in-page buttons too
  (e.g. the "See Savings" / "See Checking" buttons at the bottom of the Loans &
  CDs page). To verify: scroll to the bottom of a long page, click any of those
  buttons, and you'll arrive at the top of the next page.
- The **"Security"** link (in the footer, and the "How security works" button on
  the home page) now goes to the About page **and scrolls to the security
  section** (`/about#security`), sitting just below the sticky header.
- Implementation: a single router-level `ScrollToTop` effect handles it for every
  control at once, so nothing was wired button-by-button.

**(2) Logged-in entry points — done.**
- When you're signed in, the public "Log in" / "Open an account" buttons (hero,
  footer, and the closing call-to-action band) now read **"Visit your
  Dashboard"** and take you straight to your dashboard.
- If you go to **`/login`** while already signed in, you now get a friendly
  **"You're already signed in"** page with a **Visit your Dashboard** link and a
  **Log out** button (which returns you to the sign-in form) — instead of the
  login form.
- Logged-out behavior is unchanged (you still see "Log in" / "Open an account"
  and the normal login form).

## What to click through (the new dashboard)

1. **Accounts overview** (`/dashboard`): a combined "Total available across your
   accounts", a card per account (available + current, relationship badge), and a
   **View transactions →** link. Your recent sign-in activity is still here.
2. **Account detail** (click a card → `/accounts/:id`): the account header with
   derived balances (available, current, and any pending-out / on-hold /
   pending-in amounts), then the transaction history.
3. **Transactions**: a **Pending** group (a pending card authorization, a pending
   mobile-check deposit, and a hold) shown separately from **Posted**; each posted
   row shows the **running balance**. Try the **search** box ("Simmons" →
   groceries + the refund) and the **status / category** filters.
4. **Statements** (`/statements`, linked from the dashboard and the detail page):
   a clearly-labelled placeholder — real statements arrive in v0.9.0.

## Things worth knowing

- **Balances are derived, not stored.** The server computes available/current and
  each row's running balance from the ledger entries; there is no editable balance
  field anywhere (this is enforced by the schema and the money tests).
- **The seeded data is internally consistent.** Money only enters via
  bank-originated events (opening deposit, payroll, interest, a refund) and every
  transfer posts both legs, so nothing appears from nowhere. The pending card
  hold + the hold reduce *available* but not *current*; the pending incoming
  deposit is shown but not yet counted in available.
- **Access scoping holds.** Jordan sees only the shared checking and its
  transactions; trying to open the savings detail returns a friendly "no access".
- **No database migration** this milestone — a transaction is just a ledger entry,
  which the schema already modelled.

## Known limitations (by design)

- Statements are a placeholder (no real PDFs) until v0.9.0; **moving money** (which
  would create new transactions) arrives in v0.7.0 — today's transactions are all
  seeded.
- Frontend component unit tests are still deferred (the dashboard is covered by the
  build + Playwright journeys); tracked in `QUALITY_REPORT.md`.
- The pre-existing security hardening follow-ups (CSRF, config-driven cookie
  `secure`, helmet + login rate-limit) and the dev-tooling npm-audit advisories
  remain tracked — no new ones were introduced.

## A small note for your call

Per your preference ("I'd rather just be sent to my dashboard when I'm already
logged in"), a logged-in customer no longer has a one-click path to the bare login
*form* — they'd log out first (from the header or the "already signed in" page). If
you later want a quick "switch account" shortcut straight to a fresh form, that's a
tiny follow-up we can add.

## Next milestone

**v0.5.0 — Operations simulator core** (pending request queues, approve/reject/
hold/request-info actions, audit log, real-time WebSocket updates, simulated
SMS/email/MFA/identity events). It is **not** started. Per the protocol I stopped
at this gate.

**Please review and reply with:** anything you want changed, and whether you
approve starting **v0.5.0**.

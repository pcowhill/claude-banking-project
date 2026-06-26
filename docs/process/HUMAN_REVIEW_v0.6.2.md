# HUMAN REVIEW — v0.6.2 (Operations sign-in fix)

This is a small **patch release** that exists only to fix the one blocking bug you
reported in your v0.6.1 review — that you could no longer sign in to Meridian
Operations. Everything is still a local **SIMULATION**: no real money, no real
SMS/email/MFA/identity providers, no external integrations, fake demo data only. No
new features were added; v0.7.0 (Money movement) was **not** started.

## TL;DR

- **The sign-in loop is fixed.** You can now sign in to the operations console as
  **Sam** and as the **Administrator**, the dashboard **stays** (no bounce back to
  the login page), and **Request queues** loads so you can approve/hold items.
- **What was broken, in one sentence:** the console figured out *which* signed-in
  session to use by looking at a piece of browser information (the `Origin`) that
  browsers **don't always send** — so after you logged in, the very next request
  looked like it had no operator session, and the v0.6.1 "your session has ended"
  safety net kicked you back to the login page over and over.
- **The fix, in one sentence:** each app now **explicitly tells the backend which app
  it is**, instead of relying on that sometimes-missing browser hint — so the
  operator's session is found every time.
- `npm run verify` passes (**201** unit/integration tests); **33** Playwright
  end-to-end tests pass in a real browser (the new one reproduces your exact
  situation and proves the fix).

## What was broken (and that it is now fixed)

In v0.6.1 you reported: signing in to Meridian Operations as **Sam** or the
**Administrator** showed the dashboard for a fraction of a second and then bounced you
back to the sign-in page with the message *"Your operator session has ended (it
expired or you were signed out). Please sign in again…"* — and it looped forever, even
after closing tabs and clearing cookies.

**This was a real bug, and it is now fixed.** Both staff users (Sam and Riley) can
sign in and stay signed in.

## Why it happened (in plain language)

Meridian runs two apps that share one backend: the **customer portal** and the
**operations console**. Each keeps its own separate sign-in (its own session cookie),
so signing in to one doesn't sign you in to the other. To know *which* of the two
sessions a request belongs to, the backend was reading a piece of information the
browser attaches to requests called the **`Origin`** (it says which web page the
request came from).

The catch: **browsers don't always send the `Origin`.** They send it when you submit
the login form, but for ordinary page loads on the **same website** they leave it off.
So right after you logged in to operations, the console's very next request to load
your dashboard/queues arrived **without** that hint — and the backend, with nothing to
go on, assumed it was a *customer* request, looked for a customer session (which you
didn't have), and replied "not signed in." The v0.6.1 fix that returns you to the
login page when your session looks invalid then took over and bounced you — and
because every single request had the same missing-hint problem, it bounced you **every
time**, forever.

This is also why it worked fine for me in testing but not for you: the typical
developer setup runs the two apps on **different** addresses, which **does** send the
`Origin` every time — so the gap never showed up locally. Your setup runs them on the
**same** address, which is exactly the case that triggered it.

**The fix:** instead of relying on that sometimes-missing browser hint, **each app now
states which app it is** on every request (the operations console literally says "I am
operations"). The backend trusts that, so it always finds the right session. (The old
`Origin` hint is still used as a backup, so nothing else changes — the customer portal,
the live updates, and existing behavior are all unaffected.) For the technically
curious: this only chooses *which* session cookie to read — it cannot grant access on
its own; the permission checks are unchanged, so it's safe.

## How to test it (please run these exact steps)

```bash
npm install
npm run db:reset     # seeds the demo users + an approvable onboarding application
npm run dev          # backend :3000, customer :5173, operations :5174
```

Then, in the **operations** console (`:5174`):

1. **Sign in as Sam** — `sam.operator@example.com` / `Operator123!`. Confirm the
   **dashboard stays** (no bounce back to the sign-in page).
2. **Sign out, then sign in as the Administrator** — `riley.admin@example.com` /
   `Admin123!`. Confirm the **dashboard stays** for the admin too.
3. Open **Request queues**. Confirm the queue loads and that **approve / hold**
   actions work on an item (for example, approve the seeded **"New account
   application — Everyday Checking"** for **Taylor Prospect**; then on the customer
   site `:5173` you can sign in as Taylor with `Prospect123!` to see the provisioned,
   funded account).

Demo logins (seeded, **non-secret**, fake data):

| Role | Email | Password |
| --- | --- | --- |
| Customer (Avery) | `avery.customer@example.com` | `Customer123!` |
| Operator (Sam) | `sam.operator@example.com` | `Operator123!` |
| Admin (Riley) | `riley.admin@example.com` | `Admin123!` |

> If you still have an old operations tab open from before, give it a plain refresh
> after `npm run dev` so it picks up the new app code. You should **not** need to clear
> cookies this time.

## The earlier v0.6.1 fixes still work

This patch is built **on top of** v0.6.1, so everything from before is intact:

- **Narrow-window menu (v0.6.1 B-03):** on a narrow window the operations console
  still shows the **☰** menu button so Dashboard / Request queues / Simulated messaging
  stay reachable.
- **Expired-session recovery (v0.6.1 B-04):** if your operator session genuinely
  expires later, the console still returns you to the sign-in screen with a clear
  notice and recovers when you sign in again. (This patch fixes the case where that
  safety net was firing *incorrectly* — it now only fires when your session is
  *actually* gone.)
- Everything earlier — v0.2.0 auth, the v0.3.0 public site **and the two apps' separate
  sign-ins**, the v0.4.0 customer dashboard, the v0.5.0 operations console, and v0.6.0
  onboarding/approvals — is unchanged and still passing.

## What did NOT change

- **No v0.7.0 work.** Money movement (transfers, ACH, wires, mobile-check-deposit
  posting, bill pay) is still the next milestone and was **not** started. The carried
  v0.5.0 item **Q-01** (approving a pending deposit should flip it *Pending → Posted*)
  remains parked with v0.7.0.
- No schema/migration change; no change to the ledger, money discipline, the public
  site, the customer dashboard, or onboarding behavior. Balances stay **derived**; the
  simulation disclaimer is still everywhere; no secrets added.

## Next step (your call)

Please test v0.6.2 using the steps above. If you can now sign in as **Sam** and as the
**Administrator**, reach the dashboard without bouncing, and use **Request queues**,
reply that you approve — and the next session will proceed to **v0.7.0 — Money
movement** (including the carried **Q-01** deposit pending→posted note). If anything is
still off, tell me and I'll fold it in before v0.7.0 begins.

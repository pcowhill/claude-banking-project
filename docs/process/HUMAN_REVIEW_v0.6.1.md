# HUMAN REVIEW — v0.6.1 (Operations console fixes)

This is a small **patch release** that exists only to fix the two Meridian
Operations bugs you reported in your v0.6.0 review, before any v0.7.0 work begins.
Everything is still a local **SIMULATION**: no real money, no real
SMS/email/MFA/identity providers, no external integrations. No new features were
added; v0.7.0 (Money movement) was **not** started.

You asked me to either fix each bug and explain the fix here, or — if you were
just missing an existing control — explain that here instead. Both bugs were
**real**; below is exactly what was wrong and how I fixed it.

## TL;DR

- **Bug 1 — the left menu disappears on a narrow window: REAL BUG, FIXED.** On a
  narrow/small window the left sidebar was hidden with **no replacement**, so there
  was genuinely no way to switch between Dashboard / Request queues / Simulated
  messaging. Added a **menu button (☰)** in the top bar that opens the same
  navigation on narrow windows.
- **Bug 2 — "Not authenticated" in Request queues; can't approve an application:
  REAL BUG, FIXED.** The backend and the approval flow were actually working
  correctly — I verified an application can be submitted, approved, and the new
  customer can sign in to a funded account. The defect was in the **operations
  web app**: when your operator session was no longer valid (expired, or left over
  from earlier testing / a backend restart), the console still *looked* signed-in
  but every data call failed with "Not authenticated", stranding you with no way
  forward. Now the console **detects that and returns you to the sign-in screen**
  with a clear message; signing in again loads the queue and lets you approve.
- `npm run verify` passes (**189** unit/integration tests); **32** Playwright e2e
  tests pass (the **2 new** ones lock in these fixes).

## Bug 1 — navigation disappears on a small window (FIXED)

**You were right — this was a bug, not something you missed.** The operations
console had a left sidebar with the navigation links (Dashboard, Request queues,
Simulated messaging, and, for admins, Create demo user). That sidebar was set to
show **only** on large screens (the `lg` breakpoint, ~1024px and up) and was simply
**hidden** below that width — with **no hamburger menu or any other control** to
take its place. So when you made the window narrow, the links vanished and you were
stuck on whichever section was showing.

**How I fixed it.** I added a responsive top-bar menu:

- A **menu button (☰)** now appears in the header on narrow windows (it's hidden on
  large windows, where the sidebar is already visible — so nothing changes for you
  on a wide screen).
- Tapping it opens a panel with the **same** navigation links (Dashboard / Request
  queues / Simulated messaging / — for admins — Create demo user).
- Choosing a link navigates and **auto-closes** the menu. The button is
  keyboard-accessible and screen-reader labelled (`aria-expanded` / `aria-controls`),
  and it toggles to an ✕ while open.

The desktop sidebar is unchanged. Implementation: the nav links were factored into
one shared list used by **both** the desktop sidebar and the new mobile menu, so the
two can never drift apart (`apps/operations/src/components/OpsLayout.tsx`).

**How to confirm:** open the operations console (`:5174`), sign in as Sam, and make
the window narrow (or use your browser's device-toolbar). The **☰** button appears
top-left; tap it and switch to **Request queues**.

## Bug 2 — "Not authenticated" in Request queues, and approvals out of reach (FIXED)

This one had two layers. The important news first: **the actual banking flow is
not broken.** I reproduced the whole thing end-to-end and the **backend + approval
path work correctly** — the problem was purely in how the operations *web app*
handled an **invalid/expired operator session**.

### What I verified is working (so you can trust the flow)

Driving the real backend, I confirmed the complete loop:

1. Submitting an application on the customer site (`/open-account`) creates the
   **onboarding** work item, exactly as the confirmation promises.
2. An operator who is **properly signed in** sees that item in **Request queues**
   (I loaded the live queue with all its seeded items, including the
   "New account application" for the seeded applicant).
3. The operator **Approves** it → the backend provisions the **User + Account** and
   posts the opening deposit as a bank-originated ledger entry.
4. The **new customer can then sign in** and see their funded account.

So nothing about onboarding or approvals is actually missing — which is why this is
a patch, not a redesign.

### What was actually broken (and why you saw "Not authenticated")

"Not authenticated" is the backend's reply when a request arrives **without a valid
operator session**. The operations console authenticates with a session cookie
(`mer_ops_session`). The defect: the console decided whether to show the signed-in
console **purely from its own in-memory state** (set right after you log in, or from
the initial "who am I?" check) and then **never reconciled that with the API**. So
if your session was **no longer valid** — which is easy to hit when you've been
testing across several versions and backend restarts, or after the session's 8-hour
lifetime — the app would still render the full console, but **every** data call
(the queue, the dashboard counts, the event feed) would come back **"Not
authenticated"**. The Request queues page showed that message directly; the
Dashboard just looked empty. There was **no path back** except somehow knowing to
clear cookies — which is a terrible experience and squarely our bug.

Why your **fresh** logins sometimes looked fine but other times didn't: a brand-new
sign-in sets a good cookie and works; but a **stale** cookie left in the browser
from earlier testing (or a session invalidated by a backend restart/reseed) put the
console into the broken "looks signed-in, but isn't" state described above.

### How I fixed it

The console now **reconciles its sign-in state with the backend**:

- The API client recognises an **authentication failure** (HTTP 401 with
  `unauthenticated` / `session_expired`) on any operations call.
- When that happens, the app **signs you out in the UI and returns you to the
  operator sign-in screen**, with a clear amber notice: *"Your operator session has
  ended (it expired or you were signed out). Please sign in again…"*
- Signing in again establishes a fresh session, and the **queue loads normally** —
  so you can approve the application. (I verified this recovery in a real browser.)
- A genuine bad-password attempt is unaffected — it still shows "Email or password
  is incorrect", not the session notice.

Net effect: the dead-end "Not authenticated" page is gone. Whatever leftover/expired
session state your browser had, the console now guides you to sign in again and the
queue works.

> **One-time note for your testing:** because your browser may still hold an old
> operator cookie from earlier versions, the very first time you open v0.6.1 you may
> be taken straight to the sign-in screen (that's the fix doing its job). Just sign
> in as **Sam** and you're in. If anything still looks odd, a hard refresh (or
> "clear site data" for `localhost`) gives a clean slate — but you shouldn't need
> to.

Implementation: `apps/operations/src/lib/api.ts` (detect the auth-failure codes),
`AuthContext.tsx` / `auth-context.ts` (reconcile + a `sessionEnded` flag), and
`pages/Login.tsx` (the notice).

## How to run it

```bash
git pull
npm install
npm run db:reset     # seeds demo users + an APPROVABLE onboarding application
npm run dev          # backend :3000, customer :5173, operations :5174
```

Demo logins (seeded, **non-secret**):

| Role | Email | Password |
| --- | --- | --- |
| Customer (Avery) | `avery.customer@example.com` | `Customer123!` |
| Operator (Sam) | `sam.operator@example.com` | `Operator123!` |
| Admin (Riley) | `riley.admin@example.com` | `Admin123!` |

## What to click through

1. **Bug 1 (navigation):** open `:5174`, sign in as **Sam**, and narrow the window
   (or use the browser device toolbar). The **☰** menu button appears top-left —
   open it and switch to **Request queues** and back to **Dashboard**.
2. **Bug 2 (queues + approval):** in **Request queues** you should now see the live
   queue. Approve the **"New account application — Everyday Checking"** for
   **Taylor Prospect** (seeded), then on the customer site sign in as Taylor with
   `Prospect123!` to see the provisioned, funded account. Or submit your own
   application at `:5173/open-account` and approve that.
   - To see the **session fix** itself: if you ever land on the sign-in screen with
     the *"session has ended"* notice, that's the new safety net — just sign in
     again and the queue loads.

## What did NOT change

- **No v0.7.0 work.** Money movement (transfers, ACH, wires, mobile-check-deposit
  posting, bill pay) is still the next milestone and was not started. The carried
  v0.5.0 item **Q-01** (approving a pending deposit should flip it
  *Pending → Posted*) remains parked with v0.7.0.
- No schema/migration change; no change to the ledger, money discipline, auth model,
  the public site, the customer dashboard, or onboarding behavior. Balances stay
  **derived**; the simulation disclaimer is still everywhere.

## Next step (your call)

Please test v0.6.1. If the two bugs are resolved to your satisfaction, reply that
you approve — and the next session will proceed to **v0.7.0 — Money movement**
(including the carried **Q-01** deposit pending→posted note). If anything is still
off, tell me and I'll fold it in before v0.7.0.

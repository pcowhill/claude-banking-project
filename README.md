# Meridian — Simulated Banking Platform (local demo)

> ⚠️ **This is a LOCAL SIMULATION. It is not a real bank.** No real money, real
> accounts, real cards, or real banking/SMS/email integrations are involved.
> Do not use it for anything financial. It exists to explore great banking UX
> and to run a multi-session, milestone-gated AI development experiment.

Meridian is a TypeScript monorepo with three runnable pieces:

| App | What it is | Local URL |
| --- | --- | --- |
| **Customer app** | Public marketing **website** + authenticated banking portal | http://localhost:5173 |
| **Operations simulator** | Internal console that *simulates* external banks & bank-employee actions | http://localhost:5174 |
| **Backend API** | Fastify + Socket.IO + Prisma/SQLite | http://localhost:3000 |

**Current milestone:** `v0.8.0 — Cards, fraud, disputes` (builds on `v0.7.0 — Money
movement`; see `ROADMAP.md` and `docs/process/MILESTONE_REPORT_v0.8.0.md`).

## Tech stack

TypeScript · npm workspaces · React + Vite (×2) · Node.js + Fastify ·
Socket.IO · Prisma + SQLite · Tailwind CSS (shadcn-style components) · Vitest ·
Playwright · GitHub Actions. No Docker required.

## Prerequisites

- **Node.js ≥ 20** (LTS) and **npm ≥ 10**. (Node 22 is fine.)
- Git.
- That's it — SQLite is file-based, no database server to install.

## Quick start

### Windows 11 — PowerShell

```powershell
git pull
npm install
npm run db:reset
npm run verify
npm run dev
```

### WSL Ubuntu (on Windows 11)

```bash
git pull
npm install
npm run db:reset
npm run verify
npm run dev
```

`npm run dev` starts all three apps together. Then open:

- **Customer app:** http://localhost:5173
- **Operations simulator:** http://localhost:5174 (open in a second tab/window)
- Backend health check: http://localhost:3000/health and http://localhost:3000/status

> On WSL, the apps bind with host networking so `localhost:5173` / `:5174` work
> from your Windows browser via WSL2 localhost forwarding.

## Signing in (demo accounts)

Authentication is **real** as of v0.2.0 (passwords are bcrypt-hashed; sessions
are httpOnly cookies) but it guards only fake, seeded demo data. The demo
passwords below are **intentionally non-secret** so you can explore each role.
Run `npm run db:reset` first to seed these users.

| Role | Where to log in | Email | Password | Can see |
| --- | --- | --- | --- | --- |
| Customer | Customer app (`:5173`) | `avery.customer@example.com` | `Customer123!` | Both own accounts (checking + savings) |
| Joint customer | Customer app (`:5173`) | `jordan.joint@example.com` | `Joint123!` | Only the **shared** checking account |
| Operations agent | Operations console (`:5174`) | `sam.operator@example.com` | `Operator123!` | Operations summary; staff console |
| Bank admin | Operations console (`:5174`) | `riley.admin@example.com` | `Admin123!` | Operations + admin user roster |

Sign in repeatedly with the wrong password and the account temporarily locks
(after 5 tries) — that's the lockout policy, not a bug. Every sign-in attempt is
recorded; the customer dashboard shows recent sign-in activity.

### New in v0.8.0 (cards, fraud, disputes)

- **Manage your cards.** Sign in as **Avery** and open **Cards** (`/wallet`, also from
  the dashboard quick links). You'll see seeded **simulated** cards (masked number,
  brand, expiry, status). Self-service lifecycle: **issue** a debit/credit card,
  **freeze / unfreeze**, **report lost or stolen** (which terminates the old card and
  issues a **replacement** with a new number), and add / cancel **travel notices**.
  Card lifecycle moves **no money** — it never touches the ledger.
- **Fraud alerts.** The bank flags suspicious activity as a fraud alert (the seed
  includes one for a **QuickFuel** charge). On the customer dashboard you can
  **Confirm it was me** or **Report fraud**. An operator (Sam, `:5174`) then acts on
  the alert: **Approve = confirm fraud** — which **reverses** the suspicious charge and
  **freezes** the linked card — or **Reject = dismiss** as legitimate.
- **Dispute a transaction.** From an account's transaction list, **Dispute** a posted
  charge (the seed includes an open **Trattoria Romana** dispute). Filing flags the
  transaction **Disputed**. An operator **Approve = uphold** **reverses** the charge (a
  refund as a ledger status change) or **Reject = deny** lets it stand.
- **"Reversed" tag (operator console).** When a money movement is reversed, a dispute
  upheld, or fraud confirmed, the queue item keeps its **Approved** badge **and** now
  shows a distinct **"Reversed"** tag — in the queue, on the dashboard, and in the
  detail panel — so a reversed outcome is visible at a glance.
- **Money discipline (unchanged):** every money effect is a **ledger** status change
  (`disputed`, `reversed`) or a bank-originated entry, never a stored/edited balance;
  reversals keep a reason + audit. A `Card` model was the only schema change (additive).

### New in v0.7.0 (money movement)

- **Move money as a customer.** Sign in as **Avery** (`avery.customer@example.com` /
  `Customer123!`) and open **Move money** (`/move-money`, also from the dashboard
  quick links). Four flows:
  - **Transfer** between your own accounts — **instant**; both ledger legs post and
    **net to zero** (no money is created).
  - **Deposit a check**, **Send money** (external ACH / wire), **Pay a bill** — these
    are **reviewable**: they show as **Pending** until an operator posts them.
- **An operator approval POSTS the movement.** Sign in to the operations console
  (`:5174`) as **Sam**, open **Request queues**, open a money item (e.g. the seeded
  **"Mobile check deposit awaiting review ($320.00)"**) — the detail panel shows the
  **money-movement context** — and click **Approve**. The customer's line flips
  **Pending → Posted** and the balance updates. **Reject** instead marks it failed
  (and releases reserved funds); after approving, a **Reverse movement** action (reason
  required) flips a posted movement back.
- **Money discipline:** every movement is an explicit **ledger** entry — a transfer's
  two legs, a bank-originated `deposit` credit in, a `payment` debit out — and
  failures/reversals are ledger **status** changes (`failed`/`reversed`). **No balance
  is ever stored or edited;** balances stay derived. No database migration was needed.

### New in v0.6.0 (onboarding & account opening)

- **Open a (simulated) account end-to-end.** On the customer app, go to
  **Open an account** (`/open-account`) and submit a simulated application — name,
  email, a password you choose, a product, an opening deposit, optionally invite a
  joint owner, accept the simulated terms. You get a reference; **nothing real is
  created yet**.
- **Approve it as an operator.** Sign in to the operations console (`:5174`) as
  **Sam**, open **Request queues → Onboarding & identity**, open the application
  (the detail panel shows its product / opening deposit), and click **Approve**.
  That provisions the **User + Account** and posts the opening deposit as an
  explicit **bank-originated** ledger entry (audited; balances stay derived). Now
  sign in to the customer app with the **email + password you chose**.
  - Shortcut: the seed already includes **one approvable application** — Taylor
    Prospect (`taylor.prospect@example.com`, $250 opening deposit). Approve it as
    Sam, then sign in as Taylor with **`Prospect123!`**.
- **Joint-account invitations.** As **Avery**, open the **Goal Savings** account and
  **invite a joint owner**. As the invitee (e.g. **Jordan** — the seed includes a
  pending Avery→Jordan invite), the **Dashboard** shows an **Invitations** inbox —
  **Accept** and the account appears.
- **Admin-created demo users.** As **Riley (admin)**, an admin-only **Create demo
  user** page provisions a user (optionally with a funded account — funding requires
  a reason and is an audited adjustment) and shows the non-secret demo password.
- **Two fixes from the v0.5.0 review:** the request detail-panel buttons now
  deactivate correctly when a request is resolved from anywhere (**B-01**), and you
  can **add a note at any time, including after a decision** (**B-02**).
- **Money discipline:** the only ways money is created are **account-opening initial
  funding** and an **admin funded account** — both posted, bank-originated, audited
  ledger entries. Everything else (submitting an application, adding a note, a joint
  invite) moves no money. (Posting an existing *pending* deposit — the customer's
  "Pending" line — is **money movement**, delivered in **v0.7.0** above.)

### New in v0.5.0 (operations simulator core)

- **Sign in to the operations console at http://localhost:5174** as a staff member
  (`sam.operator@example.com` / `Operator123!`, or the admin `riley.admin@example.com`
  / `Admin123!`). Customer logins are still rejected here.
- **Live request queues** (`/queues`): a seeded queue of work items (identity, MFA,
  fraud, deposit, dispute, onboarding, ACH, support, password reset, external
  account). **Approve / reject / hold / request info** on any card — the status
  updates immediately and every action is written to an **audit log**. Filter by
  status or queue lane; open a card for its history, linked simulated events, and an
  optional note.
- **Real-time, for real:** open the console in **two windows** and action a request
  in one — it updates in the other without a refresh (operator sockets only).
- **Simulated messaging** (`/messaging`): generate fake **SMS / email / MFA /
  identity** events (clearly labelled simulated — no real provider is ever contacted)
  and watch them stream into a live feed.
- **No money moves:** acting on a request changes its workflow status only; it never
  posts to the ledger or changes a balance (money movement is v0.7.0).
- `npm run db:reset` now also seeds a **10-item operations queue** + **4 simulated
  events** alongside the existing users/accounts/transactions.

### New in v0.4.0 (customer banking dashboard)

- **Sign in as Avery → the accounts overview** (`/dashboard`): a combined total and
  a card per account (available + current, both **derived** from the ledger),
  linking into each account.
- **Open an account → transaction history** (`/accounts/:id`): ~3 months of seeded
  activity with **pending vs posted** clearly separated, a **running balance** on
  each posted row, and an instant **search** + **status/category filter**. Try
  searching `Simmons` or filtering to **Pending**.
- **Statements & documents** (`/statements`): a clearly-labelled placeholder (real
  statements arrive in v0.9.0).
- **Logged-in entry points:** while signed in, the public "Log in" / "Open an
  account" buttons become **"Visit your Dashboard"**, and visiting `/login` shows an
  "already signed in" page (dashboard link + log out).
- **Navigation** now scrolls to the top of each page you visit, and the **Security**
  link deep-links to the security section on the About page.
- `npm run db:reset` seeds **56** dated ledger entries (all bank-originated or
  balanced transfer legs — money never appears from nowhere).

### New in v0.3.0 (public website)

- **Browse the public site at http://localhost:5173** — a polished home page plus
  **Checking**, **Savings**, **Cards** and **Loans & CDs** (coming-soon overviews),
  **About**, and an **Open account** page. Try the responsive **mobile menu** by
  narrowing the window. Marketing photos are drop-in placeholders (branded
  gradients until you add files to `apps/customer/public/images/`).
- **Independent app sessions:** the customer portal and the operations console now
  keep **separate** sessions. Logging into Ops no longer affects the customer site,
  and logging out of the customer app makes `/dashboard` redirect to the customer
  login (fixes the v0.2.0 review bug — see `docs/process/HUMAN_REVIEW_v0.3.md`).

### What to look at in v0.2.0

- **Customer login → dashboard:** sign in as Avery and see live accounts with
  *derived* balances (from the ledger, not hard-coded), plus recent sign-in
  activity. Sign in as Jordan (joint) to see only the shared checking account —
  the role-based access control in action.
- **Operations console login:** sign in as Sam (ops) or Riley (admin); a
  customer login is rejected from the staff console.
- The operations console with placeholder queues, scenario controls, and
  simulated external-response panels (they light up in later milestones).
- The always-on **simulation disclaimer** banner/footer in both apps.
- A live "backend online / db ready" indicator (proves the API wiring).

## Common commands

| Command | Description |
| --- | --- |
| `npm run dev` | Run backend + customer + operations concurrently. |
| `npm run db:reset` | Drop & recreate the SQLite DB, apply migrations, seed demo data. |
| `npm run db:seed` | Re-seed demo data. |
| `npm run verify` | **The gate:** lint + typecheck + unit/integration tests + build. |
| `npm run test` | Vitest unit/integration tests. |
| `npm run test:e2e` | Playwright smoke tests (run `npm run test:e2e:install` once first). |
| `npm run build` | Build all three apps. |
| `npm run lint` / `npm run format` | Lint / format the repo. |
| `npm run clean` | Remove build artifacts, generated code, and the local DB. |

### Running one app at a time

```bash
npm run dev:backend       # http://localhost:3000
npm run dev:customer      # http://localhost:5173
npm run dev:operations    # http://localhost:5174
```

## Project layout

```
apps/backend      Fastify API, Socket.IO, Prisma schema + seed
apps/customer     Customer React app
apps/operations   Operations simulator React app
packages/shared   Shared types, constants, brand tokens, money/ledger logic
assets/           Brand SVGs and image-generation prompts
docs/             Project state + the process/experiment framework
```

## The disciplined ledger (why balances are trustworthy)

Account balances are **never** stored as an editable number. They are derived
from an append-only ledger of entries (`packages/shared/src/ledger.ts`), and all
money is stored as integer minor units (cents). The test suite enforces that
money cannot appear or vanish except through explicit, bank-originated entries.
See `TECHNICAL_ARCHITECTURE.md`.

## For contributors / future AI sessions

Start with `CLAUDE.md`, then `docs/PROJECT_STATE.md` and `docs/NEXT_SESSION.md`.
The roadmap is in `ROADMAP.md`; the live task board is
`docs/process/TASK_BOARD.md`.

## Safety & scope

No real money. No real banking/SMS/email. No secrets committed. No custom
crypto. Not FDIC insured — because it is not a bank. See `QUALITY_BAR.md` and
`docs/process/decisions/ADR-0001-project-foundation.md`.

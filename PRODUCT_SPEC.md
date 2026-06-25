# PRODUCT_SPEC

The product surface of the Meridian simulation. This describes the **eventual**
system; each item notes the milestone that delivers it (see `ROADMAP.md`).
Nothing here implies real financial capability.

## Applications

1. **Customer Banking App** (`apps/customer`, port 5173)
   - Public marketing website for the fictional bank.
   - Customer login + authenticated banking portal.
2. **Bank Operations Simulator** (`apps/operations`, port 5174)
   - Internal/operator console opened in a separate tab/window.
   - Simulates external banking systems and bank-employee actions.
3. **Backend API + WebSocket server** (`apps/backend`, port 3000)
   - Fastify HTTP API, Socket.IO real-time channel, SQLite via Prisma.

## Roles (RBAC arrives in v0.2.0)

- **Customer** — owns accounts, moves money, manages cards/profile. Sees only
  their own accounts.
- **Joint Account Customer** — authorized on shared accounts only.
- **Bank Operations Agent** — works operations queues, approves/holds/rejects,
  issues simulated external responses.
- **Bank Admin** — manages demo users, configuration, adjustments (audited).

## Banking products

| Product | Milestone |
| --- | --- |
| Checking accounts | v0.4.0 |
| Savings accounts | v0.4.0 |
| Credit cards | v0.8.0 |
| Personal / auto / mortgage-style loans | v0.9.0 |
| Certificates of Deposit | v0.9.0 |
| External linked accounts | v0.7.0 |

## Customer features

- **Marketing & onboarding:** public site; account opening / onboarding;
  identity verification; initial funding; joint-account invitation. _(v0.3.0,
  v0.6.0)_
- **Auth & security:** login, MFA, remember device, session timeout, password
  reset, account lockout, new-device alerts, trusted devices, login history,
  audit/activity history. _(v0.2.0+)_
- **Dashboard & accounts:** overview; account detail pages; current vs available
  balance; pending vs posted transactions; search/filter history;
  statements/documents. _(v0.4.0)_
- **Money movement:** transfers between own accounts; transfers to other
  customers; ACH; wires; mobile check deposit; bill pay; recurring/scheduled
  transfers & payments; credit-card and loan payments; approvals, failures,
  reversals, holds. _(v0.7.0)_
- **Cards:** freeze/unfreeze; lost/stolen flow; travel notices. _(v0.8.0)_
- **Risk & disputes:** fraud alerts; disputes; suspicious-activity scenarios.
  _(v0.8.0)_
- **Support & profile:** messages/support inbox; profile/security settings;
  joint account / authorized-user flows. _(v0.5.0+)_

## Operations simulator features

- Pending request queues (onboarding, identity, MFA, deposits, ACH, wires, fraud
  alerts, disputes, support, password resets, external-account verification).
- Actions: **approve / reject / hold / request-more-info**.
- Simulated external responses: SMS codes, email messages, MFA/identity
  decisions, ACH results, wire-network approvals/rejections, check-image
  accept/reject, fraud decisions.
- Scenario controls: inject random transactions, trigger fraud alerts, place
  account holds, create failed payments, simulate monthly interest, generate
  statement cycles, fast-forward simulation time.
- Real-time updates via WebSockets; fraud/risk decisions show **why** a rule
  triggered. _(core in v0.5.0; deepens through v0.9.0)_

## Simulated time (v0.9.0)

A simulation clock controlled from the operations app: fast-forward
days/weeks/months; generate statement cycles; accrue savings interest; apply
loan interest; post pending transactions; run scheduled transfers/bill payments;
simulate paycheck deposits; create overdraft/late-payment scenarios.

## Money & ledger model (foundation in v0.1.0)

- Balances are **derived** from an append-only ledger, never stored as editable
  fields.
- All money is integer **minor units** (cents).
- Distinguish **current** vs **available** balance.
- Entry statuses: `pending`, `posted`, `held`, `failed`, `reversed`, `disputed`.
- Admin adjustments require a **reason** and an **audit log** entry.
- Tests assert money cannot appear/disappear except via explicit bank-originated
  events (seed, interest, fees, deposits, adjustments).

## Fraud / risk model (v0.8.0)

A simple, **explainable rules engine** (no AI/ML). Triggers review for: large
wires, transfers to new external accounts, repeated failed logins, new-device
large transfers, unusual injected card activity, suspicious mobile-deposit
flags, repeated overdrafts, failed payments, etc. Thresholds become configurable
over time. The operations console shows the triggering rule and offers
approve/reject/hold/request-confirmation.

## Branding & assets

Fictional bank **Meridian**; original SVG logo variants in `assets/brand/`;
design tokens in `packages/shared/src/brand.ts`; marketing-image generation
prompts in `assets/prompts/IMAGE_GENERATION_PROMPTS.md`. Generated images drop
into `apps/customer/public/images/` with no code change. No real logos,
copyrighted assets, or real-person likenesses.

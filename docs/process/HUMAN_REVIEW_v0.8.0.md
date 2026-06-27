# Human Review — v0.8.0 (Cards, fraud, disputes)

> This is what to look at, how to try it, and the decisions/answers from this
> milestone. Everything is a local **SIMULATION** — no real cards, money, or
> providers.

## How to run it

```
npm install
npm run db:reset
npm run verify      # the gate — lint + typecheck + tests + build
npm run dev         # backend :3000, customer :5173, operations :5174
```

Demo sign-ins (unchanged): **Avery** `avery.customer@example.com` / `Customer123!`
(customer app `:5173`); **Sam** `sam.operator@example.com` / `Operator123!`
(operations console `:5174`).

## Your v0.7.0 feedback → what we did

You wrote (verbatim saved at `feedback/FEEDBACK_v0.7.0_2026-06-27_0107.md`):

> "Everything looks great. Perhaps the one thing I would want to see added is that
> when I Reverse a request within Meridian Ops, the tag on the item within the
> queue still just says 'Approved'. It may be nice to have it say 'Approved' and
> also have one that says 'Reversed'. If you think this is a good idea, you can
> implement it. If not, please explain it in this next version's round of docs."

**We agreed it's a good idea and implemented it (task R-03).** A reversed item now
keeps its **Approved** badge **and** shows a distinct **"Reversed"** tag — not only
in the request detail panel (as before) but also on the **queue cards** and the
**operations dashboard** lists, so it reads at a glance. It's a purely derived
presentation change (from `payload.reversed`); the request stays terminal-approved,
and we did **not** touch the action state machine. We folded it into v0.8.0 because
disputes and fraud also produce reversals, so the tag is now useful in three places.

## What to try (the headline flows)

1. **Cards (customer).** As **Avery**, open **Cards** (`/wallet`, also linked from the
   dashboard). You'll see two seeded simulated cards. Try **Freeze/Unfreeze**, **Report
   lost/stolen** (watch a **replacement** card appear with a new number, old one
   terminal), add a **travel notice**, and **Issue a card**. None of this moves money.
2. **Dispute a transaction (customer → operator).** On an account's transaction list,
   click **Dispute** on a posted charge — it flips to **Disputed**. Then as **Sam**,
   open **Request queues**, find the dispute (the seed also includes an open **Trattoria
   Romana $42.10** dispute), and **Approve** to uphold it — the charge is **reversed**
   (a refund as a ledger status change) and the item shows the new **Reversed** tag.
   **Reject** instead denies it (the charge stands).
3. **Fraud (customer → operator).** On Avery's dashboard you'll see a **fraud alert**
   (QuickFuel) — **Confirm it was me** or **Report fraud**. As **Sam**, open the alert
   and **Approve = confirm fraud**: the charge is **reversed** and the linked card is
   **frozen** (and the item shows **Reversed**). **Reject = dismiss** as legitimate.

## Money discipline (unchanged, verified)

Card lifecycle writes **no** ledger entry. Every money effect (an upheld dispute, a
confirmed fraud) is a ledger **status** change (`disputed`/`reversed`) with a reason +
audit row — **no balance is ever stored or edited**; balances stay derived. The only
schema change is an **additive** migration (`Card` + `CardTravelNotice`).

## Quality gate

- `npm run verify` ✅. **282** unit/integration tests (was 240; **+42**) + **41**
  Playwright e2e (was 37; **+4**) green; **0** lint warnings.
- **Security review: PASS-with-findings** — no High issues; RBAC, money discipline,
  operator-only resolution, data exposure, and simulation safety all sound. Findings
  (all Low/info, tracked in `QUALITY_REPORT.md`):
  - **Acted on now:** an internal **transfer leg can no longer be disputed** (it must
    net to zero) — added a guard + test.
  - **Tracked:** a cosmetic TOCTOU on the fraud-response write (no money impact, same
    class as the existing note); reported cards use `lost`/`stolen` rather than the
    available `replaced` status (intentional — more informative); a defense-in-depth
    note to assert payload ledger/card ownership *if* a future flow ever lets a
    customer influence a fraud payload (today they cannot).

## Decisions / interpretations this milestone

- **R-03 accepted + implemented** (see above).
- **No re-scope.** Recurring/scheduled payments remain deferred to **v0.9.0** (they
  need the simulation clock). Say the word and we can pull them forward.
- **Card spend vs. card lifecycle:** existing `card`-origin ledger entries remain the
  model for *spend*; v0.8.0 adds the *lifecycle* on top, which deliberately moves no
  money.

## Open questions for you

1. Do the **three flows** above behave as you'd expect end-to-end (manage a card;
   dispute → uphold/deny; fraud confirm/dismiss), and does the **"Reversed" tag** now
   show where you wanted it?
2. Card **type**: we model debit/credit cards on checking/savings accounts (there is no
   dedicated credit-card *account* product yet). Is that fine for the sim, or would you
   like a real `credit_card` account product in a later milestone?
3. Ready to proceed to **v0.9.0** (simulation clock + recurring/scheduled payments,
   statement cycles), or any changes to v0.8.0 first?

## Tag

Version is bumped to **0.8.0**; an annotated **`v0.8.0`** tag is created locally on the
milestone commit. **Tag push is blocked in this environment (HTTP 403)** — please tag
on merge to `main`:
```
git tag -a v0.8.0 -m "v0.8.0 — Cards, fraud, disputes"
git push origin v0.8.0
```

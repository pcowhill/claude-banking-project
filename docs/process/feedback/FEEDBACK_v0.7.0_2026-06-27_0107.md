# Feedback — v0.7.0 (Money movement)

- Milestone reviewed: v0.7.0
- Date/time: 2026-06-27 01:07 (local)
- Source session label (if known): "v0.7.0 review"

## Raw feedback (verbatim — DO NOT EDIT)

> ```
> Everything looks great.  Perhaps the one thing I would want to see added is that when I Reverse a request within Meridian Ops, the tag on the item within the queue still just says "Approved".  It may be nice to have it say "Approved" and also have one that says "Reversed".  If you think this is a good idea, you can implement it.  If not, please explain it in this next version's round of docs.
> ```

## Claude's interpretation

A **clean approval** of v0.7.0 — Money movement ("Everything looks great") with an
explicit go-ahead to proceed to the next planned milestone, **v0.8.0 — Cards, fraud,
disputes**. No bugs reported and no re-scope of v0.8.0.

Plus **one small, optional UI request** the human left to my judgement: when an
operator **Reverses** a money movement in Meridian Ops, the request's **queue
badge still reads "Approved"** — there is no at-a-glance signal in the queue/list
that the (already-approved) item was subsequently **reversed**. Today the
"Reversed" state is only surfaced inside the request **detail panel** (the
money-movement context shows a "Reversed" indicator); the card badge and dashboard
lists do not reflect it. The human suggests showing **both** "Approved" **and** a
"Reversed" tag.

**My assessment: this is a good idea, and I will implement it.** It is a small,
low-risk, read-only presentation change that improves operator situational
awareness, and it pairs naturally with v0.8.0, where **reversal becomes a
first-class outcome of a dispute resolution** (an operator resolving a dispute may
reverse the disputed entry). Making "Reversed" visible in the queue is therefore
directly useful to the new dispute flow, not just a one-off polish item. The
request stays **terminal/"approved"** (its decision is unchanged and auditable); we
add a **secondary "Reversed" tag** derived from the movement payload / ledger
state, so we do not overload or rewrite the action state machine.

## Resulting task changes

- **v0.8.0 — Cards, fraud, disputes** is **approved to start** as the single
  milestone for this session. Its task list (`C-xx` cards, `F-xx` fraud, `D-xx`
  disputes, plus shared/contract + test tasks) is planned in `TASK_BOARD.md` this
  session per the v0.8.0 scope in `docs/NEXT_SESSION.md`.
- **New accepted task — `R-03` (Ops "Reversed" tag):** show a secondary
  **"Reversed"** tag alongside the existing **"Approved"** status badge on a
  money-movement request anywhere its status is rendered in Meridian Ops (queue
  cards, dashboard needs-attention/recent lists, detail panel), derived from the
  request payload / linked ledger `reversed` status. No state-machine change; the
  request stays terminal-approved. Folded in early since v0.8.0 disputes also
  produce reversals.
- No recurring/scheduled-payments pull-forward was requested, so it **remains
  deferred to v0.9.0** (needs the simulation clock).

## Accepted feedback

- **"Everything looks great … move onto the next milestone."** Accepted. Proceeding
  with **v0.8.0 — Cards, fraud, disputes** per the planned scope and guardrails
  (ledger discipline; money effects via ledger status/bank-originated entries only;
  reversals + admin adjustments keep a reason + audit; serialize the one risky
  migration — the `Card` model).
- **"When I Reverse a request … the tag still just says 'Approved' … nice to have
  one that says 'Reversed'."** Accepted and **will be implemented** as task `R-03`
  (see Resulting task changes). The "Approved" badge is kept; a distinct "Reversed"
  tag is added wherever the request is listed, not only in the detail panel.

## Deferred feedback

- None new. Items already deferred by design remain deferred: **recurring/scheduled
  payments → v0.9.0** (needs the sim clock); **MFA/2FA at login, password reset,
  remember-device/new-device alerts** (later auth pass); **loans/CDs, simulated time
  + real statement cycles** (v0.9.0+); **frontend component unit tests** (covered for
  now by build + Playwright + backend/contract tests). The feedback did not change
  these.

## Rejected or modified feedback

- None. The one optional request is accepted in full (not rejected or modified).

## Questions carried forward

- For the human to confirm at the **v0.8.0** review:
  1. Can a customer **manage a card** end-to-end — see an issued (simulated) card,
     **freeze/unfreeze** it, report it **lost/stolen** to get a replacement (old
     card frozen, new number issued), and file a **travel notice**?
  2. Does a **suspicious-transaction (fraud) alert** reach the operations queue, let
     the customer **confirm/deny**, and let an operator act — reusing the v0.5.0
     queue + real-time channel?
  3. Can a customer **dispute a posted transaction**, and does an operator
     **resolve** it by either **reversing** the disputed entry (ledger
     posted→`reversed`, reason + audit) or marking it **`disputed`** — with **no
     edited balance** anywhere?
  4. Does the new **"Reversed" tag** (task `R-03`) now appear alongside "Approved" on
     a reversed money-movement / resolved-dispute item in the queue and dashboard,
     not just in the detail panel?

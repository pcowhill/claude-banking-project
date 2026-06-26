# Feedback — v0.5.0 (Operations simulator core) review

- Milestone reviewed: v0.5.0
- Date/time: 2026-06-26 01:55 (UTC; Claude Code Cloud session clock)
- Source session label (if known): "v0.5.0 review" → start of v0.6.0 session

## Raw feedback (verbatim — DO NOT EDIT)

> ```
> ## My human review feedback for v0.5.0
>
> One small bug I noticed is that when I am inside Meridian Ops, in the Request queues page, if I open one of the requests, it has the approve, reject, etc buttons apper on the right.  However, if I click the approve button on the left, sometimes the buttons do not deactivate when I believe that they should.  Furthermore, I would like to be able to leave a note even after I have clicked the button.  Could you add that?  Also, I notice that when I approve or reject the Mobile check deposit within Meridian Ops, the equivalent line item within the Customer's account is still "Pending".  This may be correct for this version of the code, but should this update in response to the action taken within the Meridian Ops to not be pending anymore?  If so, could you please implement this.  If not, could you include an explanation of that in this new version's review documents.  Also, for the Simulated Messaging, I am not  certain at the moment what that is used for other than adding to the simulated event feed.  Will these eventually play a role?  For example, if a customer tries logging in with 2FA, can this be used to simulate an SMS or email or MFA or something?  Can you leave an explanation of this within this new version's review documenta.  Everything else looks great.
> ```

## Claude's interpretation

The human reviewed v0.5.0 (the operations simulator core) and is broadly happy
("Everything else looks great."). They raised **two concrete change requests**,
**one conditional change request framed as a question**, and **one pure
question** that asks for an explanation in the review docs. Taken together this
is **approval to proceed with v0.6.0**, plus a small set of v0.5.0 review
follow-ups to fold into the v0.6.0 session (exactly as the v0.3.0 review's
`R-01`/`R-02` were folded into the v0.4.0 session). Nothing here re-scopes the
milestone away from **v0.6.0 — Onboarding and account opening**; it adds two
small, accepted ops-console fixes ahead of the onboarding work and assigns two
documentation answers to the handoff docs.

Breaking the feedback into its four parts:

### 1. Bug — detail-panel action buttons don't always deactivate — ACCEPTED (fix)

> "if I open one of the requests, it has the approve, reject, etc buttons apper
> on the right. However, if I click the approve button on the left, sometimes
> the buttons do not deactivate when I believe that they should."

**Confirmed real bug, with a precise root cause.** On the Request queues page
(`apps/operations/src/pages/RequestQueues.tsx`) the **left** column is the live
list of queue cards (`QueueRequestCard`, each with its own `ActionBar`
quick-actions) and the **right** column is the `RequestDetailPanel` (also with an
`ActionBar`). The two action bars are driven by **different copies of the request
status**:

- The left cards read `request.status` from the shared `OpsDataProvider`
  (`requests` state). When you approve from a card, `act()` upserts the updated
  request into that shared state, so the **card's** buttons disable correctly.
- The right `RequestDetailPanel` keeps its **own independent** `detail` state,
  fetched once via `fetchOpsRequestDetail` and only refreshed by the panel's
  **own** `handleAction`. It does **not** observe the shared `requests` state, so
  an action taken from the **left card** (or via Socket.IO from another operator)
  never updates the panel's `detail.status` → the **panel's** approve/reject
  buttons stay enabled even though the request is now terminal. That is the
  "sometimes the buttons do not deactivate" the human saw (it happens precisely
  when the detail panel is open on the same request acted on from the card or by
  someone else).

**Fix:** drive the detail panel's status badge + action bar from the **live**
shared queue copy (look the request up by id in the provider's `requests`), and
re-load the panel's history/events when that live copy's `updatedAt` advances —
so the panel reflects actions from the card, the socket, and other operators.
Tracked as **`B-01`** (operations frontend; covered by an e2e regression).

### 2. Feature — allow a note after the decision — ACCEPTED (implement)

> "I would like to be able to leave a note even after I have clicked the button.
> Could you add that?"

Today the note textarea is **coupled to a decision**: typing a note and then
clicking approve/reject/hold/request-info attaches the note to *that* action,
and once a request is terminal (approved/rejected) all four buttons disable —
leaving **no way to annotate a resolved request**. The human wants to record a
note at **any time, including after the decision**.

**Implementation (reusing the v0.5.0 action service + audit + real-time, per the
constitution's "reuse, don't reinvent" rule):** add a non-decision **`note`**
action that writes an `AuditLog` row **without changing workflow status** and is
**allowed even on terminal requests**. It flows through the same
`applyOperatorAction` service, the same `/api/ops/requests/:id/action` route, and
the same Socket.IO "request updated" emit, so it appears in the request's History
and re-syncs every console. The detail panel gains a dedicated **"Add note"**
button (always enabled when the note box is non-empty) next to the existing
decision `ActionBar` (still disabled when terminal). Tracked as **`B-02`**
(shared contract → backend → tests → ops UI; **serialized** because it touches the
shared contract + the action service + routing + real-time — all risky shared
areas). **Money discipline is unchanged:** a note posts nothing to the ledger.

### 3. Question/conditional — should approving a Mobile check deposit un-"Pending" the customer's line? — DEFERRED to v0.7.0, with explanation

> "when I approve or reject the Mobile check deposit within Meridian Ops, the
> equivalent line item within the Customer's account is still 'Pending'. … should
> this update …? If so, could you please implement this. If not, could you
> include an explanation … in this new version's review documents."

**Answer: it is correct that it does *not* update yet, and we will explain why in
the v0.6.0 review docs rather than implement it now.** Rationale:

- v0.5.0 deliberately makes operator actions **workflow-only**: they change a
  request's status + write audit + push real-time — they **never move money**.
  The seeded "Mobile check deposit" line in the customer's account is a **pending
  `LedgerEntry`**. Flipping it pending → posted **changes the account's derived
  available balance** — i.e. it is a **money-movement** event, which the roadmap
  places squarely in **v0.7.0 — Money movement** (mobile check deposit is listed
  there explicitly), not in onboarding.
- v0.6.0 *does* introduce the **first** "an ops approval has a ledger effect"
  path — but only for the **narrow, safe** case of **initial funding at account
  opening**, where money **enters** via an explicit **bank-originated** ledger
  event (seed/deposit), audited, balances still derived. Posting an existing
  pending deposit (with the holds/availability/reversal rules that go with real
  deposit posting) is intentionally **out of scope** for onboarding so we don't
  ship a half-built deposit-posting path ahead of the milestone that designs it.
- **What v0.7.0 will do:** wire deposit-review approval → post the pending
  `LedgerEntry` (status pending → posted) → the customer's line flips from
  *Pending* to *Posted* and the available balance updates — all within ledger
  discipline (no stored/edited balance; an audited, bank-originated transition).

This explanation goes into `HUMAN_REVIEW_v0.6.md` and the milestone report.
Tracked as documentation item **`Q-01`** (no code this milestone).

### 4. Question — what is Simulated Messaging for; will it play a real role (e.g. 2FA)? — ANSWERED in review docs (and partially realized in v0.6.0)

> "for the Simulated Messaging, I am not certain … what that is used for other
> than adding to the simulated event feed. Will these eventually play a role? For
> example, if a customer tries logging in with 2FA, can this be used to simulate
> an SMS or email or MFA or something? Can you leave an explanation of this …"

**Yes — it is the seam where a real provider *would* plug in but, by the
simulation-safety rules, never does.** Explanation (expanded in
`HUMAN_REVIEW_v0.6.md`):

- **Today (v0.5.0):** "Simulated Messaging" is an **operator tool** to manually
  generate clearly-labelled SMS/email/MFA/identity events into the feed, and
  `request_info` already **auto-spawns** a simulated email. It demonstrates the
  channel end-to-end (event → feed → linked to a request) without any real
  provider.
- **Future role — yes, exactly the 2FA example:** the `SimulatedEvent` model is
  the single place the system records "a message/verification went out or came
  back." When customer-facing **MFA / identity verification** lands — beginning in
  **v0.6.0 onboarding** (identity-verification + MFA steps will emit simulated
  events, e.g. a verification code "sent" to the applicant) and continuing with
  the deferred **2FA-at-login / new-device** flows in the auth theme — a login or
  onboarding step will create a `SimulatedEvent` (an OTP "sent" via SMS/email,
  an MFA challenge, an identity check), the operator console will show it, and an
  operator can approve/deny the verification. The event is always **simulated**;
  the seam exists so a real integration could be added later but is intentionally
  never wired in this experiment. v0.6.0 makes the **first real use** of it
  (onboarding identity/MFA), which is the start of the answer to "will these
  eventually play a role?" — yes.

Tracked as documentation item **`Q-02`** (explanation in the review docs;
onboarding's identity/MFA events in v0.6.0 are the first concrete use).

### v0.6.0 approval — ACCEPTED (no re-scope)

Proceed with **v0.6.0 — Onboarding and account opening** this session, per the
ROADMAP / NEXT_SESSION acceptance targets: a clearly-simulated **open-account
flow**, **identity verification + MFA** surfaced as ops work items, an **initial
funding** that enters only via a **bank-originated ledger event**, a
**joint-account invitation**, **operations approval/rejection that feeds the
v0.5.0 queue** (reuse `OperationsRequest` + the action service + the real-time
channel — approving onboarding is what creates the user/account/initial-funding),
and **admin-created demo users**. Schema/seed + routing + real-time + RBAC + the
ledger are **risky shared areas → serialized and reviewed**; balances stay
DERIVED; `npm run verify` stays green; the simulation disclaimer stays visible;
v0.2.0 auth / v0.3.0 site / v0.4.0 dashboard / v0.5.0 ops console are not
regressed.

## Resulting task changes

- **Added v0.5.0 review follow-ups `B-01`, `B-02` and documentation items
  `Q-01`, `Q-02`** to `TASK_BOARD.md`, folded into the v0.6.0 session and done
  **before/alongside** the onboarding work (`B-01` is a self-contained ops-UI fix;
  `B-02` is serialized through the shared contract → backend → UI because it
  touches the action service + routing + real-time).
- **Added the v0.6.0 onboarding task group `N-01…N-xx`** to `TASK_BOARD.md`,
  decomposed from the ROADMAP / NEXT_SESSION acceptance targets.
- **No change to milestone order or the broader roadmap.** v0.6.0 proceeds as the
  already-planned next milestone; the deposit-posting request (item 3) is recorded
  as an explicit **v0.7.0** acceptance note, not a roadmap change.

## Accepted feedback

- **Detail-panel buttons not deactivating (`B-01`)** — accepted as a real bug;
  fixed by syncing the detail panel to the live shared queue state.
- **Leave a note after the decision (`B-02`)** — accepted; implemented as a
  non-decision `note` action (audited, real-time, always allowed) plus an "Add
  note" affordance, reusing the v0.5.0 action service.
- **"Everything else looks great." + proceed** — accepted as approval to begin
  **v0.6.0 — Onboarding and account opening**, keeping the gate green and the
  disclaimer visible, stopping at the v0.6.0 gate with full handoff docs.

## Deferred feedback

- **Approving a Mobile check deposit should un-"Pending" the customer's line
  (`Q-01`)** — **deferred to v0.7.0 — Money movement** (it is a money-movement /
  ledger-posting change; doing it now would ship a partial deposit-posting path
  ahead of the milestone that designs holds/availability/reversals). Explained in
  full in `HUMAN_REVIEW_v0.6.md` and the milestone report, per the human's "if
  not, include an explanation" instruction.

## Rejected or modified feedback

None rejected. Item 3 (deposit posting) is **deferred with explanation** (the
human explicitly offered that path), not rejected.

## Questions carried forward

- **Simulated Messaging's role (`Q-02`)** — answered in `HUMAN_REVIEW_v0.6.md`
  (it is the simulated provider seam; onboarding identity/MFA in v0.6.0 is its
  first real use; 2FA-at-login uses it when that auth sub-feature lands). No open
  question blocking v0.6.0.
- One non-blocking note for the next gate: v0.6.0 introduces the **first ops
  approval with a real create/ledger effect** (onboarding approval →
  user/account/initial-funding). This is a designated risky shared area (schema +
  routing + real-time + ledger) and is built serially, audited, and reviewed,
  with the money invariant (value enters only via bank-originated events) held.

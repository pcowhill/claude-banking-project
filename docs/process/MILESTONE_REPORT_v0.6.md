# MILESTONE REPORT — v0.6.0 (Onboarding and account opening)

- **Date:** 2026-06-26
- **Status:** ✅ Complete (gate green; tagged `v0.6.0`)
- **Branch:** `claude/jolly-ritchie-jue5dr` (session/milestone branch; intended
  name `milestone/v0.6-onboarding`)
- **Session:** 6 of the experiment

## Objective

Turn the `/open-account` placeholder into a real, clearly-simulated account-opening
flow that **feeds the v0.5.0 operations queue**, and make an operator **approval**
provision a real `User` + `Account` + **initial funding** — the first operator
action with a create/ledger effect. Plus joint-account invitations and
admin-created demo users. Address the v0.5.0 review: two ops-console fixes (B-01
detail-panel buttons not deactivating; B-02 add a note after the decision) and two
written answers (Q-01 deposit "Pending"; Q-02 what Simulated Messaging is for).
Keep balances **DERIVED**, initial funding **bank-originated + audited**, the gate
green, the disclaimer visible, and do not regress v0.2.0–v0.5.0. Human approved
("Everything else looks great.").

## Delivered

| Area | Delivered |
| --- | --- |
| Shared contract (N-01) | `@simbank/shared/onboarding`: products/statuses/invitation enums, funding bounds, the `OpenAccount` / invitation / admin-create DTOs, and PURE validators (`validateOpenAccount`, `validateInvitation`, `validateAdminCreateUser`) reused by client + server; plus a non-decision **`note`** action added to `operations.ts` (`nextStatusForAction`→null, `canApplyAction`→true always) WITHOUT a fifth decision button |
| Schema + migration (N-02) | New `OnboardingApplication` (1:1 with its `OperationsRequest`; holds the bcrypt hash server-side, never in a DTO) + `AccountInvitation`; **additive** migration `onboarding` (second since v0.2.0) — money/auth/ops tables untouched |
| Seed (N-03) | An **approvable** onboarding application (Taylor Prospect → Everyday Checking, $250 opening deposit) backing the seeded `onboarding` queue item + a **pending** joint invitation (Avery → Jordan on savings); new `assertSeedOnboardingIntegrity` invariants (incl. a guard that an applicant email isn't an existing user); money + access + ops invariants still pass |
| Onboarding service + provisioning (N-04) | `ops/onboarding.ts`: public `submitApplication` (application + linked queue item + identity/MFA/email simulated events; no user/account/money); `provisionApprovedOnboarding` runs inside the ops **approve** path in a transaction → creates user + account + owner grant + a **bank-originated posted `deposit`** for the opening deposit (audited); `onboardingApprovalBlocker` (duplicate-email guard); `rejectOnboardingApplication` |
| Joint invitations (N-05) | `ops/invitations.ts`: owner-only `inviteJoint` (+ simulated email + audit); `acceptInvitation` → a `joint` `AccountAccess` grant (the same grant RBAC reads) + audit; `declineInvitation`; typed `InvitationError` (404/403/409) |
| Admin user provisioning (N-06) | `ops/admin-users.ts`: `adminCreateUser` (+ optional account; funding is an **audited `adjustment` requiring a reason**); returns the non-secret demo credentials |
| Routes + real-time (N-07) | `routes/onboarding.ts` (public submit; auth invite/list/accept/decline) + admin `POST /api/admin/users` in `routes/ops.ts`; registered; submit + invite + provisioning **emit to the operators room** via the v0.5.0 `app.opsRealtime` channel — no new ops endpoint, no new socket event |
| `note` action backend (N-08) | `applyOperatorAction` note branch: audit row, no status change, allowed on terminal, touches `updatedAt`, emits "updated"; route accepts `note` + requires note text; writes no ledger |
| Customer UI (N-09/N-10) | `OpenAccount.tsx` reworked into a real simulated application → confirmation (shared validator reused, `lib/onboarding.ts`); an **Invitations inbox** on the dashboard (accept/decline → account appears) and an owner-only **Invite a joint owner** form on account detail (`lib/invitations.ts`) |
| Operations UI (N-11) | **B-01** fix: `RequestDetailPanel` reads the live shared queue copy → status badge + ActionBar deactivate from anywhere; reloads history when the live copy advances. **B-02**: an always-available **"Add note"** button. Onboarding **application context** in the panel. An admin-only **Create demo user** page (`pages/AdminUsers.tsx` + `lib/adminApi.ts`) with an admin-only nav link |
| Versioning | Platform bumped to `0.6.0` (shared meta + 5 `package.json` + lockfile) |
| Tests | 145 → **189** Vitest unit/integration; 25 → **30** Playwright e2e |

## v0.5.0 review items (folded into this session)

| Item | Outcome |
| --- | --- |
| **B-01** — detail-panel action buttons don't deactivate when a request is resolved from the queue card / socket | **Fixed.** The panel was driven by its own stale copy; it now reads the live shared queue state. e2e regression in `onboarding.spec.ts`. |
| **B-02** — "leave a note even after I have clicked the button" | **Added.** A non-decision `note` action (audited, no status change, allowed on terminal) + an always-available "Add note" button, reusing the v0.5.0 action service/route/real-time. e2e covers add-note-after-decision. |
| **Q-01** — should approving a Mobile check deposit un-"Pending" the customer's line? | **Deferred to v0.7.0 with explanation** (it is money movement; explained in `HUMAN_REVIEW_v0.6.md` + recorded as a v0.7.0 acceptance note in ROADMAP/NEXT_SESSION_PROMPT). |
| **Q-02** — what is Simulated Messaging for; will it play a real role (2FA)? | **Answered** in `HUMAN_REVIEW_v0.6.md`: it is the simulated provider seam; v0.6.0 onboarding identity/MFA is its first real use; 2FA-at-login uses the same `SimulatedEvent` model when that auth sub-feature lands. |

## Acceptance criteria check

| Criterion (from ROADMAP / NEXT_SESSION) | Status |
| --- | --- |
| Open-account flow (real, clearly simulated) | ✅ `/open-account` is a working application → confirmation |
| Identity verification + MFA surfaced as ops work items | ✅ onboarding emits identity/MFA/email `SimulatedEvent`s linked to the queue item |
| Initial funding via a bank-originated ledger event | ✅ approval posts a posted `deposit` entry, audited; settled-total invariant asserted |
| Joint-account invitation → `AccountAccess` on acceptance | ✅ owner-only invite; accept → `joint` grant; invitee then sees the account |
| Operations approval/rejection feeding the v0.5.0 queue | ✅ reuses `OperationsRequest` + the action service + the real-time channel; approval provisions |
| Admin-created demo users | ✅ admin create-user (+ optional audited funded account) |
| Balances DERIVED; money discipline preserved | ✅ value enters only via bank-originated events; balances derived; asserted |
| Simulation disclaimer visible | ✅ new UI carries the disclaimer + simulated labels |
| No regression of v0.2.0 / v0.3.0 / v0.4.0 / v0.5.0 | ✅ all prior unit + e2e green |
| `npm run verify` passes; tag `v0.6.0` | ✅ (tag push blocked by env policy — see below) |
| Stop after v0.6.0; do not start v0.7.0 | ✅ |

## Key design decisions

- **The first approval with a ledger effect, kept inside the discipline.** v0.5.0
  actions were workflow-only; v0.6.0 lets an onboarding **approval** create money —
  but only as an explicit **bank-originated, posted `deposit`** ledger entry,
  written **inside the same transaction** as the status change, audited, and
  precondition-guarded (a duplicate email blocks + rolls back). A test asserts the
  system-wide settled total moves by **exactly** the funded amount. Balances stay
  derived; nothing else creates money (submit/note/invite post nothing).
- **Reuse, don't reinvent (the review's instruction).** The open-account submission
  is an `OperationsRequest` of type `onboarding` on the SAME queue, through the SAME
  action service + route + Socket.IO channel — no new ops endpoint, no new socket
  event. The `note` action is the same service/route/audit/real-time, just
  non-decision. Joint-invite acceptance creates the same `joint` `AccountAccess`
  grant RBAC already reads. Onboarding identity/MFA + the invite "email" are the
  existing `SimulatedEvent` seam (the answer to Q-02), now driven by a real flow.
- **The applicant password never leaves the server.** It is bcrypt-hashed at submit
  and stored only on `OnboardingApplication`; it is never serialized into the queue
  DTO/payload an operator sees (regression-tested), and is copied to the new `User`
  at provisioning so the applicant signs in with the password they chose.
- **Contract locked first, then the risky backend serially, then parallel UI.**
  `N-01` shared contract (unit-tested) → `N-02` schema/migration (additive,
  verified) → `N-03` seed → `N-04…N-08` services + routes + the note action
  (backend integration tests green, incl. the money invariant + RBAC matrix) →
  only then the two frontends parallelized across app agents against the locked
  contract → security review → e2e + gate.

## Verification evidence

- `npm run verify` → lint ✓ (0 warnings), typecheck ✓ (4 workspaces), test ✓
  (**189/189**), build ✓ (3 apps).
- `npm run test:e2e` → **30/30** passed (Chromium): the new `onboarding.spec.ts`
  (customer open-account → confirmation; operator onboarding context + approve
  (B-01) + add-note-after (B-02); admin Create-demo-user page gating; a pending
  invitation in the customer inbox) plus all prior specs (the one open-account
  placeholder test was updated for the new working form).
- `npm run db:reset` seeds 4 users, 2 accounts, 56 ledger entries, 10 ops requests,
  4 simulated events, **1 onboarding application, 1 invitation**; the money +
  access + ops + onboarding invariants hold.

## Security review

Ran the read-only Security/Permissions reviewer before the gate. **Verdict: PASS**
— no Critical / High / Medium findings. Verified: the applicant password is hashed
immediately and **never** serialized into any DTO/queue payload (regression-tested);
every new route is correctly gated (public submit creates nothing on its own;
**owner-only** invite; accept strictly invitee-email-gated and can't grant arbitrary
access; admin-only create-user + roster; ops-only note); money discipline + audit
coverage hold (funding is bank-originated + audited; provisioning atomic +
guarded); all free text is length-bounded twice and email normalized; messaging is
`SimulatedEvent`-only with no real-provider code and the disclaimer is in the new
UI; v0.2.0 auth / v0.3.0 isolation / the `/api/admin/users` no-hash guarantee /
v0.5.0 socket-room RBAC are intact. The v0.5.0 **Low SEC-4** (cap a user-supplied
applicant name) is **closed** (`validateOpenAccount` bounds it). Three new **Low**
hardening notes (SEC-5 public endpoint unthrottled; SEC-6 admin can mint admins —
intended + audited; SEC-7 invite-before-user — by design) are accepted and tracked
in `QUALITY_REPORT.md`; the reviewer's seed-integrity suggestion was applied.

## Execution notes

The risky shared areas — the **contract**, the **Prisma schema/migration**, the
**ledger** (initial funding), and the new **routing** + **real-time** wiring — were
built **serially, first, and reviewed**, and the API contract was **locked** before
the two frontends were parallelized on it (the customer open-account/invitations app
and the operations B-01/B-02/onboarding/admin app, on separate app agents). A
read-only security review ran before the gate.

## Git: branch, tag, and merge (manual steps for the human)

Built and pushed on the Claude Code Cloud session branch
`claude/jolly-ritchie-jue5dr` (intended name `milestone/v0.6-onboarding`). No PR
opened (none requested). The annotated tag `v0.6.0` is created locally on the
milestone commit, but **pushing tags is blocked by this environment's git egress
policy (HTTP 403)** — only the session branch is pushable here. To adopt the
milestone, after reviewing the branch run locally:

```bash
git fetch origin
git checkout main
git merge --no-ff origin/claude/jolly-ritchie-jue5dr
git tag -a v0.6.0 -m "v0.6.0 — Onboarding and account opening"
git push origin main
git push origin v0.6.0
```

## Deviations / honest caveats

- **Tag push** blocked by environment policy (above) — local tag exists; human
  pushes it on merge.
- **Deposit posting (pending → posted) is deferred to v0.7.0** (the review's Q-01) —
  approving an existing pending deposit does not yet flip the customer's line; that
  is money movement. v0.6.0 only creates money for **account opening**.
- **Customer-facing 2FA at login** stays deferred (the review's Q-02) — v0.6.0 uses
  the simulated-messaging seam for **onboarding** identity/MFA only.
- **Frontend component unit tests remain deferred** — the new UI is covered by build
  + the Playwright journeys + the backend/contract tests (+ the pure onboarding
  validators are unit-tested in shared); consistent with prior milestones.
- **Sandbox-only setup:** same Prisma engine mirror + Playwright executable-path
  hook as Sessions 1–5; neither affects normal machines or CI. This session created
  the real `onboarding` migration through the mirrored schema engine.

## Blockers

None.

## Handoff

- Review guide: `docs/process/HUMAN_REVIEW_v0.6.md` (includes the Q-01 / Q-02
  answers the human asked for).
- Next-session prompt: `docs/process/NEXT_SESSION_PROMPT_v0.6.md`.
- Next milestone: **v0.7.0 — Money movement** (not started), carrying the Q-01
  deposit-posting acceptance note.

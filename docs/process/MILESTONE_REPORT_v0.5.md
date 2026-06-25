# MILESTONE REPORT — v0.5.0 (Operations simulator core)

- **Date:** 2026-06-25
- **Status:** ✅ Complete (gate green; tagged `v0.5.0`)
- **Branch:** `claude/epic-noether-wk05jc` (session/milestone branch; intended
  name `milestone/v0.5-operations-core`)
- **Session:** 5 of the experiment

## Objective

Turn the operations console's placeholders into a live, WebSocket-driven
workflow: pending request queues driven by real data, operator actions
(approve / reject / hold / request-more-info) each audited, real-time updates
over Socket.IO, and clearly-labelled simulated external events (SMS / email /
MFA / identity). Keep balances **DERIVED**, keep `npm run verify` green, keep the
simulation disclaimer visible, and do not regress v0.2.0 auth, the v0.3.0 public
site, or the v0.4.0 customer dashboard. Human approved starting v0.5.0
("Everything looks good so far. Keep moving forward toward the next milestone.").

## Delivered

| Area | Delivered |
| --- | --- |
| Shared contract (O-01) | `@simbank/shared/operations`: action/priority/channel enums, a pure **action state machine** (`nextStatusForAction`, `isTerminalOpsStatus`, `canApplyAction`), `OperationsRequestDTO` + detail + `OperatorActionLogDTO` + `SimulatedEventDTO`, the API request/response DTOs, socket payload types, label/`OPS_QUEUES` helpers, `countRequestsByStatus`; ops socket-event names + `OPS_REALTIME_ROOM` in `constants.ts` |
| Schema + migration (O-02) | Fleshed-out `OperationsRequest` (priority, detail, subject, last-action bookkeeping, resolvedAt) + new `SimulatedEvent` model; **additive** migration `operations_core` (first since v0.2.0) — money/auth tables untouched |
| Seed (O-03) | A dated, varied **pending** queue (10 items: identity / MFA / fraud / deposit / support / external-acct / password-reset / onboarding / ACH / dispute) across the demo users + 4 seeded simulated events, each request with an intake audit row; new `assertSeedOpsIntegrity` invariants; money + access invariants still pass |
| Service (O-04) | `src/ops/requests.ts`: list (+filter) / detail (history from `AuditLog` + linked events) / `applyOperatorAction` (validated transition, persisted, audited, `request_info` auto-spawns a simulated email) / `createSimulatedEvent`; typed `OpsActionError` (404 / 409 / 400) |
| Real-time (O-05) | `src/ops/realtime.ts`: `OpsRealtime` publisher (Socket.IO impl + no-op default + recording double) decorated onto the app; `attachRealtime` resolves the **operations** session cookie at handshake and joins only `ops_agent`/`admin` to the `ops` room; events broadcast to that room only |
| Routes (O-06) | `routes/ops.ts`: `/api/ops/requests` (+counts/filters), `:id` detail, `:id/action`, `/simulate/event`, `/events`; all `requireRole('ops_agent','admin')`; `/api/ops/summary` extended (per-status counts) backward-compatibly; mutations emit real-time updates |
| Console — queues (O-07) | One `OpsDataProvider` (single socket + live queue/feed); Request queues page with status + queue-lane filters, approve/reject/hold/request-info quick actions, a detail panel (history, linked events, optional note), live `ops:request_changed` apply, a **Live** indicator |
| Console — messaging (O-08) | Simulated messaging page (clearly-labelled SMS/email/MFA/identity generators + a live event feed via `ops:external_event`); dashboard reworked into a live overview (open count, per-status snapshot, needs-attention list, recent events); nav switched to real `NavLink`s |
| Versioning | Platform bumped to `0.5.0` (shared meta + 5 `package.json` + lockfile) |
| Tests | 93 → **145** Vitest unit/integration; 22 → **25** Playwright e2e |

## Acceptance criteria check

| Criterion (from ROADMAP / NEXT_SESSION) | Status |
| --- | --- |
| Pending request queues from real data | ✅ live `/api/ops/requests`; placeholders replaced |
| Approve / reject / hold / request-more-info actions | ✅ state machine + routes + console action bar |
| Audit log of operator actions | ✅ every action + simulated event writes an `AuditLog` row (actor + reason + from/to) |
| Real-time updates over WebSockets | ✅ Socket.IO `ops:request_changed` / `ops:external_event` to the operators room; console applies live |
| Simulated SMS/email/MFA/identity events | ✅ `SimulatedEvent` + messaging panel; clearly labelled simulated, no real provider |
| RBAC (ops_agent/admin only) | ✅ every route role-gated; socket room gated by session cookie; tested |
| Balances DERIVED; money discipline preserved | ✅ actions never write the ledger (asserted) |
| Simulation disclaimer visible | ✅ banner + footer + explicit "no real provider" copy |
| No regression of v0.2.0 / v0.3.0 / v0.4.0 | ✅ all prior unit + e2e green |
| `npm run verify` passes; tag `v0.5.0` | ✅ (tag push blocked by env policy — see below) |
| Stop after v0.5.0; do not start v0.6.0 | ✅ |

## Key design decisions

- **Money discipline kept intact.** An operator action in v0.5.0 changes a
  request's **workflow status** and writes an audit row — it never posts to the
  ledger. The ledger effects of an approval (a deposit clearing, an ACH posting)
  belong to money movement in v0.7.0. A test asserts "operator actions never
  create ledger entries," so the discipline is enforced, not just intended.
- **The contract was locked first.** The shared `operations.ts` (DTOs + the pure
  action state machine + socket payloads) was written and unit-tested before any
  backend or UI, so the schema, service, routes, and the console all built on one
  agreed shape. This is what let the (otherwise risky) real-time + routing work
  proceed without churn.
- **Socket RBAC by room, decided at the handshake.** Both apps share one
  Socket.IO server, so ops events are emitted to an `ops` room that only a valid
  `ops_agent`/`admin` **operations** session joins (the cookie is resolved at
  handshake from the request Origin, reusing the v0.3.0 per-surface cookie logic).
  Customer and anonymous sockets connect for `welcome`/`heartbeat` but never join
  the room, so they can never receive operator-facing payloads. Default-deny.
- **Testable real-time.** Routes emit through an injected `OpsRealtime` publisher
  (a no-op by default, a Socket.IO impl at runtime, a recording double in tests),
  so route tests assert emissions via `app.inject` with no open socket, and a
  separate integration test exercises the real handshake/join path.
- **One live data context on the client.** A single `OpsDataProvider` owns one
  socket + the in-memory queue/feed; actions update optimistically and the socket
  echoes idempotently (by id) and delivers other operators' changes — so every
  screen stays in sync without redundant connections.

## Verification evidence

- `npm run verify` → lint ✓ (0 warnings), typecheck ✓ (4 workspaces), test ✓
  (**145/145**), build ✓ (3 apps).
- `npm run test:e2e` → **25/25** passed (Chromium): the new `operations.spec.ts`
  (operator → live dashboard; action a queue item and see it update; send a
  simulated event and see it appear live) plus all prior auth / public-site /
  dashboard / session-isolation / smoke specs.
- **Live socket + RBAC check** against the running backend (Node `socket.io-client`):
  an operator socket received `ops:request_changed` (after approving a pending
  request → `approved`) **and** `ops:external_event`, while a **customer socket
  received nothing** — confirming room scoping. This behavior is now also a
  committed integration test (`apps/backend/src/realtime.test.ts`).
- `npm run db:reset` seeds 4 users, 2 accounts, 56 ledger entries, **10 ops
  requests, 4 simulated events**; the money + access + ops invariants hold.

## Security review

Ran the read-only Security/Permissions reviewer before the gate. **Verdict: PASS**
— no Critical or High findings. Verified: every `/api/ops/*` route is auth- +
role-gated (customers/joint → 403, asserted); ops events broadcast to the `ops`
room only with default-deny join logic; operator actions write **no** ledger
entries (asserted) and every action + simulated event is audited; inputs are
validated against the shared enums with note/summary caps and a clamped `limit`;
no real provider SDKs/URLs and the simulated events are labelled simulated in code
+ UI; no secrets (only the documented NON-SECRET bcrypt-hashed demo passwords);
and v0.2.0 auth / v0.3.0 per-surface session isolation / the `/api/admin/users`
no-hash guarantee are intact. The one **Medium** — that the socket-room RBAC had
no automated test — was **addressed in this milestone** (`realtime.test.ts`, real
clients). Two **Low** notes: the detail route's 403 is now in the RBAC test loop;
capping a future user-supplied `subjectName` is tracked in `QUALITY_REPORT.md` for
when intake becomes user-facing (v0.6.0). Pre-existing hardening follow-ups (CSRF,
config-driven cookie `secure`, helmet + rate-limit, dev-tooling advisories) remain
tracked.

## Execution notes

The risky shared areas — the **contract**, the **Prisma schema/migration** (the
first since v0.2.0), the new **routing**, and the **real-time channel + socket
RBAC** — were built **serially, first, and reviewed**, and the API + socket-event
contract was **locked** before the operations frontend was built on it: O-01
contract (unit-tested) → O-02 schema/migration (additive, verified) → O-03 seed
(invariants) → O-04 service → O-05 real-time publisher + socket RBAC → O-06 routes
(backend tests green, live socket check) → O-07/O-08 console → O-09 tests/e2e →
O-10 security review + handoff. A read-only security review ran before the gate and
its one Medium was closed in-milestone.

## Git: branch, tag, and merge (manual steps for the human)

Built and pushed on the Claude Code Cloud session branch
`claude/epic-noether-wk05jc` (intended name `milestone/v0.5-operations-core`). No
PR opened (none requested). The annotated tag `v0.5.0` is created locally on the
milestone commit, but **pushing tags is blocked by this environment's git egress
policy (HTTP 403)** — only the session branch is pushable here. To adopt the
milestone, after reviewing the branch run locally:

```bash
git fetch origin
git checkout main
git merge --no-ff origin/claude/epic-noether-wk05jc
git tag -a v0.5.0 -m "v0.5.0 — Operations simulator core"
git push origin main
git push origin v0.5.0
```

## Deviations / honest caveats

- **Tag push** blocked by environment policy (above) — local tag exists; human
  pushes it on merge.
- **Operator actions are workflow-only** in v0.5.0 — approving a deposit/ACH does
  **not** move money or post to the ledger (that arrives with money movement in
  v0.7.0). This is deliberate and asserted by a test.
- **Simulated events are recorded, never sent.** No SMS/email/MFA/identity
  provider is ever contacted; the rows are clearly labelled simulated.
- **Frontend component unit tests remain deferred** — the console is covered by
  the build + Playwright journeys + the backend/contract tests (consistent with
  prior milestones); tracked in `QUALITY_REPORT.md`.
- **Sandbox-only setup:** same Prisma engine mirror (engines fetched via curl,
  paths via `PRISMA_*` env) and Playwright executable-path hook as Sessions 1–4;
  neither affects normal machines or CI. This session also created a real Prisma
  **migration** (`operations_core`) through the mirrored schema engine.

## Blockers

None.

## Handoff

- Review guide: `docs/process/HUMAN_REVIEW_v0.5.md`.
- Next-session prompt: `docs/process/NEXT_SESSION_PROMPT_v0.5.md`.
- Next milestone: **v0.6.0 — Onboarding and account opening** (not started).

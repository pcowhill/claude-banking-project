# NEXT_SESSION

> Read this third (after `CLAUDE.md` and `docs/PROJECT_STATE.md`). It tells the
> next session exactly what to do.

## Where we are

`v0.1.0 — Project Foundation` is **complete** and tagged. The next planned
milestone is **`v0.2.0 — Auth, roles, and demo users`**.

## Session-start protocol (must do, in order)

1. Read `CLAUDE.md`, then `docs/PROJECT_STATE.md`, then this file.
2. **Save the human's pasted feedback VERBATIM** to
   `docs/process/feedback/FEEDBACK_v0.1_<YYYY-MM-DD_HHMM>.md` BEFORE acting on
   it. Use the structure described in `docs/process/HUMAN_FEEDBACK_LOG.md`. The
   raw block is never edited afterward.
   - If the feedback is only "continue" (or similar), still save it verbatim and
     treat it as approval to proceed with v0.2.0.
3. Interpret the feedback in that file (accepted / deferred / rejected with
   reasons / questions carried forward); update `docs/process/HUMAN_FEEDBACK_LOG.md`.
4. Update `docs/process/TASK_BOARD.md` (source of truth), and the roadmap/process
   logs if the feedback changes scope.
5. Do **only** v0.2.0 (or the re-scoped milestone the feedback approves).
6. Stop at the next gate and produce the milestone handoff docs.

## Planned scope for v0.2.0 — Auth, roles, and demo users

Acceptance targets (refine from feedback before building):

- Customer login and operations/admin login.
- **Real password hashing** (e.g. `bcrypt` or `argon2` — no custom crypto).
- Server-side **sessions** (cookie-based) with session timeout; account lockout
  after repeated failures.
- Seeded **demo users** for each role (customer, joint customer, ops agent,
  admin) — extend `apps/backend/src/seed-plan.ts`.
- **Role-based access control**: customers access only their own accounts; joint
  users only authorized accounts; ops/admin scoped appropriately.
- **Login history / audit logs** (write `AuditLog` rows on auth events).
- Initial **Playwright login tests** + auth unit/integration tests (including
  ownership/permission checks).
- Keep `npm run verify` green; update all docs at the gate.

### Suggested first steps
1. Plan tasks with the Milestone Planner role; record them in `TASK_BOARD.md`.
2. Backend first (serialize schema/auth changes): add auth tables/fields, session
   handling, hashing, RBAC middleware, login-history audit. Add tests.
3. Then wire the customer and operations login UIs to real endpoints.
4. Security/Permissions review before the gate (ownership checks everywhere).

## Guardrails
- Serialize risky shared areas (schema, auth, routing, CI, architecture).
- No secrets committed; `.env` stays ignored.
- Maintain the simulation disclaimer in README and both apps.
- Truthful state: if blocked, file a blocker and stop — do not tag the milestone.

## The copy/paste starter prompt
A ready-to-use prompt for a brand-new Claude Code Cloud session lives at
`docs/process/NEXT_SESSION_PROMPT_v0.1.md` (it includes the feedback
placeholder).

# CLAUDE.md — Project constitution & session protocol

> **Read this file first, every session.** It is the entry point for any Claude
> Code session working on this repository. The repo — not chat history — is the
> source of truth.

## What this project is

**Meridian** is a **local-first, fully simulated consumer banking platform**
built as a multi-session, milestone-gated AI development experiment. It is two
things at once:

1. A realistic simulated banking product (customer app + bank-operations
   simulator + backend).
2. An experiment in managing a larger AI-built software project across many
   milestone sessions, where the **process artifacts under `docs/` are as
   important as the code**.

### Hard safety rules (never violate)

- This is a **SIMULATION**. Never real money, real banking/payment rails, real
  SMS/email providers, or real external financial services.
- Never claim this is production or bank-grade software.
- No secrets in the repo. `.env` is git-ignored; only `.env.example` is tracked.
- No custom cryptography. When auth lands (v0.2.0), use a real password-hashing
  library and role-based access control.
- Keep the simulation disclaimer visible in the README and in both apps' UI.
- Money is modeled with a **disciplined ledger**: balances are DERIVED from an
  append-only ledger, never stored as an editable field. Money may only enter or
  leave via explicit bank-originated events (seed, interest, fee, adjustment,
  deposit). Admin adjustments require a reason and an audit log.

## Session start protocol (do this in order)

1. **Read `CLAUDE.md`** (this file).
2. **Read `docs/PROJECT_STATE.md`** — where the project actually is right now.
3. **Read `docs/NEXT_SESSION.md`** — the concrete plan for this session.
4. **Save the human's pasted feedback VERBATIM** before acting on it, to
   `docs/process/feedback/FEEDBACK_vX.Y_YYYY-MM-DD_HHMM.md` using the template in
   that folder's sibling docs (see `docs/process/HUMAN_FEEDBACK_LOG.md`). The
   raw/verbatim block must never be edited or paraphrased after it is saved.
   - If the only feedback is "continue" (or similar), STILL save it verbatim and
     interpret it as approval to proceed with the next planned milestone.
5. **Interpret the feedback** in the same file (accepted / deferred / rejected
   with reasons / questions carried forward).
6. **Update** the task board (`docs/process/TASK_BOARD.md`, the source of
   truth), the roadmap, and process logs if the feedback changes anything.
7. **Continue only the next approved milestone.** Do not skip ahead.
8. **Stop again at the next milestone gate** and produce the milestone handoff
   docs (see "Milestone end protocol").

## Milestone end protocol (do this before stopping)

Update all of these so a brand-new session can continue with zero chat history:

- `CHANGELOG.md`
- `docs/PROJECT_STATE.md`
- `docs/NEXT_SESSION.md`
- `docs/process/NEXT_SESSION_PROMPT_vX.Y.md`
- `docs/process/HUMAN_REVIEW_vX.Y.md`
- `docs/process/MILESTONE_REPORT_vX.Y.md`
- `docs/process/TASK_BOARD.md`
- `docs/process/EXPERIMENT_LOG.md`
- `docs/process/ROADMAP_HISTORY.md` (only if the roadmap changed)

A milestone is **complete only if `npm run verify` passes** and the apps run. If
a blocker prevents completion, do **not** tag the milestone — write a blocker
file under `docs/process/blockers/` and stop with a truthful report (see
"Blocker handling" in `docs/process/EXPERIMENT_LOG.md` and the spec).

## How to run things

| Command | What it does |
| --- | --- |
| `npm install` | Install all workspaces (runs Prisma client generate). |
| `npm run db:reset` | Recreate the SQLite DB (migrate + seed demo data). |
| `npm run dev` | Start backend + customer + operations together. |
| `npm run verify` | **The gate:** lint + typecheck + unit/integration tests + build. |
| `npm run test` | Vitest unit/integration tests only. |
| `npm run test:e2e` | Playwright smoke tests (needs browsers; see README). |

Recommended local ports: backend `:3000`, customer `:5173`, operations `:5174`.

## Repository map

```
apps/
  backend/      Fastify + Socket.IO + Prisma/SQLite API
  customer/     React + Vite customer app (public site + portal shell)
  operations/   React + Vite bank-operations simulator console
packages/
  shared/       Types, constants, brand tokens, money + ledger logic (tested)
assets/
  brand/        Logo SVG variants
  prompts/      IMAGE_GENERATION_PROMPTS.md
docs/
  PROJECT_STATE.md, NEXT_SESSION.md
  process/      Experiment logs, task board, reviews, ADRs, feedback, blockers
.claude/agents/ Controlled subagent role definitions
.github/workflows/ci.yml  GitHub Actions CI
```

## Controlled multi-agent workflow

Role definitions live in `.claude/agents/` (Milestone Planner, Backend/API,
Frontend Customer, Frontend Operations, Testing/QA, Security/Permissions
Reviewer, Process Scribe). Parallelize only clearly independent tasks. For
**risky shared areas — Prisma schema, auth, routing, project architecture, CI,
repo structure — serialize and review carefully.** If subagents are unavailable,
emulate the same plan → implement → test → review → scribe steps in sequence.

## Foundational documents (read as needed)

- `VISION.md` — why this exists and what "good" looks like.
- `PRODUCT_SPEC.md` — the product surface across roles and milestones.
- `TECHNICAL_ARCHITECTURE.md` — stack, structure, and key decisions.
- `ROADMAP.md` — v0.1.0 → v1.0.0 milestone plan.
- `QUALITY_BAR.md` — the bar every milestone must clear.
- `TEST_STRATEGY.md` — how we test.
- `docs/process/decisions/` — Architecture Decision Records (ADRs).

## Git workflow

- `main` represents the latest completed milestone.
- Work on a milestone branch (this experiment runs in Claude Code Cloud, which
  provisions a session branch such as `claude/...`; treat it as the milestone
  branch and document the intended `milestone/vX.Y-*` name in the milestone
  report).
- Run `npm run verify` before merging. Only merge to `main` if checks pass and
  the app runs. After merge, create an annotated tag `vX.Y.0`.
- **Do not create a pull request unless the human explicitly asks.**
- **Do not begin the next milestone until the human reviews and approves.**

---

_Current milestone: see `docs/PROJECT_STATE.md`. As of this writing the project
is at **v0.5.0 — Operations simulator core** (complete); next is v0.6.0._

# AGENT_HANDOFFS

How work is handed between agent roles (and between sessions). The roles are
defined in `.claude/agents/`. This log records handoffs so the chain of work is
auditable.

## Handoff rules

- **Source of truth is the repo**, especially `TASK_BOARD.md` and
  `docs/PROJECT_STATE.md`. A handoff means: the receiving role can act using only
  the repo, with no chat history.
- **Serialize risky shared areas** (Prisma schema, auth, routing, architecture,
  CI, repo structure). Do not have two agents edit these at once.
- Parallelize only clearly independent tasks (e.g. two unrelated UI surfaces).
- Each agent leaves the tree green (`npm run verify`) before handing off, or
  records exactly what is red and why.
- The **Process Scribe** opens each session (saving feedback verbatim) and closes
  it (updating handoff docs).

## Typical flow per milestone

```
Human feedback
   │  (Process Scribe saves verbatim → interprets)
   ▼
Milestone Planner ──► TASK_BOARD.md (dependency-ordered tasks)
   ▼
Backend/API ──► (schema/auth/routes, serialized)  ─┐
Frontend Customer ──► (independent UI)              ├─ implement
Frontend Operations ──► (independent UI)            ┘
   ▼
Testing/QA ──► tests + verify green
   ▼
Security/Permissions Reviewer ──► findings (read-only)
   ▼
Process Scribe ──► milestone report, human review, next-session prompt, state/next, tag
```

## Handoff log

### Session 1 — v0.1.0 (2026-06-25)

Executed in **emulated-sequential** mode (single session performing all roles in
order) because v0.1.0 is dominated by risky-shared-area work that must be
serialized.

| From | To | Handoff artifact | Notes |
| --- | --- | --- | --- |
| Planner | Backend | TASK_BOARD F-01..F-12 | Foundation tasks, dependency-ordered |
| Backend | Frontend ×2 | `@simbank/shared` + backend endpoints | Shared types/brand/ledger ready to consume |
| Frontend ×2 | Testing/QA | Two app shells | Smoke-testable; disclaimers present |
| Testing/QA | Security | `verify` green; 20+3 tests | Gate passing |
| Security | Scribe | Audit review | Runtime 0; dev-tool advisories logged |
| Scribe | Human (next session) | This handoff + milestone report + next-session prompt | Repo self-explanatory for a fresh session |

**To the next session:** start at `CLAUDE.md` → `PROJECT_STATE.md` →
`NEXT_SESSION.md`; save the human's feedback verbatim; then continue v0.2.0.

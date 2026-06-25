# NEXT_SESSION

> Read this third (after `CLAUDE.md` and `docs/PROJECT_STATE.md`). It tells the
> next session exactly what to do.

## Where we are

`v0.2.0 — Auth, roles, and demo users` is **complete** and tagged. The next
planned milestone is **`v0.3.0 — Public bank website and branding`**.

## Session-start protocol (must do, in order)

1. Read `CLAUDE.md`, then `docs/PROJECT_STATE.md`, then this file.
2. **Save the human's pasted feedback VERBATIM** to
   `docs/process/feedback/FEEDBACK_v0.2_<YYYY-MM-DD_HHMM>.md` BEFORE acting on
   it. Use the structure in `docs/process/HUMAN_FEEDBACK_LOG.md`. The raw block
   is never edited afterward.
   - If the feedback is only "continue" (or similar), still save it verbatim and
     treat it as approval to proceed with v0.3.0.
3. Interpret the feedback in that file (accepted / deferred / rejected with
   reasons / questions carried forward); update `docs/process/HUMAN_FEEDBACK_LOG.md`.
4. Update `docs/process/TASK_BOARD.md` (source of truth), and the roadmap/process
   logs if the feedback changes scope.
5. Do **only** v0.3.0 (or the re-scoped milestone the feedback approves).
6. Stop at the next gate and produce the milestone handoff docs.

## Planned scope for v0.3.0 — Public bank website and branding

Acceptance targets (refine from feedback before building):

- Polished **public home page** for the fictional bank (hero, value props,
  product highlights, trust/about, footer) — building on the existing brand
  tokens and Meridian logo.
- **Product marketing pages** (e.g. checking, savings, and an overview of cards /
  loans as "coming soon") — content-rich, clearly fictional.
- **Realistic AI-generated image placeholders** wired through the existing
  drop-in `ImagePlaceholder` (real files drop into
  `apps/customer/public/images/` with no code change) — extend
  `assets/prompts/IMAGE_GENERATION_PROMPTS.md` as needed.
- Clear **login / open-account entry points** from the public site (login already
  works as of v0.2.0; "open account" can route to login/onboarding placeholder
  until v0.6.0).
- **Responsive layout polish** across breakpoints; accessibility (semantic
  headings, alt text, labelled controls).
- Keep `npm run verify` green; keep the simulation disclaimer visible.

### Suggested first steps

1. Plan tasks with the Milestone Planner role; record them in `TASK_BOARD.md`.
2. This is mostly `apps/customer` (public surface) + `assets/` work — largely
   parallelizable once the page/route structure is agreed. The customer Frontend
   role leads; no schema/auth changes expected (keep those serialized if any
   arise).
3. Mind the authed vs public split: the marketing site is public; don't regress
   the v0.2.0 protected `/dashboard` or the session-aware nav.

## Guardrails
- Serialize risky shared areas (schema, auth, routing, CI, architecture).
- No secrets committed; `.env` stays ignored.
- Maintain the simulation disclaimer in README and both apps.
- Truthful state: if blocked, file a blocker and stop — do not tag the milestone.

## Sandbox note (Claude Code Cloud only)
Prisma's engine download and the Playwright Chromium build may not match through
the egress proxy. Mirror the Prisma engine binaries via curl + `PRISMA_*` env
vars, and point Playwright at the pre-installed Chromium via
`PLAYWRIGHT_CHROMIUM_PATH` — see `docs/process/EXPERIMENT_LOG.md` (Sessions 1–2).
None of this affects normal machines or CI.

## The copy/paste starter prompt
A ready-to-use prompt for a brand-new Claude Code Cloud session lives at
`docs/process/NEXT_SESSION_PROMPT_v0.2.md` (it includes the feedback placeholder).

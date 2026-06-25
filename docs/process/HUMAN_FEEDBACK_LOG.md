# HUMAN_FEEDBACK_LOG

Index and policy for human feedback. Actual feedback is stored as individual,
**verbatim** files under `docs/process/feedback/`.

## Policy (must follow every session)

1. **Save feedback verbatim FIRST**, before acting on it, to:
   `docs/process/feedback/FEEDBACK_vX.Y_YYYY-MM-DD_HHMM.md`
2. The **raw/verbatim section is never edited or paraphrased** after saving.
3. If the only feedback is "continue" (or similar), still save it verbatim and
   interpret it as approval to proceed with the next planned milestone.

## Feedback file template

Each feedback file MUST contain these sections:

```markdown
# Feedback — <milestone being reviewed>

- Milestone reviewed: vX.Y
- Date/time: YYYY-MM-DD HH:MM (local)
- Source session label (if known): <e.g. "v0.1.0 review">

## Raw feedback (verbatim — DO NOT EDIT)

> ```
> <exact text the human pasted, unedited>
> ```

## Claude's interpretation

<what it means in this project's terms>

## Resulting task changes

<tasks added/changed/removed in TASK_BOARD.md, with IDs>

## Accepted feedback
<items accepted and how they will be addressed>

## Deferred feedback
<items deferred, to which milestone, and why>

## Rejected or modified feedback
<items not done as stated, with a clear reason / alternative>

## Questions carried forward
<open questions for the human>
```

## Index of feedback files

| File | Milestone reviewed | Date | Summary |
| --- | --- | --- | --- |
| `feedback/FEEDBACK_v0.1_2026-06-25_0146.md` | v0.1.0 | 2026-06-25 | "Looking great so far… excited to see v0.2.0." Approves starting v0.2.0. No re-scope; proceed with planned auth milestone. |
| `feedback/FEEDBACK_v0.2_2026-06-25_0306.md` | v0.2.0 | 2026-06-25 | "Everything seems to be going well." Reports a cross-app **session-bleed bug** (Ops login leaking into the customer dashboard after customer logout). Agreed + fixed as v0.3.0 task `W-00` (per-surface session cookies). Approves starting v0.3.0. |
| `feedback/FEEDBACK_v0.3_2026-06-25_1053.md` | v0.3.0 | 2026-06-25 | "Looking good." Two public-site UX requests: (1) **scroll-to-top on every navigation** + a "Security" deep-link to `/about#security`; (2) **session-aware CTAs** ("Visit your Dashboard" when logged in) + an "already logged in" `/login` page. Both accepted, folded into the v0.4.0 session as `R-01`/`R-02` (done first). Approves starting v0.4.0. |
| `feedback/FEEDBACK_v0.4_2026-06-25_1228.md` | v0.4.0 | 2026-06-25 | "Everything looks good so far. Keep moving forward toward the next milestone." A "continue"-style approval with no change requests; no re-scope. Interpreted as approval to proceed with **v0.5.0 — Operations simulator core** (tasks `O-01…O-10`). |

> When you add a feedback file, also add a row here.

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
| `feedback/FEEDBACK_v0.5_2026-06-26_0155.md` | v0.5.0 | 2026-06-26 | "Everything else looks great." + proceed. Two accepted ops-console follow-ups — **`B-01`** (detail-panel action buttons don't deactivate when a request is resolved from the queue card/socket; fixed by syncing the panel to live shared state) and **`B-02`** (allow an operator to add a note **after** the decision, via a non-decision audited `note` action). One **deferred-with-explanation** item — **`Q-01`** (approving a Mobile check deposit should un-"Pending" the customer's line → that is money movement, **v0.7.0**; explained in the review docs). One **answered** question — **`Q-02`** (what Simulated Messaging is for; it is the simulated provider seam, first used by v0.6.0 onboarding identity/MFA). Approves starting **v0.6.0 — Onboarding and account opening** (tasks `N-01…N-13`). |
| `feedback/FEEDBACK_v0.6_2026-06-26_1710.md` | v0.6.0 | 2026-06-26 | Two Ops-console **bugs** reported + an explicit **re-scope to a patch release v0.6.1** (do NOT start v0.7.0). **`B-03`** — at narrow window widths the left nav disappears with no alternative control, so Dashboard / Request queues / Simulated messaging become unreachable (fix responsively, or document the missed control in the human review). **`B-04`** — Request queues show **"Not authenticated"**, so a customer's open-account application cannot be approved anywhere in Ops (root-cause the ops auth/data path and fix end-to-end). v0.7.0 (incl. carried **`Q-01`**) deferred to the next session pending v0.6.1 review. |
| `feedback/FEEDBACK_v0.6.1_2026-06-26_1852.md` | v0.6.1 | 2026-06-26 | **New blocking regression:** operator can't sign in to Meridian Ops — the dashboard flashes, then bounces back to the sign-in screen with the v0.6.1 "session has ended" notice; loops; survives clearing cookies; **both Sam + the Administrator** affected. Re-scoped **away from v0.7.0** → patch **v0.6.2** (v0.7.0 waits for the human to test v0.6.2). Root cause (**`B-06`**): the per-surface session cookie is chosen from the request **`Origin`**, which browsers **omit on same-origin GETs**, so the ops console's authenticated GETs read the empty customer cookie → 401 → the v0.6.1 recovery handler loops. Fixed with an explicit **`x-meridian-surface`** header trusted ahead of Origin (Origin kept as fallback; session isolation preserved). v0.7.0 **not started**. |
| `feedback/FEEDBACK_v0.6.2_2026-06-26_2025.md` | v0.6.2 | 2026-06-26 | **Clean approval** of the v0.6.2 B-06 sign-in fix + explicit **go-ahead to start v0.7.0 — Money movement**. No new bugs, no re-scope. Two verified factual notes: (1) the branch **does** contain the v0.6.2 commits (confirmed via `git log`); (2) the human has **not tagged** v0.6.2 — no tag exists in-repo, so the "v0.6.2 tagged" wording in the state docs (a local-only sandbox tag, never pushed) is corrected to "not present / human tags on merge." v0.7.0 (incl. carried **`Q-01`** deposit pending→posted) is **approved to start**. |

> When you add a feedback file, also add a row here.

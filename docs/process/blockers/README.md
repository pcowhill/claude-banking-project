# Blockers

When a required task genuinely fails after real attempts, the session records a
blocker here instead of pretending the milestone is done. File name:

```
BLOCKER_vX.Y_<short-slug>.md
```

Each blocker file should include:

- **What failed** (the requirement/task).
- **What was attempted.**
- **Remaining errors / test failures** (exact output).
- **Likely cause.**
- **Options:** retry with more context · simplify · defer · remove from scope ·
  replace with a different approach.
- **Recommendation.**
- **Exact suggested prompt** for the next session to resolve it.

A milestone with an open blocker is **not** tagged complete. Prioritize truthful
project state over appearing done.

(No blockers recorded for v0.1.0.)

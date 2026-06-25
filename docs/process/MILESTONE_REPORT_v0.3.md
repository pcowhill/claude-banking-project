# MILESTONE REPORT — v0.3.0 (Public bank website and branding)

- **Date:** 2026-06-25
- **Status:** ✅ Complete (gate green; tagged `v0.3.0`)
- **Branch:** `claude/jolly-archimedes-hqljs0` (session/milestone branch; intended
  name `milestone/v0.3-website`)
- **Session:** 3 of the experiment

## Objective

Build the public-facing bank website and branding on top of the existing brand
tokens, Meridian logo, and drop-in `ImagePlaceholder`: a polished home page,
product marketing pages, realistic image placeholders (or generation
instructions), clear login / open-account entry points, and responsive +
accessible layout polish. Keep `npm run verify` green and the simulation
disclaimer visible. Also: address the human's v0.2.0 review feedback — a
cross-app session-bleed bug — as task `W-00`.

## Delivered

| Area | Delivered |
| --- | --- |
| Bug fix (W-00) | Per-surface session cookies chosen by Origin **+** a logout that actually revokes (the bodyless-JSON-body 400) — see "The reported bug" below |
| Home | Rebuilt: hero, value props, product highlights, experience cards, security teaser, simulated testimonial, CTA band |
| Product pages | `/checking`, `/savings` (features, simulated rates/fees + disclaimers, FAQs); `/cards`, `/borrow` as tagged "coming soon" |
| About | `/about` — simulation story, `#security` section (anchored from home + footer), roadmap snapshot, big disclaimer |
| Open account | `/open-account` onboarding placeholder routing to the working demo login (full flow = v0.6.0) |
| Components | `components/marketing.tsx` kit (Section, PageHero, SectionHeading, FeatureGrid, FAQ, RateTable, CTASection, icons, milestone tags); `lib/nav.ts` |
| Layout | Sticky responsive header + full product nav + accessible mobile menu; skip-to-content link; footer rebuilt with real links |
| Images | 4 new drop-in slots (checking/savings/borrow/about) wired via `ImagePlaceholder`; prompts + `public/images` README extended |
| Versioning | Platform bumped to `0.3.0` (shared meta + 5 `package.json` + lockfile) |
| Tests | 65 → **70** Vitest unit/integration; 8 → **14** Playwright e2e |

## Acceptance criteria check

| Criterion (from ROADMAP / NEXT_SESSION) | Status |
| --- | --- |
| Polished public home page | ✅ |
| Product marketing pages (checking, savings; cards/loans as coming soon) | ✅ |
| Realistic AI-generated image placeholders / generation instructions | ✅ drop-in slots + prompts for every slot |
| Clear login / open-account entry points | ✅ header, hero, footer CTAs; `/open-account` → login |
| Responsive layout polish + accessibility | ✅ mobile menu, skip link, landmarks, alt text, labelled controls |
| Simulation disclaimer visible | ✅ banner on every page + footer notice |
| Reported bug fixed or justified in `HUMAN_REVIEW_v0.3.md` | ✅ fixed (two root causes) + documented |
| `npm run verify` passes | ✅ |
| Docs updated; annotated tag `v0.3.0` | ✅ (tag push blocked by env policy — see below) |
| Stop after v0.3.0; do not start v0.4.0 | ✅ |

## The reported bug (W-00) — two root causes, both fixed

The v0.2.0 review reported: after logging out of the customer app, `/dashboard`
showed the operator/admin (from the Ops console) instead of redirecting to login.
Investigation found **two** causes, both fixed and tested:

1. **Shared host-only cookie.** Both apps use the same backend origin; the session
   cookie had no `Domain`, so it was a host-only `localhost` cookie shared across
   ports — one session for both apps. **Fix:** per-surface cookies (`mer_session`
   / `mer_ops_session`) selected by request `Origin` (also matched by ops port for
   LAN hosts). Fully independent sessions.
2. **Logout returned 400 and never revoked.** The customer logout `POST` declared
   `Content-Type: application/json` with no body; Fastify rejects an empty JSON
   body with 400, so the handler never ran (session not revoked, cookie not
   cleared). The client cleared its own state best-effort, masking it. **Fix:**
   client omits the JSON content-type when bodyless; backend tolerates an empty
   JSON body (`{}`). Regression-tested.

## Verification evidence

- `npm run verify` → lint ✓ (0 warnings), typecheck ✓ (4 workspaces), test ✓
  (**70/70**), build ✓ (3 apps; customer bundle grew with the new pages).
- `npm run test:e2e` → **14/14** passed (Chromium), incl. the browser-level
  `session-isolation.spec.ts` reproducing the reviewer's two-tab scenario.
- Manual curl against a live backend confirmed the fix: ops login (Origin :5174)
  does not touch `mer_session`; customer logout (Origin :5173) clears `mer_session`
  (`Max-Age=0`) and `GET /api/auth/me` then returns 401.
- Screenshots of home/checking/cards/about/open-account + mobile menu reviewed.

## Notable decisions

- **Per-surface session cookies keyed by Origin** (not a schema/audience column) —
  the smallest correct fix that makes the two apps independent without a migration,
  consistent with "serialize risky shared areas, minimize blast radius."
- **Backend tolerates empty JSON bodies** — converts a silently-masked 400 footgun
  into handled behavior; the documented Fastify pattern, malformed JSON still 400s.
- **One reusable marketing component module** so each page stays content-focused
  and the brand stays consistent; nav model split into `lib/nav.ts` to keep the
  presentational module component-only (react-refresh clean).
- **Coming-soon pages** for Cards and Loans/CDs now (clearly tagged), so the nav
  and product story are complete before those milestones build the features.
- **Frontend component unit tests remain deferred** — the public site is covered by
  the build + Playwright journeys (consistent with prior milestones).

## Execution notes

The bug fix touches auth + routing (a designated **risky shared area**), so it was
implemented and reviewed **serially**, locked behind the full test suite before the
website work, and re-verified at the browser level. The public-site work is
single-app and was built on a shared component contract for consistency. A
read-through for security (session isolation, no secrets, disclaimers, simulated
labelling) ran before the gate.

## Git: branch, tag, and merge (manual steps for the human)

Built and pushed on the Claude Code Cloud session branch
`claude/jolly-archimedes-hqljs0` (intended name `milestone/v0.3-website`). No PR
opened (none requested). The annotated tag `v0.3.0` was created locally on the
milestone commit, but **pushing tags is blocked by this environment's git egress
policy (HTTP 403)** — only the session branch is pushable here. To adopt the
milestone, after reviewing the branch run locally:

```bash
git fetch origin
git checkout main
git merge --no-ff origin/claude/jolly-archimedes-hqljs0
git tag -a v0.3.0 -m "v0.3.0 — Public bank website and branding"
git push origin main
git push origin v0.3.0
```

## Deviations / honest caveats

- **Tag push** blocked by environment policy (above) — local tag exists; human
  pushes it on merge.
- **Marketing images are placeholders** (branded gradients) until real files are
  dropped into `apps/customer/public/images/`; prompts provided for every slot.
- **`/open-account`** is a placeholder routing to login; real onboarding is v0.6.0.
- **Security follow-ups (Low, unchanged):** CSRF (v0.7.0), config-driven cookie
  `secure` flag, helmet + login rate-limit (v1.0.0) — tracked in `QUALITY_REPORT.md`.
- **Sandbox-only setup:** same Prisma engine mirror (engines fetched via curl, paths
  via `PRISMA_*` env) and Playwright executable-path hook as Sessions 1–2; neither
  affects normal machines or CI.

## Blockers

None.

## Handoff

- Review guide: `docs/process/HUMAN_REVIEW_v0.3.md` (includes the full bug analysis).
- Next-session prompt: `docs/process/NEXT_SESSION_PROMPT_v0.3.md`.
- Next milestone: **v0.4.0 — Customer banking dashboard** (not started).

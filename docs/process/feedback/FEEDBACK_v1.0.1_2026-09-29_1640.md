# Feedback — post-v1.0.0 task brief: prepare Meridian for a public portfolio demo

- Milestone reviewed: v1.0.0 (the final planned milestone; this is a follow-on
  application-level preparation task, not a new roadmap milestone)
- Date/time: 2026-09-29 16:40 (session start, UTC)
- Source session label (if known): "public-demo preparation" (Claude Code Cloud session
  branch `claude/brave-meitner-bfg6b5`)

## Raw feedback (verbatim — DO NOT EDIT)

> ```
> Your task is to prepare the Meridian simulated banking application to eventually be deployed publicly as a portfolio demo on AWS Lightsail.
> Do NOT implement the actual Lightsail deployment, GitHub Actions deployment workflow, Caddy configuration, systemd configuration, Route 53 configuration, or server infrastructure in this task. Those will be handled separately after these application-level changes are reviewed.
> The goal of this task is to make the application safe and appropriate to expose publicly while preserving its current local-development behavior and existing feature set.
> Before making changes, thoroughly inspect the repository, including at minimum:
>
> * README.md
> * CLAUDE.md
> * TECHNICAL_ARCHITECTURE.md
> * QUALITY_BAR.md
> * TEST_STRATEGY.md
> * apps/backend
> * apps/customer
> * apps/operations
> * packages/shared
> * Prisma schema, migrations, seed logic, authentication/session handling, CSRF logic, CORS handling, Socket.IO behavior, and existing tests.
>
> Understand the current architecture before modifying anything.
> The application currently consists of:
>
> * Customer React/Vite app
> * Operations React/Vite app
> * Fastify + Socket.IO backend
> * Prisma + SQLite database
> * Cookie-based authentication with separate customer and operations sessions
> * Double-submit CSRF protection
> * Deterministic seeded demo data
> * A simulation clock
> * An append-only banking ledger and related simulated banking state
>
> The existing application was intentionally written as a local simulation. This task should introduce an explicit "public demo" deployment mode while preserving local development.
> 1. Introduce an explicit public-demo mode
> Add an application configuration such as:
> PUBLIC_DEMO=true
> or an equivalently clear mechanism.
> The public-demo behavior must be explicit and opt-in.
> Local development with the existing commands should continue behaving essentially as it does now unless PUBLIC_DEMO is enabled.
> Production/public-demo behavior should also use:
> NODE_ENV=production
> Do not silently infer all public-demo behavior merely from NODE_ENV. PUBLIC_DEMO should remain a distinct concept because a production deployment of the software is not necessarily the same thing as this intentionally disposable public portfolio demo.
> Document the configuration.
> 2. Make authentication cookies safe for HTTPS production
> The current session-cookie and CSRF-cookie implementations deliberately use:
> secure: false
> because the project was originally local-only.
> Update cookie handling so:
>
> * Local HTTP development continues to work.
> * Production HTTPS uses Secure cookies.
> * Existing HttpOnly behavior for session cookies remains.
> * The CSRF token cookie must remain readable by browser JavaScript because the current double-submit design depends on it.
> * SameSite behavior should remain appropriate for the intended architecture.
> * Customer and operations session isolation must remain intact.
> * Existing cookie/session/CSRF tests should be updated or expanded to cover both development and production behavior.
>
> Do not weaken CSRF, RBAC, session isolation, or authentication in order to make deployment easier.
> 3. Support same-origin production API access
> The eventual production architecture will expose:
> Customer:
> https://banking.cowhill.dev
> Operations:
> https://banking-ops.cowhill.dev
> There will NOT be a separate public API hostname.
> Caddy will serve each built frontend and reverse-proxy backend paths on the same hostname to a private backend process.
> The customer browser should therefore make requests such as:
> https://banking.cowhill.dev/api/...
> https://banking.cowhill.dev/status
> https://banking.cowhill.dev/health
> The operations browser should similarly use:
> https://banking-ops.cowhill.dev/api/...
> https://banking-ops.cowhill.dev/status
> https://banking-ops.cowhill.dev/health
> Socket.IO should also connect through the same public origin using:
> /socket.io
> The private backend will eventually listen only on loopback.
> Update the frontend configuration so that:
>
> * Local development still defaults to http://localhost:3000 as it does today.
> * A production build can use the current browser origin for API and Socket.IO requests rather than requiring a separate API hostname.
> * Environment variables can still explicitly override the API/WS location when appropriate.
> * Customer and operations applications retain their existing session behavior.
> * The operations application's x-meridian-surface mechanism still works correctly.
> * Socket.IO authentication and operations-room authorization remain intact.
>
> Prefer a clean shared helper/configuration rather than duplicating deployment-specific hacks throughout the code.
> Add tests where practical.
> 4. Add prominent public-demo privacy messaging
> The application already makes clear that Meridian is simulated and not a real bank.
> For a publicly hosted version, add additional messaging making clear that the deployed instance is a SHARED, DISPOSABLE PUBLIC DEMO.
> Users must be warned not to enter real personal information or reused passwords.
> Use wording approximately equivalent to:
> "This is a shared public simulation. Use fictional information and a unique demo password. Other visitors may modify the shared environment. Demo data is periodically reset."
> Do not imply that data entered here is private.
> Requirements:
>
> * The notice should be clearly visible without overwhelming the existing UI.
> * It should appear somewhere appropriate in both the customer application and operations simulator.
> * The customer onboarding/account-creation experience should make the warning especially clear before a visitor submits a name, email address, or password.
> * Preserve the existing "not a real bank / no real money" messaging.
> * Avoid making the application look broken or frightening; this is a portfolio demonstration, not a production banking disclosure page.
>
> If PUBLIC_DEMO is false, the new shared-public-demo warning may be omitted or reduced as appropriate.
> 5. Do not persist real visitor IP addresses or user-agent strings in public-demo mode
> Inspect all places where request IPs and user-agent strings are persisted.
> The existing database includes information such as:
>
> * Session.ip
> * Session.userAgent
> * LoginEvent.ip
> * LoginEvent.userAgent
>
> For PUBLIC_DEMO=true:
>
> * Do not persist real visitor IP addresses.
> * Prefer not to persist browser user-agent strings either.
> * The application may store null, a constant placeholder such as "public-demo", or another clearly non-identifying value.
> * Do not attempt to hash IP addresses as a workaround.
> * Do not add analytics, fingerprinting, tracking IDs, or replacement identifiers.
>
> The seeded demo database may still contain fictional/example login-history data if useful for demonstrating the feature.
> Local development outside public-demo mode may retain the existing behavior.
> Add tests demonstrating that public-demo mode does not persist the real values.
> 6. Protect the shared seeded demo accounts from trivial denial-of-service through login lockout
> The repository intentionally exposes seeded credentials for demo accounts such as Avery, Sam, Riley, etc.
> Today the normal authentication policy locks an account after repeated failed logins.
> That makes sense for a normal application but creates a problem for a shared public demo: a visitor could deliberately enter the wrong password repeatedly and make the seeded showcase accounts unavailable to everyone else.
> Design and implement a narrowly scoped solution for PUBLIC_DEMO mode.
> Requirements:
>
> * Preserve the normal lockout behavior when PUBLIC_DEMO is false.
> * Do NOT disable authentication.
> * Do NOT bypass password verification.
> * Do NOT weaken RBAC.
> * Do NOT allow arbitrary users to become operators/admins.
> * Protect the known seeded showcase accounts from being persistently locked out by anonymous visitors.
> * Prefer a solution based on identifying the known seeded demo users rather than globally disabling lockouts.
> * Newly created/public-demo user accounts may continue using the normal lockout policy if appropriate.
> * Document the behavior clearly.
> * Add tests.
>
> If a different design provides equivalent protection with less complexity, explain the choice in the PR/report.
> 7. Add lightweight abuse/resource protections appropriate for a small public demo
> This will eventually run on a very small AWS Lightsail instance, approximately:
>
> * 500 MB RAM
> * 2 vCPU
> * ~2 GB swap
>
> This does NOT need enterprise anti-abuse infrastructure, Redis, Cloudflare products, CAPTCHA, or external services.
> Add modest protections so a visitor cannot trivially overwhelm the demo by repeatedly hitting mutating endpoints.
> At minimum evaluate and, where appropriate, implement lightweight limits for:
>
> * Login attempts
> * Public onboarding/application creation
> * Customer money-movement creation
> * Scheduled-payment creation
> * Card/travel-notice mutations
> * Operations actions that create events/notes
> * Admin-created demo users
>
> The protection should:
>
> * Be simple.
> * Require no external service or database.
> * Have bounded memory usage.
> * Work adequately for a single Node process.
> * Avoid identifying users through persistent tracking.
> * Return a sensible HTTP 429 response when limits are exceeded.
> * Avoid making ordinary demo exploration frustrating.
>
> An in-memory bounded rate limiter is acceptable because this deployment is intentionally single-process and periodically reset/restarted.
> Do not over-engineer this.
> Document:
>
> * what is rate-limited,
> * the thresholds/window,
> * why those values were chosen,
> * and how local development is affected.
>
> Prefer enabling these limits specifically in PUBLIC_DEMO mode.
> Add focused tests for the limiter and protected routes.
> 8. Audit free-form input limits and database-growth risks
> Review public or authenticated inputs that can create database rows or store arbitrary text, including things such as:
>
> * onboarding names/emails
> * passwords
> * memos
> * counterparties/payees
> * operator notes
> * simulated messaging summaries
> * travel notice destinations/notes
> * schedules
> * admin-created users
> * applications
> * invitations
> * audit metadata
>
> Many existing routes already truncate or validate text. Verify that every Internet-exposed mutation has sensible server-side bounds.
> Requirements:
>
> * No unbounded request-body text.
> * No obviously unreasonable numeric amounts or counts.
> * Use shared validation/constants where that improves consistency.
> * Do not rely only on frontend limits.
> * Avoid changing normal valid demo behavior unnecessarily.
>
> Also consider whether an individual account/user can create an effectively unlimited number of a resource during one daily cycle. Where a small sensible per-user/per-resource cap would materially protect the demo, implement one.
> Keep these caps generous enough for normal exploration.
> Document any added limits.
> 9. Prepare the application for complete disposable-state resets
> Do NOT implement the actual systemd timer/server reset mechanism in this repository yet.
> However, make sure the repository exposes a clean, deterministic command that infrastructure/deployment automation can use to create a pristine database.
> The desired eventual deployment behavior is:
>
> * All mutable demo state lives in one SQLite database.
> * Once per day, the deployment will stop the backend, replace the live DB with a pristine seeded baseline, and restart the backend.
> * The whole database should reset, NOT just the ledger.
> * Deployments should also be able to begin from a pristine seeded database.
> * No persistent backup of public-demo user state is required.
>
> Review the existing:
> npm run db
> and related Prisma migration/seed commands.
> Add or refine commands if useful so there is an obvious distinction between:
>
> * destructive development reset,
> * creating a pristine seeded public-demo baseline,
> * applying production migrations.
>
> The baseline-generation process must be deterministic and suitable for running in GitHub Actions later.
> If possible, provide a command with a clear name such as:
> npm run db
> or similar.
> It should allow a caller to specify an explicit SQLite DATABASE_URL/file so deployment automation can generate the database without accidentally modifying the normal development database.
> Do not add the daily scheduler itself in this task.
> 10. Keep mutable runtime data outside release artifacts conceptually
> Future deployment will use immutable releases like:
> /srv/apps/meridian/releases/<commit-sha>
> with:
> /srv/apps/meridian/current
> pointing to the active release.
> The live SQLite DB will instead live in something like:
> /srv/apps/meridian/data/meridian.db
> The backend already supports DATABASE_URL.
> Make sure nothing introduced in this task assumes that the live DB must exist inside the checked-out repository or release directory.
> The application should run correctly with an absolute file: DATABASE_URL pointing elsewhere.
> Add documentation and tests if existing behavior does not make that sufficiently reliable.
> 11. Add no-index support for the eventual public demo
> These applications should be reachable from cowhill.dev but should not independently present themselves to search engines as real banking sites.
> Implement an application-level mechanism that makes sense for the eventual deployment, such as appropriate HTML metadata in both frontends.
> Use:
> noindex, nofollow
> for public-demo builds.
> Do not block ordinary browser access.
> Infrastructure may additionally add X-Robots-Tag later, but the application should express the intent itself too.
> 12. Preserve React SPA deployment compatibility
> Both applications use BrowserRouter.
> Future Caddy configuration will serve:
>
> * one customer dist directory
> * one operations dist directory
>
> and fall back to each application's index.html for client-side routes.
> Review the frontend build output and make sure no application behavior assumes the Vite development server performs routing.
> No Caddy configuration is needed here, but document the required SPA fallback for deployment.
> 13. Maintain or improve existing quality gates
> Do not remove existing tests or weaken existing validation to make these changes pass.
> The final repository must pass:
> npm ci
> npm run db
> npm run verify
> npm run test
> Run the complete existing suite.
> Add appropriate tests for the new public-demo behavior.
> Particularly important regression areas:
>
> * customer login
> * operations login
> * separate customer/operations cookies
> * CSRF
> * Socket.IO operations authorization
> * local development behavior
> * production secure-cookie behavior
> * PUBLIC_DEMO privacy handling
> * seeded-account lockout handling
> * rate limiting
> * deterministic database baseline generation
>
> 14. Documentation
> Update the documentation so a future deployment task has a clear application contract.
> Create an appropriate deployment/public-demo document if one does not already fit naturally.
> Document at minimum:
>
> * What PUBLIC_DEMO means.
> * Expected production hostnames:
>    * banking.cowhill.dev
>    * banking-ops.cowhill.dev
> * Expected same-origin reverse proxy paths:
>    * /api/*
>    * /health
>    * /status
>    * /socket.io/*
> * Backend should eventually bind only to loopback.
> * Expected production backend port will eventually be 8102, but do not hard-code deployment infrastructure into application logic unless configuration requires it.
> * Required production environment variables.
> * Secure-cookie behavior.
> * Privacy behavior.
> * Rate limits/resource limits.
> * Shared-demo warning behavior.
> * Whole-database reset philosophy.
> * How to generate a pristine seeded baseline database.
> * Requirement for SPA index.html fallback on both sites.
> * That the application remains a simulation with no real banking/payment/email/SMS integrations.
>
> Update .env.example appropriately, but do not place any real secrets in the repository.
> 15. Development workflow
> Follow the repository's existing development and Git conventions.
> Before changing code:
>
> 1. Confirm main is current.
> 2. Create a descriptive feature branch.
>
> Then:
>
> 3. Make the changes.
> 4. Add/update tests.
> 5. Run the full validation suite.
> 6. Review the diff yourself for regressions, unnecessary complexity, accidental secrets, and security mistakes.
> 7. Update documentation.
> 8. Commit the work with clear commit messages.
> 9. Push the branch.
> 10. Create a pull request into main.
>
> Do NOT merge the PR automatically.
> I want to review this set of application-level changes before moving on to the infrastructure/deployment work.
> 16. Important constraints
> Do NOT:
>
> * Add Docker unless there is an overwhelming technical reason. There should not be one.
> * Add PostgreSQL/MySQL/Redis.
> * Add external authentication.
> * Add CAPTCHA.
> * Add analytics/tracking.
> * Add a separate public API hostname.
> * Add AWS configuration.
> * Add Route 53 configuration.
> * Add Caddy configuration.
> * Add systemd files.
> * Add deployment SSH logic.
> * Add production GitHub Actions deployment yet.
> * Remove the deterministic seeded-demo workflow.
> * Remove the ability to run the application locally with the existing three-app development setup.
> * Make the customer and operations apps share one authentication session.
> * Weaken the existing ledger invariants, RBAC, CSRF protection, or audit behavior.
> * Turn this into a real financial application.
>
> This remains intentionally fake banking software for demonstration purposes only.
> 17. Final report
> When finished, provide a concise but technically detailed report containing:
>
> 1. Branch name.
> 2. Pull request URL.
> 3. Files significantly changed.
> 4. Public-demo configuration added.
> 5. Cookie/security changes.
> 6. API/WebSocket production-routing changes.
> 7. Privacy changes.
> 8. Seeded-account lockout solution.
> 9. Rate/resource limiting solution and exact limits.
> 10. Input/database-growth protections added.
> 11. Baseline/reset-support changes.
> 12. No-index changes.
> 13. Documentation added/updated.
> 14. Tests added.
> 15. Exact validation commands run and their results.
> 16. Any design decisions or tradeoffs you think I should review before merging.
> 17. Any work intentionally deferred to the future Lightsail/infrastructure task.
>
> Do not stop merely because implementation requires touching several parts of the monorepo. Work through the repository systematically and bring the branch to a reviewable, tested state.
> ```

## Claude's interpretation

Not a roadmap milestone: a post-v1.0.0, **application-level** preparation task so the
finished simulation can later be hosted as a **shared, disposable public portfolio demo**
(`banking.cowhill.dev` / `banking-ops.cowhill.dev`, same-origin reverse proxy to a
loopback backend, one SQLite file replaced daily). Everything infrastructural (Caddy,
systemd, Route 53, Lightsail, deploy workflow) is explicitly out of scope and is to be
_documented as a contract_ instead. Local development must remain unchanged unless the
new flags are set. The human wants a PR to review, not a merge.

## Resulting task changes

A new board section **"Public-demo readiness (post-v1.0.0)"** with tasks `P-01…P-12`
in `TASK_BOARD.md` (one per brief item group). No roadmap change (`ROADMAP.md`
untouched; the deferred set stays deferred).

## Accepted feedback

All 17 points accepted and implemented as application-level changes:
`PUBLIC_DEMO` posture + `NODE_ENV` secure cookies; shared `resolveApiBaseUrl` for
same-origin API/WS; `PublicDemoNotice` in both apps; placeholder ip/user-agent in
public-demo mode; seeded-account lockout exemption derived from the seed plan; in-memory
bounded rate limiter (public-demo mode) with documented limits; input bounds + per-user
resource caps (all modes); `npm run db:baseline` / `db:deploy` / `start:backend` +
`SEED_NOW`; robots.txt + `X-Robots-Tag`; SPA-fallback documentation;
`docs/PUBLIC_DEMO_DEPLOYMENT.md`; `.env.example`; tests for each area; PR opened, not
merged.

## Deferred feedback

None deferred by Claude. The items the brief itself defers (Lightsail, Caddy, systemd
timer/reset mechanism, Route 53, deploy workflow, `X-Robots-Tag` for the static sites)
stay with the future infrastructure task.

## Rejected or modified feedback

- **Branch naming (item 15.2):** this Claude Code Cloud session is bound to the
  provisioned branch `claude/brave-meitner-bfg6b5`; it is used as the feature branch
  (intended descriptive name: `feature/public-demo-hardening`), per the repository's
  existing convention for session branches.
- **No-index "for public-demo builds" (item 11):** both `index.html` files already
  carried `noindex, nofollow` for every build; that was kept unconditional (a local
  demo has no reason to be indexed either) and supplemented with `robots.txt` (both
  apps) and `X-Robots-Tag` on API responses in public-demo mode, rather than making the
  meta tag conditional.
- **Placeholder vs null (item 5):** the constant placeholder `public-demo` was chosen
  over `null` so an admin can tell "collected in public-demo mode" from "unknown".

## Questions carried forward

- Whether the seeded applicant (Taylor) should remain in the lockout-exempt set once
  approved by a visitor (currently yes, because the password is documented in the
  README).
- Whether the per-user resource caps (all modes) should instead apply only in
  public-demo mode; they are generous and were kept global for consistency.

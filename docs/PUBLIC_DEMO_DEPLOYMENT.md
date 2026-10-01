# PUBLIC_DEMO_DEPLOYMENT — the application contract and deployment pipeline for the public portfolio demo

> **Scope.** This document describes what the _application_ guarantees and expects
> when it is hosted as a **shared, disposable public demo**, and (§14–§19) how this
> repository **builds, ships and verifies** each release. It is one half of a
> two-sided contract:
>
> - **Application deployment — this repository.** `.github/workflows/ci.yml` packages
>   and deploys every `main` commit whose CI passed; `.github/workflows/reset-demo.yml`
>   resets the demo on demand; the scripts live in `scripts/deploy/`.
> - **Server infrastructure — `pcowhill/cowhill-infrastructure`** (contract version 1,
>   `docs/meridian.md`, registry `server/apps/meridian/app.conf`): Node.js 22, the
>   `deploy-meridian` / `app-meridian` accounts, `/srv/apps/meridian`, Caddy for both
>   hostnames, `meridian.service`, the root-owned helper
>   `/usr/local/sbin/cowhill-meridian-service`, the shared lock and the **daily reset
>   timer**. Nothing of that is defined here — no Caddyfile, no unit files, no cloud
>   configuration, no Docker — and an ordinary application deployment never needs an
>   infrastructure change.
>
> **Still a simulation.** In every mode Meridian is fake banking software for
> demonstration only: no real money, no real banking or payment rails, no real
> email/SMS providers, no external financial services. Public hosting changes who can
> _see_ it, not what it _is_.

---

## 1. Deployment postures

Two independent flags decide how the backend behaves. They are deliberately **not**
inferred from one another.

| Flag                  | Meaning                                                                   | What it turns on                                                                                                                                                                                                           |
| --------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV=production` | The code is a production build served over **HTTPS**.                     | `Secure` cookies (see §4). Optimised frontend builds resolve the API to **their own origin** (see §3).                                                                                                                     |
| `PUBLIC_DEMO=true`    | This instance is a **shared, disposable public demo** that strangers use. | The shared-demo warning in both apps (§6), visitor-privacy behaviour (§5), the seeded-account lockout exemption (§7), the in-memory rate limits (§8), `X-Robots-Tag` on API responses (§11), privacy-reduced request logs. |

- **Local development** (`npm run dev`): neither flag is set. Behaviour is unchanged from
  before this work: plain-http cookies, real request context in login history, normal
  lockout, no rate limits, no extra banner.
- **A production build that is _not_ a public demo** (e.g. a private staging copy): set
  only `NODE_ENV=production`. Secure cookies, same-origin API, none of the shared-demo
  behaviour.
- **The public demo**: set **both**. Optional fine-tuning: `COOKIE_SECURE=true|false`
  overrides the cookie default; `RATE_LIMITS=true` turns the limiter on outside
  public-demo mode (handy for a local check).

The flags are parsed by `apps/backend/src/config.ts` (`resolveConfig`); only the
spellings `true` / `1` / `yes` / `on` (case-insensitive) count as enabled.

The frontends have one matching build-time flag, `VITE_PUBLIC_DEMO=true`, which shows the
shared-demo warning from the first paint. The backend also reports `publicDemo` on
`GET /status`, and the apps show the warning when **either** signal is true — so a
deployment that only sets the backend flag is still correct once `/status` loads.

## 2. Hostnames, ports, and paths

| Site                 | Public hostname                   | Serves                           |
| -------------------- | --------------------------------- | -------------------------------- |
| Customer app         | `https://banking.cowhill.dev`     | the built `apps/customer/dist`   |
| Operations simulator | `https://banking-ops.cowhill.dev` | the built `apps/operations/dist` |

There is **no separate public API hostname.** Each site's reverse proxy forwards these
path prefixes on the **same hostname** to the private backend:

```
/api/*        → backend
/health       → backend   (liveness; never touches the DB)
/status       → backend   (readiness + posture: version, publicDemo, DB connectivity)
/socket.io/*  → backend   (Socket.IO; needs WebSocket upgrade support)
everything else → the site's static files, falling back to /index.html (§12)
```

In production the backend **binds only to loopback**: `HOST=127.0.0.1`, port
**`8102`** (`PORT=8102`), both set by the infrastructure's environment file — nothing in
application code hard-codes them. The default remains `3000` for local development.

Because the proxy sits on the same host, the backend is built with `trustProxy: true`
and reads the client address from `X-Forwarded-For`; that address is used **only** by the
in-memory rate limiter (§8) and is never persisted in public-demo mode (§5). The proxy
must overwrite (not append to) any incoming `X-Forwarded-For`.

## 3. Same-origin API and WebSocket resolution (frontends)

Both apps resolve their API base with one shared rule, `resolveApiBaseUrl` in
`packages/shared/src/public-demo.ts`:

1. an explicit, non-blank `VITE_API_URL` wins (Socket.IO: `VITE_WS_URL`, defaulting to the
   API base);
2. otherwise a **production build** uses the page's own `window.location.origin`;
3. otherwise (dev/test) `http://localhost:3000`.

So a plain `npm run build` with **no** `VITE_API_URL` produces bundles that call
`https://banking.cowhill.dev/api/...` and `https://banking-ops.cowhill.dev/api/...` when
served from those origins, and connect Socket.IO to the same origin at `/socket.io`.
Local development is unchanged (`http://localhost:3000`).

Unaffected and still required:

- **Session isolation.** The customer portal uses the `mer_session` cookie, the operations
  console `mer_ops_session`. In production the two sites are different hosts, so the
  cookies are naturally separate as well; the apps still send the explicit
  `x-meridian-surface` header on every call (and on the Socket.IO handshake) so the
  backend reads the right cookie without relying on `Origin`.
- **CSRF.** The double-submit token is unchanged: `mer_csrf` cookie (readable by page JS,
  `Secure` in production) + `x-meridian-csrf` header on mutating requests.
- **Socket.IO authorisation.** Only an authenticated `ops_agent`/`admin` session that
  declares the operations surface joins the operators room; customer and anonymous
  sockets never receive operator payloads.
- **CORS.** With same-origin routing the browser never makes a cross-origin call, but set
  `CORS_ORIGINS` to the two public origins anyway (belt and braces), and
  `OPERATIONS_ORIGINS` to the ops origin (the fallback surface signal).

## 4. Cookies

| Cookie            | httpOnly | SameSite | Secure                 | Purpose                                                          |
| ----------------- | -------- | -------- | ---------------------- | ---------------------------------------------------------------- |
| `mer_session`     | yes      | Lax      | `config.secureCookies` | customer session (opaque token; only its SHA-256 hash is stored) |
| `mer_ops_session` | yes      | Lax      | `config.secureCookies` | operations session                                               |
| `mer_csrf`        | **no**   | Lax      | `config.secureCookies` | CSRF double-submit token (page JS must read it)                  |

`secureCookies` defaults to `NODE_ENV === 'production'` and can be forced with
`COOKIE_SECURE`. All three cookies share one base attribute set
(`apps/backend/src/auth/cookies.ts`, `baseCookieOptions`) so they cannot drift, and the
clear-cookie call uses the same attributes so logout always removes the cookie.
Tests: `apps/backend/src/auth/cookie-security.test.ts`.

## 5. Visitor privacy (public-demo mode)

With `PUBLIC_DEMO=true` the backend **does not persist real visitor IP addresses or
user-agent strings**. `Session.ip`, `Session.userAgent`, `LoginEvent.ip` and
`LoginEvent.userAgent` are written as the constant placeholder `public-demo`
(`PUBLIC_DEMO_PLACEHOLDER`) for every visitor. It is not a hash, not a fingerprint, and
not a substitute identifier — every row looks the same. The request log serializer also
drops the remote address in this mode. No analytics, tracking IDs, or fingerprinting are
added anywhere.

The seeded demo database carries **three fictional** sign-in events for Avery (RFC 5737
documentation addresses, an obviously fake user-agent) so the dashboard's "recent sign-in
activity" still demonstrates the feature.

Local development keeps the real values (unchanged).
Tests: `apps/backend/src/routes/public-demo.test.ts` (“privacy”).

## 6. The shared-demo warning

Always-on (every mode): the existing "Simulated banking environment… Not a real bank. No
real money" banner, footer notice and form copy.

Added in public-demo mode only (`PublicDemoNotice` in both apps):

- a slim amber line under the simulation banner on every page:
  _"This is a shared public simulation. Use fictional information and a unique demo
  password. Other visitors may modify the shared environment. Demo data is periodically
  reset."_;
- a prominent callout **above the first field** of the customer open-account form and the
  customer sign-in form ("…use a made-up name and email, and choose a throwaway password
  you use nowhere else…");
- a callout above the operator sign-in form.

Wording lives in `PUBLIC_DEMO_NOTICE` (`packages/shared/src/public-demo.ts`). Nothing is
rendered when the flag is off.

## 7. Seeded showcase accounts and the lockout policy

Normal policy (all modes for non-seeded users; every user when `PUBLIC_DEMO` is off):
5 consecutive failures lock the account for 15 minutes.

Problem for a shared demo: the seeded logins (Avery, Jordan, Sam, Riley, and the seeded
applicant Taylor) are printed in the README and on the sign-in pages. One visitor typing
wrong passwords in a loop could lock them for everyone.

Solution (`apps/backend/src/routes/auth.ts`, `lockoutExempt`): in public-demo mode a
login for a **seeded showcase account** — the set is derived from the seed plan itself
(`seededShowcaseEmails()`), never a hand-typed list — is verified against the real bcrypt
hash exactly as before, still recorded in login history and still counted in
`failedLoginAttempts`, but **never sets `lockedUntil`**. A pre-existing lock on such an
account is ignored in this mode. Everything else is untouched:

- password verification is never bypassed; a wrong password is still a 401;
- RBAC is untouched — nobody can become an operator/admin through this;
- visitor-created applicants and admin-created demo users keep the normal lockout;
- brute-force pressure on the login endpoint as a whole is bounded by the per-client login
  rate limit (§8) — which is also why the exemption is safe: the exempt accounts'
  passwords are public by design, so a lock protected nothing.

Why not a shorter lock or a per-IP lock instead: a shorter lock still lets one loop keep
the demo unusable indefinitely, and per-IP state would be a tracking mechanism this
demo deliberately avoids persisting. Tests: `public-demo.test.ts` (“seeded showcase
accounts vs the lockout policy”).

## 8. Rate limits (public-demo mode)

`apps/backend/src/abuse/rate-limit.ts` — a fixed-window counter per (bucket, client key),
entirely in process memory, bounded to 5 000 keys per bucket (oldest evicted; stale
windows swept). No Redis, no database, no external service; correct for one Node
process that is restarted and reset daily. Client key = the request IP for anonymous
routes, the **user id** for authenticated routes (so a shared NAT does not starve
visitors of each other's budget). Keys live only in RAM for one window and are never
persisted or logged.

| Bucket       | Routes                                                      | Limit                   | Why                                                                 |
| ------------ | ----------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------- |
| `login`      | `POST /api/auth/login`                                      | 20 / 5 min per IP       | a person signs in a handful of times; a loop burns bcrypt CPU       |
| `onboarding` | `POST /api/onboarding/applications`                         | 5 / 15 min per IP       | public + unauthenticated; each costs a bcrypt hash and several rows |
| `money`      | `POST /api/transfers`, `POST /api/movements`                | 30 / 5 min per user     | each writes ledger rows + a queue item                              |
| `schedules`  | schedule create / cancel                                    | 20 / 5 min per user     |                                                                     |
| `cards`      | issue, freeze, unfreeze, report, travel notices             | 30 / 5 min per user     |                                                                     |
| `lending`    | open CD / loan, pay, withdraw                               | 20 / 5 min per user     | each open creates an account + ledger legs                          |
| `risk`       | disputes, fraud responses, invitations + responses          | 20 / 5 min per user     |                                                                     |
| `operations` | request actions, simulate event, reverse, **clock advance** | 60 / 5 min per operator | operators click a lot; a clock advance does real work               |
| `adminUsers` | `POST /api/admin/users`                                     | 10 / 15 min per admin   | each is a bcrypt hash + rows                                        |
| `mutations`  | **every** state-changing request                            | 200 / 5 min per IP      | coarse valve for anything without its own bucket                    |

Exceeding a bucket returns **HTTP 429** with `{ code: 'rate_limited' }` and a
`Retry-After` header; both sign-in pages show a friendly message. Safe methods
(GET/HEAD/OPTIONS) are never limited. Values are in `PUBLIC_DEMO_RATE_LIMITS`
(`packages/shared/src/public-demo.ts`) — generous for one person exploring, small against
a scripted loop. **Local development is unaffected** (limits are off unless
`PUBLIC_DEMO=true` or `RATE_LIMITS=true`). Tests: `abuse/rate-limit.test.ts`,
`routes/public-demo.test.ts` (“rate limits”).

## 9. Input bounds and database-growth caps (all modes)

Every Internet-exposed mutation now has server-side bounds independent of the frontend:

- **Request body ceiling:** 64 KiB (`MAX_REQUEST_BODY_BYTES`) → 413.
- **Login:** email ≤ 254 chars, password ≤ 200 chars → 400 before any lookup/bcrypt.
- **Emails everywhere** (applications, invitations, admin users): ≤ 254 chars.
- **Admin-created user password:** ≤ 200 chars (rejected, not silently hashed).
- **Simulated-event `kind` / `requestId`:** ≤ 64 chars (previously unbounded).
- **Transaction search `?q=`:** ≤ 100 chars.
- Existing caps kept: names ≤ 80, memos ≤ 140, counterparties ≤ 80, notes/summaries
  ≤ 500, dispute details ≤ 280, travel destination ≤ 80 / note ≤ 200, amounts within the
  simulated ranges, clock advance ≤ 366 days, event list ≤ 200.

Per-user / per-resource caps on **live** rows (`RESOURCE_CAPS`; HTTP 409 `limit_reached`;
resolving/cancelling frees capacity):

| Cap                                         | Value                                           |
| ------------------------------------------- | ----------------------------------------------- |
| active schedules per user                   | 25                                              |
| open CDs + loans per user                   | 10 (a loan needs no funds, so this one matters) |
| live (active/frozen) cards per account      | 8                                               |
| active travel notices per card              | 10                                              |
| pending joint invitations per account       | 10                                              |
| movements awaiting operator review per user | 25                                              |
| unreviewed applications per applicant email | 3                                               |

Tests: `apps/backend/src/routes/caps.test.ts`, `packages/shared/src/public-demo.test.ts`.

## 10. Database: one file, whole-database resets

All mutable demo state lives in **one SQLite file**, addressed by `DATABASE_URL`. The
reset philosophy is **replace the whole database**, never just the ledger: stop the
backend, copy a pristine baseline over the live file, start the backend. Nothing in the
application assumes the file lives inside the checkout or the release directory; the
runtime, the Prisma CLI wrapper and the baseline builder all honour an absolute
`file:` URL, e.g.

```
DATABASE_URL="file:/srv/apps/meridian/data/meridian.db"
```

Production layout (§15): immutable releases under
`/srv/apps/meridian/releases/<commit-sha>` with `/srv/apps/meridian/current` pointing at
the active one, and the live DB under `/srv/apps/meridian/data/`. In public-demo mode the
backend logs a warning at start-up if `DATABASE_URL` is not absolute.

Commands (root `package.json`):

| Command               | Purpose                                                                                                                                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run db:reset`    | **Destructive development reset** of the local dev DB (`prisma migrate reset` + seed). Never use against the live file.                                                                                            |
| `npm run db:deploy`   | **Apply committed migrations** to whatever `DATABASE_URL` points at (`prisma migrate deploy`). The production migration path.                                                                                      |
| `npm run db:baseline` | **Build a pristine seeded baseline** into a new file: deletes the target, runs `migrate deploy`, runs the seed, verifies counts. Default target `apps/backend/prisma/baseline/meridian-baseline.db` (git-ignored). |

Baseline targeting and determinism:

```
npm run db:baseline -- --out /abs/path/meridian-baseline.db
DATABASE_URL=file:/abs/path/meridian-baseline.db npm run db:baseline
SEED_NOW=2026-09-01T00:00:00Z npm run db:baseline -- --out ./out/meridian.db
```

`SEED_NOW` pins the seed instant so every timestamp in the file (clock start, ledger
history, maturities, schedule due dates, sign-in history) is identical run to run. Row ids
and bcrypt salts are still random by design — the **content** is deterministic, not the
bytes. Suitable for GitHub Actions: it needs only `npm ci` (Prisma client is generated by
`postinstall`). No persistent backup of visitor state is required or expected.
Tests: `apps/backend/src/baseline.test.ts`.

## 11. Search engines

Both `index.html` files carry `<meta name="robots" content="noindex, nofollow">` (every
build), both sites ship a `robots.txt` that disallows everything, and in public-demo mode
the backend adds `X-Robots-Tag: noindex, nofollow` to every API response. None of this
blocks ordinary browser access. Caddy adds the same header to every static response of
both sites (infrastructure), and the deployment verifies it (§17).

## 12. SPA fallback (required)

Both apps use `BrowserRouter`, so deep links such as `/dashboard`, `/accounts/<id>`,
`/queues` or `/clock` are **client-side routes**. Each site's static server must serve its
own `index.html` for any path that is not an existing file (and is not one of the proxied
backend prefixes in §2). Nothing in the apps depends on the Vite dev server: the builds
are plain static assets under `dist/` (`npm run build`).

## 13. Environment variables

Backend (production public demo):

```
NODE_ENV=production
PUBLIC_DEMO=true
HOST=127.0.0.1
PORT=8102
DATABASE_URL="file:/srv/apps/meridian/data/meridian.db"
CORS_ORIGINS="https://banking.cowhill.dev,https://banking-ops.cowhill.dev"
OPERATIONS_ORIGINS="https://banking-ops.cowhill.dev"
# optional: COOKIE_SECURE=true  RATE_LIMITS=true  LOG_LEVEL=info  SEED_NOW=<iso> (baseline build only)
```

Frontends (build time, both apps):

```
VITE_PUBLIC_DEMO=true
# leave VITE_API_URL / VITE_WS_URL unset → same-origin
```

There are **no secrets**: the demo passwords are intentionally public, sessions use random
opaque tokens generated at runtime, and nothing talks to an external service.

## 14. Deployment pipeline (GitHub Actions → Lightsail)

Deployment is **automatic after a successful CI run on `main`**, inside the same
workflow (`.github/workflows/ci.yml`), so it can never race ahead of CI:

```
verify ──┐                         (lint, typecheck, unit/integration + deployment tests, build)
         ├──> package-release ──> deploy
e2e ─────┘                         (Playwright)
```

| Job               | Runs for                                                                                                           | Does                                                                                                                                                                                                      | Secrets                                |
| ----------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `verify`, `e2e`   | every pull request, push to `main`, manual run                                                                     | the existing gate, on Node.js 22 (the server's runtime)                                                                                                                                                   | none                                   |
| `package-release` | every event, **after `verify` and `e2e` both succeeded**                                                           | builds the release (§15), smoke-tests the **packaged** backend, validates and archives it. On pull requests this is a dry run; only for `main` is the archive uploaded as an artifact (retention 3 days). | none                                   |
| `deploy`          | **push to `main` or "Run workflow" on `main`** only, after `verify`, `e2e` and `package-release` all **succeeded** | downloads + checksums + re-validates the archive, then runs `scripts/deploy/deploy-release.sh` (§16)                                                                                                      | the SSH key + known hosts, in one step |

**Exactly when production deploys:** the `deploy` job's condition is
`github.ref == 'refs/heads/main' && (event == push || event == workflow_dispatch)` **and**
`needs.{verify,e2e,package-release}.result == 'success'`. A pull request (any ref), a
manual run on any other branch, a tag, or any failed/skipped/cancelled prerequisite never
deploys. `pull_request_target` is not used anywhere. Pull requests never receive a
production secret and never contact the server.

**Serialisation and stale runs.** The `deploy` job (and the manual reset, §19) run in the
concurrency group **`meridian-production`** with `cancel-in-progress: false`: one at a
time, queued, never cancelled mid-flight. The workflow-level group is per commit for
`main` (never cancelled; pull requests still cancel superseded runs), so a new push
cannot kill a deployment. Because a queued run may be older than `main`, the deploy
compares the target SHA with the live `refs/heads/main` (`git ls-remote origin
refs/heads/main` — no `gh`, no extra token) **twice**: before contacting the server and
again immediately before switching `current`. If they differ, it reports a **stale run**
and exits **successfully without switching anything** (an already-uploaded release is
left unreferenced and pruned by a later deployment). If `main` cannot be read it fails
closed. _Limitation:_ GitHub keeps only one _pending_ job per concurrency group; if
several `main` pushes land while a deployment runs, an intermediate pending run is
cancelled by GitHub — the newest commit's run still deploys `main`. If a stale run ever
leaves the site behind `main`, use "Run workflow" on `main`.

**Repository configuration** (Settings → Secrets and variables → Actions, repository
scope). These four, and nothing else, are needed — there are no application secrets:

| Type     | Name                        | Value                                                                                              |
| -------- | --------------------------- | -------------------------------------------------------------------------------------------------- |
| Variable | `LIGHTSAIL_HOST`            | the Lightsail static IPv4 address                                                                  |
| Variable | `LIGHTSAIL_USER`            | `deploy-meridian` (the scripts refuse anything else)                                               |
| Secret   | `LIGHTSAIL_SSH_PRIVATE_KEY` | the dedicated **Meridian** deployment private key (never the infrastructure or lightsail-demo key) |
| Secret   | `LIGHTSAIL_KNOWN_HOSTS`     | the verified host-key line(s) for `LIGHTSAIL_HOST`                                                 |

Workflow permissions are `contents: read` everywhere; checkout credentials are not
persisted except in `deploy` (read-only token, used for the stale check).

## 15. The release (built entirely in GitHub Actions)

`scripts/deploy/build-release.sh --sha <sha> --out <dir>` (Node.js 22, after `npm ci`).
The VM never runs `npm`, Vite, TypeScript, Prisma or a build.

```
release/
    customer/          apps/customer/dist     (index.html, assets/…, brand/, images/, robots.txt)
    operations/        apps/operations/dist   (index.html, assets/…, brand/, robots.txt)
    backend/           apps/backend/dist      (index.js, index.js.map — @simbank/shared is bundled)
    node_modules/      the backend's production dependency closure + the generated Prisma client
    baseline/
        meridian-baseline.db   migrated + seeded pristine SQLite database
    package.json       {"name":"meridian-release","private":true,"type":"module",…} — explicit ESM for backend/index.js
    REVISION           the full commit SHA, exactly 40 bytes
```

`.release-ready` is **not** in the artifact: the server creates it after its own
validation (§16). Never included: `.git`, sources, tests, Playwright browsers or output,
`.env` files, secrets, the development `dev.db`, caches, `.bin` directories, workspace
symlinks, anything else at the top level (validation rejects unexpected entries). The
repository's `public/images/.gitkeep` placeholder is dropped; any other dotfile under a
static root fails the build.

**Frontend build.** `VITE_PUBLIC_DEMO=true npm run build` with `VITE_API_URL` /
`VITE_WS_URL` explicitly **unset** (and the build refuses `apps/*/.env*` files Vite would
read), so both SPAs call `window.location.origin` — `https://banking.cowhill.dev/api/…`,
`https://banking-ops.cowhill.dev/socket.io/…`. The build checks both bundles contain the
shared-public-demo warning and both `index.html` keep their robots meta tag.

**Baseline.** `SEED_NOW=<commit time> npm run db:baseline -- --out <release>/baseline/meridian-baseline.db`,
where `<commit time>` is `git show -s --format=%cI <sha>` (the **committer timestamp**):
rebuilding the same commit yields the same simulated instant and content (ids and
bcrypt salts stay random by design, so the bytes may differ). `scripts/deploy/check-baseline.mjs`
then opens a **copy** of the baseline through the **release's own** Prisma client and
requires: SQLite header, non-empty, the four showcase logins with their roles, accounts,
ledger entries, zero sessions, applied (and no unfinished) migrations, and the clock at
exactly `SEED_NOW`. The server never migrates: it copies this file (§16).

**Production `node_modules`** — `scripts/deploy/collect-runtime-deps.mjs`. Instead of
`npm prune` (which in this workspace monorepo would keep the frontends' React deps,
workspace symlinks and `.bin` links), it walks `@simbank/backend`'s `dependencies`
transitively through the **installed** tree that `npm ci` produced and every CI test ran
against, resolving each package exactly as Node does, and copies only that closure:

- `dependencies`, `optionalDependencies` (if installed) and non-optional peers are
  followed; a missing required package fails the build;
- every copied package must be a **non-dev** entry of `package-lock.json`; `@simbank/*`
  workspace packages are never copied (the bundle must not import them — checked);
- nested `node_modules` are only copied when they are in the closure, so no `.bin` or
  unrelated package ships; a symlink, socket or device anywhere fails the build;
- **Prisma runtime:** `@prisma/client` (its `runtime/`) plus the generated
  `node_modules/.prisma/client` (JS client, `schema.prisma`,
  `libquery_engine-debian-openssl-3.0.x.so.node`) are copied whole, **with file modes
  preserved** (the engine keeps its executable bits); the `prisma` CLI and its engines
  (dev-only) are not shipped;
- finally every bare import of `backend/index.js` must resolve inside the new tree.

Result today: 79 packages, ≈39 MiB (`fastify`, `socket.io`, `@prisma/client`, `bcryptjs`,
`@fastify/*`, their dependencies). Modes are normalised to `u=rwX,go=rX`.

**Smoke test of the exact artifact** — `scripts/deploy/smoke-release.sh`. The release
directory is built **outside** the checkout (and the script refuses any `node_modules` in
an ancestor directory), so Node can only resolve the packaged dependencies. It copies
the packaged baseline to a temporary DB and runs `node backend/index.js` from the release
under `env -i` with exactly `NODE_ENV=production PUBLIC_DEMO=true HOST=127.0.0.1
PORT=<free port> DATABASE_URL=file:<tmp> CORS_ORIGINS=… OPERATIONS_ORIGINS=…
LOG_LEVEL=info`, then requires `/health` 200, `/status` 200 with `status:"ok"`,
`database.connected:true`, `publicDemo:true`, `revision:<sha>`, `X-Robots-Tag`, an
Engine.IO polling handshake, a clean exit 0 on SIGTERM, and **no write** into the release
directory (the server runs it read-only). The same directory is then re-validated and
archived.

**Validation** (`scripts/deploy/validate-release.sh` = the server-side
`remote/meridian-release.sh validate`): exact top-level entries; `REVISION` == SHA (40
lowercase hex); `package.json` `"type": "module"`; `customer/index.html`,
`operations/index.html`, `backend/index.js` (only `*.js` / `*.js.map` in `backend/`);
`node_modules/` with Fastify, Socket.IO, bcryptjs, `@prisma/client`, `.prisma/client`,
the engine and schema, no `.bin` / Playwright / `@simbank`; the baseline a non-empty
regular file with the SQLite header and no sidecars; **no symlinks** and nothing but
regular files and directories anywhere; no group/world-writable or setuid/setgid entry;
no dotfiles under the static roots; no `.env*`, `.npmrc`, SSH keys, `*.pem`/`*.key`, other
databases or `PRIVATE KEY` blocks anywhere.

**Artifact integrity.** `archive-release.sh` writes a reproducible tarball (sorted, owner
0:0, commit-time mtimes, `gzip -n`; modes kept) and its SHA-256. The hash is passed to the
deploy job as a **job output** (a channel separate from the artifact store);
`extract-release.sh` refuses the archive unless its SHA-256 matches, refuses any
non-regular entry, absolute path or `..`, extracts into a fresh directory, and the deploy
job re-runs the full validation **before** any SSH connection.

## 16. Server procedure (what `deploy-release.sh` does)

Contract paths (infrastructure contract version 1):

| Item                     | Path                                                                                               |
| ------------------------ | -------------------------------------------------------------------------------------------------- |
| Application root         | `/srv/apps/meridian`                                                                               |
| Upload staging           | `/srv/apps/meridian/incoming/<sha>/`                                                               |
| Immutable releases       | `/srv/apps/meridian/releases/<sha>/`                                                               |
| Active release (symlink) | `/srv/apps/meridian/current`                                                                       |
| Static roots (Caddy)     | `current/customer`, `current/operations`                                                           |
| Backend                  | `/usr/bin/node /srv/apps/meridian/current/backend/index.js` as `app-meridian` (`meridian.service`) |
| Baseline / live DB       | `current/baseline/meridian-baseline.db` → `/srv/apps/meridian/data/meridian.db`                    |
| Ready marker / revision  | `current/.release-ready`, `current/REVISION`                                                       |
| Helper                   | `sudo -n /usr/local/sbin/cowhill-meridian-service restart\|stop\|status\|reset`                    |
| Lock                     | `/run/lock/cowhill-meridian.lock`                                                                  |

**SSH.** `scripts/deploy/ssh-setup.sh` writes the key (mode 0600; sanity-checked with
`ssh-keygen -y`, only its public fingerprint is logged), the known-hosts data exactly as
provided (it must contain an entry for `LIGHTSAIL_HOST`), and a config for host
`meridian`: `User deploy-meridian`, `Port 22`, `IdentitiesOnly yes`, `IdentityAgent
none`, `UserKnownHostsFile` = that file only, **`StrictHostKeyChecking yes`**, `BatchMode
yes`, no password/keyboard-interactive, no forwarding. Never `accept-new`, never
`ssh-keyscan`. Secrets reach the step only as environment variables (never arguments,
never echoed, no shell tracing). The files are shredded in an `always()` step.

The **only code run on the server** is `scripts/deploy/remote/meridian-release.sh`,
streamed from the deployed commit over SSH (`ssh meridian 'bash -s -- <action> <sha…>'`,
`set -Eeuo pipefail`, fixed contract paths, arguments limited to 40-hex SHAs, `none` or a
number) plus `id -un` and rsync's receiver. Sequence:

1. **Stale check** (§14).
2. **SSH preflight:** `id -un` must be `deploy-meridian`; the `preflight` action checks
   the directories and lock file, `linux-x86_64` + OpenSSL 3 (the packaged Prisma
   engine), free space (2× the release), and runs `sudo -n …-service status` (the
   restricted sudo contract). Before the first deployment the unit is
   inactive/condition-skipped — expected.
3. **Public DNS/TLS preflight** (`verify-public.mjs preflight`): both hostnames resolve and
   complete a **verified** TLS handshake; any HTTP status (404/502 before the first
   deployment) is fine. Failure aborts before anything changes.
4. **Upload:** `rsync --recursive --perms --times --no-links --no-devices --no-specials
--delete` into `incoming/<sha>/` over the pinned connection (executable bits kept;
   never into `releases/`, `current` or `data/`).
5. **Publish** (`publish` action): validate `incoming/<sha>` (§15 list, and no
   `.release-ready` in the upload), `mv -T` it to `releases/<sha>`, `chmod -R
u=rwX,go=rX`, validate again, `sync`, then create **`.release-ready` last**. Reruns:
   a ready release with matching `REVISION` is **reused unchanged** (never overwritten);
   an incomplete one that is not `current` is removed and recreated; the release
   `current` points at is never removed or overwritten.
6. **Rollback target** (`rollback-target`): the release `current` resolves to, accepted
   only if it is directly under `releases/`, is not the new release, has
   `.release-ready`, and its `REVISION` equals its directory name. None on the first
   deployment.
7. **Stale check** again.
8. **Switch** (`switch <sha> <expected>`), under the shared lock exactly as the
   infrastructure specifies — `exec 9</run/lock/cowhill-meridian.lock`, `flock -w 300 9`;
   while holding it: re-check the release is ready, **compare-and-swap** (`current` must
   still be what step 6 saw, otherwise exit 3 and change nothing), `ln -s` a uniquely
   named temporary link in `/srv/apps/meridian`, `mv -T` it over `current`; then `flock
-u 9; exec 9<&-`. The script exits — the lock is **released before reset**.
9. **Reset on every deployment** (`reset` action = `sudo -n
/usr/local/sbin/cowhill-meridian-service reset`, which takes the lock itself): stop,
   verify the baseline, replace the whole live DB, drop sidecars, start, check local
   `/health` + `/status`. Non-zero = failed deployment. The workflow never copies a
   database and never runs Prisma on the VM.
10. **Server verification** (`verify`): `readlink -f current` = `releases/<sha>`,
    `current/REVISION` = `<sha>`, ready marker, `status` reports `ActiveState=active`.
11. **Public verification** (§17).
12. **Prune** (`prune`, only after 9–11 passed): keep `current` + the previous ready
    release (the rollback target; if there was none, the most recently readied other
    release), remove older releases, every `incoming/<sha>` upload and stale temporary
    links; never `data/`, never the release `current` points at (re-checked before each
    removal); unexpected names are left alone. A pruning failure is a warning, not a
    failed deployment. Each release is ≈57 MB, so at most ≈115 MB is kept.

## 17. Public verification

`scripts/deploy/verify-public.mjs live --expect-revision <sha>` (TLS always verified):

- `https://banking.cowhill.dev/status` polled (up to 36 × 5 s): HTTP 200, `status:"ok"`,
  `database.connected:true`, `publicDemo:true`, `isSimulation:true`, **`revision` = the
  deployed SHA**, `X-Robots-Tag`; the same on the operations host (same backend);
- `/health` 200 on both hosts;
- customer `/` and `/dashboard`, operations `/` and `/queues`: HTTP 200 SPA shell with
  the robots meta tag and **`X-Robots-Tag: noindex, nofollow`**;
- each site's module bundle (from its `index.html`) is served with `X-Robots-Tag` and
  contains the **shared-public-demo warning**;
- `robots.txt` disallows crawling;
- an anonymous Engine.IO polling handshake `GET /socket.io/?EIO=4&transport=polling` on
  both hosts (no authentication bypass, no operator events).

## 18. Failure handling and rollback

| When it fails                                                                                                                                              | What happens                                                                                                                                                                                                                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Build, smoke test, artifact checksum/validation, SSH preflight, DNS/TLS preflight, upload, server validation/publication, or the switch's compare-and-swap | **Before the switch:** `current` is not modified, the live DB is not reset, the run fails.                                                                                                                                                                                                                                    |
| Reset, server verification, or public verification — **with** a captured previous release                                                                  | **Rollback:** under the lock point `current` back to the previous ready release, release the lock, `reset` (the previous release's **pristine baseline** — visitor data is disposable and old visitor data is never restored), verify it locally and publicly. The run **still fails** ("FAILED … and was ROLLED BACK to …"). |
| …and the rollback fails too                                                                                                                                | `sudo -n …-service stop`; the run fails with a **CRITICAL** message; both sites answer 502 until someone looks.                                                                                                                                                                                                               |
| …on the **first** deployment (no previous release)                                                                                                         | No rollback is possible; the helper's state is left as is (a failed reset leaves the service stopped) and the run fails clearly.                                                                                                                                                                                              |

Everything is summarised in the run's job summary.

## 19. Demo resets

- **Daily (infrastructure-owned):** `meridian-reset.timer` → `meridian-reset.service` →
  `cowhill-meridian-service reset` at 04:00 America/New_York. Not configured here.
- **On every deployment** (§16 step 9): the new release starts from its own pristine
  baseline.
- **On demand:** Actions → **Reset demo data** → Run workflow (on `main`;
  `.github/workflows/reset-demo.yml`). It uses the same four settings and strict SSH
  setup, checks `id -un` = `deploy-meridian` and the `status` contract, then runs **only**
  `sudo -n /usr/local/sbin/cowhill-meridian-service reset` (the helper takes the lock; the
  workflow does not), and verifies the public `/status` (ok, database connected,
  `publicDemo:true`) and both sites. It shares the `meridian-production` concurrency
  group, so it never overlaps a deployment. It has no inputs.

## 20. Operating the pipeline

**Inspecting a deployment:** the Actions run of `CI` for the commit (job summary: target,
previous release, outcome); `curl -s https://banking.cowhill.dev/status` (`revision` is
the deployed commit); on the VM `readlink /srv/apps/meridian/current`, `cat
/srv/apps/meridian/current/REVISION`; `sudo -n /usr/local/sbin/cowhill-meridian-service
status` as `deploy-meridian`; application logs only for administrators (`sudo journalctl
-u meridian`, `-u meridian-reset`) — the deploy account has no journal access.

**Re-deploying:** "Run workflow" on `main` (CI runs again first). Re-deploying the
current commit reuses its ready release and resets the demo.

**Locally / on pull requests (no server involved):** `npm run release:dry-run` builds,
smoke-tests, archives, verifies and validates the release for `HEAD`;
`npm run lint:deploy` shellchecks the scripts; the deployment tests in
`scripts/deploy/test/` (part of `npm run test` / `verify`) drive the real scripts against
temporary directories with a fake `ssh`, a fake service helper that records whether the
lock was held, and a fake public verifier: release validation, publication and reruns,
the rollback target, the locked compare-and-swap switch, reset only after the lock is
released, rollback and failed-rollback paths, stale runs, pruning, SSH configuration,
archive integrity, the HTTP verifier, and the workflows' gating and secret exposure.

**Troubleshooting**

| Symptom                                                                             | Meaning / action                                                                                                                                                                                                                             |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `required GitHub Actions configuration is missing`                                  | Add the variable/secret it names (§14).                                                                                                                                                                                                      |
| `LIGHTSAIL_KNOWN_HOSTS contains no host key entry for LIGHTSAIL_HOST`               | The pinned host-key line does not name the host/IP in `LIGHTSAIL_HOST`; fix the secret (never use `ssh-keyscan`/`accept-new`).                                                                                                               |
| `Host key verification failed`                                                      | The server's host key changed or the secret is wrong. Verify the key out of band, then update `LIGHTSAIL_KNOWN_HOSTS`.                                                                                                                       |
| `Permission denied (publickey)`                                                     | `LIGHTSAIL_SSH_PRIVATE_KEY` does not match the infrastructure's `server/apps/meridian/deploy-key.pub` (compare the logged fingerprint).                                                                                                      |
| `sudo: a password is required` / helper `status` failed                             | The infrastructure sudoers fragment is missing or changed; fix it in the infrastructure repository.                                                                                                                                          |
| `public DNS/TLS preflight failed`                                                   | A hostname does not resolve or its certificate is not trusted (Route 53 / Caddy, infrastructure). Nothing was changed.                                                                                                                       |
| `STALE RUN`                                                                         | A newer commit is on `main`; this run correctly did nothing. The newer run deploys it.                                                                                                                                                       |
| `current changed underneath the deployment`                                         | Something else switched `current` between steps 6 and 8; nothing was changed. Re-run.                                                                                                                                                        |
| `… FAILED … and was ROLLED BACK to …`                                               | The new release did not become healthy or failed public checks; the previous release serves again on a fresh baseline. Fix and push.                                                                                                         |
| `CRITICAL: … rollback … failed; meridian.service has been stopped`                  | Both releases failed. An administrator checks `sudo journalctl -u meridian` and the helper's status; redeploy a fixed commit.                                                                                                                |
| `not enough free space under /srv/apps/meridian`                                    | Free disk on the VM (old releases are pruned automatically after successful deployments).                                                                                                                                                    |
| Package job: `the bundle imports … not in the runtime dependency tree`              | A new backend runtime import is not a backend `dependency`; add it to `apps/backend/package.json`.                                                                                                                                           |
| Package job: `secret-like or database file in the release` / `private key material` | A (new) dependency ships a key/`.env`/database-looking file. Validation fails closed on purpose: inspect the named file; if it is a harmless fixture, exclude it in `collect-runtime-deps.mjs` deliberately (never weaken the server check). |

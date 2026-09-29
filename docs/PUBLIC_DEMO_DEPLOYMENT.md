# PUBLIC_DEMO_DEPLOYMENT — the application contract for the public portfolio demo

> **Scope.** This document describes what the _application_ guarantees and expects
> when it is hosted as a **shared, disposable public demo**. It is the contract a
> future infrastructure task (AWS Lightsail, Caddy, systemd, Route 53, GitHub Actions
> deployment) builds against. **No infrastructure is defined in this repository** — no
> Caddyfile, no unit files, no cloud configuration, no deploy workflow, no Docker.
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

The backend should eventually **bind only to loopback**: `HOST=127.0.0.1`. The expected
production port is **`8102`** (`PORT=8102`), set through the environment — nothing in
application code hard-codes it. The default remains `3000` for local development.

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

Intended layout (infrastructure task): immutable releases under
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
blocks ordinary browser access. Infrastructure may add the same header for the static
sites.

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

## 14. Runbook sketch (for the infrastructure task; not implemented here)

```
npm ci
npm run verify                                   # lint + typecheck + tests + build
SEED_NOW=<iso> npm run db:baseline -- --out <artifact>/meridian-baseline.db
# ship apps/customer/dist, apps/operations/dist, apps/backend/dist + node_modules, the baseline
# start: NODE_ENV=production PUBLIC_DEMO=true HOST=127.0.0.1 PORT=8102 DATABASE_URL=file:/srv/.../meridian.db \
#        node apps/backend/dist/index.js       (npm run start:backend)
# daily: stop backend → cp baseline → meridian.db → start backend
```

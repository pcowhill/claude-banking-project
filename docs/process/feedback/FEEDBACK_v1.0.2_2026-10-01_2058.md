# Feedback — post-v1.0.0 task brief: production deployment pipeline for the public demo

- Milestone reviewed: v1.0.0 + the public-demo readiness follow-up (v1.0.1 feedback). This
  is a follow-on **deployment** task, not a new roadmap milestone.
- Date/time: 2026-10-01 20:58 (session start, UTC)
- Source session label (if known): Claude Code Cloud session branch
  `claude/nice-lovelace-i7sj6j`

## Raw feedback (verbatim — DO NOT EDIT)

````text
You are working in:
https://github.com/pcowhill/claude-banking-project
Your task is to implement the production deployment pipeline for the Meridian simulated banking public demo.
The server-side infrastructure is now installed and ready on AWS Lightsail.
Do NOT modify `pcowhill/cowhill-infrastructure`.
Before changing anything, thoroughly inspect this repository and also read the infrastructure contract:
Application-side contract:
`docs/PUBLIC_DEMO_DEPLOYMENT.md`
Infrastructure-side contract:
https://github.com/pcowhill/cowhill-infrastructure/blob/main/docs/meridian.md
Infrastructure registry:
https://github.com/pcowhill/cowhill-infrastructure/blob/main/server/apps/meridian/app.conf
Treat those contracts as authoritative.
Current infrastructure state
The infrastructure has already been applied successfully.
The following are installed and working:

* Node.js 22 on the Lightsail VM
* `deploy-meridian` deployment account
* `app-meridian` runtime account
* the dedicated Meridian deployment public key
* `/srv/apps/meridian`
* `/srv/apps/meridian/incoming`
* `/srv/apps/meridian/releases`
* `/srv/apps/meridian/data`
* `/run/lock/cowhill-meridian.lock`
* `/usr/local/sbin/cowhill-meridian-service`
* `meridian.service`
* `meridian-reset.service`
* `meridian-reset.timer`
* Caddy configuration for both Meridian hostnames

The application has NOT been deployed yet, so it is currently expected that:

* `/srv/apps/meridian/current` does not exist
* `/srv/apps/meridian/data/meridian.db` does not exist
* `meridian.service` is inactive because no ready release exists
* port 8102 is free

The daily reset timer is already active.
Public URLs
Customer:
https://banking.cowhill.dev
Operations:
https://banking-ops.cowhill.dev
There is NO separate public API hostname.
Both public sites proxy these same-origin paths to the one private backend:

* `/api/*`
* `/health`
* `/status`
* `/socket.io/*`

Backend:
`127.0.0.1:8102`
Server deployment contract
Use these exact values:

```
APP_ID=meridian
DEPLOY_USER=deploy-meridian

APP_ROOT=/srv/apps/meridian
INCOMING_DIR=/srv/apps/meridian/incoming
RELEASES_DIR=/srv/apps/meridian/releases
CURRENT_LINK=/srv/apps/meridian/current

CUSTOMER_ROOT=/srv/apps/meridian/current/customer
OPERATIONS_ROOT=/srv/apps/meridian/current/operations

BACKEND_ENTRYPOINT=/srv/apps/meridian/current/backend/index.js
NODE_MODULES_DIR=/srv/apps/meridian/current/node_modules

BASELINE_DB=/srv/apps/meridian/current/baseline/meridian-baseline.db
LIVE_DB=/srv/apps/meridian/data/meridian.db

READY_MARKER=/srv/apps/meridian/current/.release-ready
REVISION_FILE=/srv/apps/meridian/current/REVISION

HELPER=/usr/local/sbin/cowhill-meridian-service
LOCK_FILE=/run/lock/cowhill-meridian.lock
```

The runtime service already gets this environment from infrastructure:

```
NODE_ENV=production
PUBLIC_DEMO=true
HOST=127.0.0.1
PORT=8102
DATABASE_URL=file:/srv/apps/meridian/data/meridian.db
CORS_ORIGINS=https://banking.cowhill.dev,https://banking-ops.cowhill.dev
OPERATIONS_ORIGINS=https://banking-ops.cowhill.dev
LOG_LEVEL=info
```

Do not duplicate or replace this server configuration.
1. Repository Actions configuration
The following repository-level GitHub Actions settings already exist:
Variables:

```
LIGHTSAIL_HOST
LIGHTSAIL_USER
```

`LIGHTSAIL_USER` should be:

```
deploy-meridian
```

Secrets:

```
LIGHTSAIL_SSH_PRIVATE_KEY
LIGHTSAIL_KNOWN_HOSTS
```

The private key corresponds to the public key already installed for `deploy-meridian`.
Do NOT introduce additional secrets unless absolutely required.
There should be no application secrets: Meridian is a simulated public demo and has no real financial integrations.
2. Deployment trigger and relationship with existing CI
The existing CI workflow already runs:

* lint
* typecheck
* unit/integration tests
* build
* Playwright E2E tests

A production deployment must NEVER happen unless those checks succeed for the exact commit being deployed.
Prefer extending the existing CI workflow with appropriately gated release/deploy jobs rather than creating an independent push workflow that could race ahead of CI.
A good shape is:

```
verify ──┐
         ├──> package-release ──> deploy
e2e ─────┘
```

Requirements:

* Pull requests run validation/tests only.
* Pull requests must NEVER receive production SSH secrets.
* Pushes to `main` may package/deploy only after both `verify` and `e2e` succeed.
* `workflow_dispatch` may support deployment, but only when the selected ref is `main`.
* A branch other than `main` must never deploy.
* Deployment permissions should remain minimal, preferably `contents: read`.
* Do not use `pull_request_target`.
* Do not use `gh`.
* Do not deploy if any prerequisite job failed or was skipped unexpectedly.

If keeping packaging/deployment in a separate workflow is materially cleaner, that is acceptable only if you can guarantee it deploys the exact main commit only after its CI has succeeded. Explain the design.
3. Production frontend build
The public build must have:

```
VITE_PUBLIC_DEMO=true
```

Do NOT set:

```
VITE_API_URL
VITE_WS_URL
```

Production frontends intentionally use `window.location.origin`.
That means:
Customer:

```
https://banking.cowhill.dev/api/...
https://banking.cowhill.dev/socket.io/...
```

Operations:

```
https://banking-ops.cowhill.dev/api/...
https://banking-ops.cowhill.dev/socket.io/...
```

The production build must result in:

```
apps/customer/dist
apps/operations/dist
apps/backend/dist
```

Do not run Vite, TypeScript, npm builds, or Prisma generation on the Lightsail VM.
Everything is built in GitHub Actions.
4. Create a deterministic pristine baseline database
Every release must include:

```
baseline/meridian-baseline.db
```

Generate it in GitHub Actions using the existing:

```
npm run db:baseline
```

Use an explicit output path.
Set `SEED_NOW` to a stable value derived from the commit being deployed, preferably the commit timestamp, so re-building the same commit uses the same simulated point in time.
For example, derive it from Git:

```
git show -s --format=%cI "$TARGET_SHA"
```

Do not use the current wall-clock time if that would make repeated builds of the same commit semantically different.
Remember that bcrypt salts/row IDs may still make the database bytes differ; the important part is that the simulated seed time and content are reproducible.
Verify the produced file:

* exists
* is non-empty
* has the SQLite header
* can be opened through Prisma
* contains the expected core seeded rows

The server does NOT run migrations during deployment. It copies this already-migrated baseline into the live DB.
5. Build a clean immutable release artifact
Construct a release directory on the GitHub Actions runner.
Conceptual shape:

```
release/
    customer/
        index.html
        assets/...
        robots.txt
        ...

    operations/
        index.html
        assets/...
        robots.txt
        ...

    backend/
        index.js
        index.js.map
        ...

    node_modules/
        production runtime dependencies only

    baseline/
        meridian-baseline.db

    package.json
    REVISION
```

`.release-ready` must NOT be part of the uploaded artifact. It is created on the server only after the release has passed server-side validation.
`REVISION` must contain exactly the full Git commit SHA.
Include a minimal root `package.json` with `"type": "module"` if needed so `/usr/bin/node backend/index.js` has explicit, deterministic ESM semantics rather than relying on Node syntax detection.
Do not include:

* `.git`
* Playwright browser binaries
* test results
* development-only source where not needed
* `.env`
* secrets
* the development SQLite database
* Cypress/Playwright output
* unnecessary caches
* arbitrary user files

6. Production Node runtime dependencies
The backend bundle deliberately leaves runtime packages such as Fastify, Socket.IO, bcryptjs and Prisma external.
Therefore the release must contain everything required by:

```
/usr/bin/node backend/index.js
```

under its `node_modules/`.
Do NOT simply assume that copying a random subset of `node_modules` works.
Create a repeatable packaging mechanism for production runtime dependencies.
Requirements:

* no `npm install` on Lightsail;
* preserve the generated Prisma client and required Prisma engine/runtime files;
* `@simbank/shared` is bundled by tsup and should not require its source workspace at runtime;
* development-only dependencies should not be shipped when reasonably avoidable;
* do not ship Playwright browser installations;
* do not depend on workspace symlinks;
* the final release artifact should contain no symbolic links;
* `.bin` tooling is not needed by the running backend and should not be shipped merely for convenience;
* preserve any executable bits genuinely needed by runtime dependencies.

A pruned production dependency tree is acceptable if it is proven to work.
If `npm prune --omit=dev` is useful, perform it in a staging/copy context after all build/baseline work is complete and verify that Prisma runtime artifacts remain intact.
If another solution is more reliable, use it and document it.
Do NOT make major application architecture changes merely to simplify packaging.
7. Smoke-test the exact release artifact before deployment
This is important.
Do not merely test the source checkout and then assume the packaged release works.
After constructing `release/`, test the actual release directory.
Use Node.js 22 in Actions.
Create a temporary live database copied from the packaged baseline and launch approximately:

```
NODE_ENV=production
PUBLIC_DEMO=true
HOST=127.0.0.1
PORT=<unused test port>
DATABASE_URL=file:<temporary DB>
CORS_ORIGINS=https://banking.cowhill.dev,https://banking-ops.cowhill.dev
OPERATIONS_ORIGINS=https://banking-ops.cowhill.dev
```

Then execute:

```
node release/backend/index.js
```

Poll:

```
/health
/status
```

Require:

* `/health` HTTP 200
* `/status` HTTP 200
* `status == "ok"`
* `database.connected == true`
* `publicDemo == true`

Shut the process down cleanly afterward.
This smoke test must use the SAME packaged backend and node_modules that will be uploaded.
Also validate:

* `release/customer/index.html` exists
* `release/operations/index.html` exists
* baseline exists
* `REVISION` exactly equals the commit
* there are no symlinks anywhere in `release/`
* there are no obvious private keys or `.env` files
* static trees contain only regular files/directories
* no frontend dotfiles unless intentionally required

8. Package integrity between jobs
If packaging and deployment are separate jobs, archive the finished release into a tarball and upload it as a GitHub Actions artifact.
Generate SHA-256 for the archive.
The deployment job must:

* download the artifact;
* verify its SHA-256;
* extract it;
* repeat inexpensive structural checks before connecting to Lightsail.

Use a short artifact retention period.
Do not expose deployment secrets to the packaging job.
9. SSH configuration
The deployment job should verify the required configuration exists before connecting.
Required:
Variables:

```
LIGHTSAIL_HOST
LIGHTSAIL_USER
```

Secrets:

```
LIGHTSAIL_SSH_PRIVATE_KEY
LIGHTSAIL_KNOWN_HOSTS
```

Write the private key to a temporary runner file with mode 0600.
Sanity-check it using `ssh-keygen` without printing it.
Write the provided known-hosts data exactly.
Verify it contains an entry matching `LIGHTSAIL_HOST`.
Use an SSH config equivalent to:

```
Host meridian
    HostName <LIGHTSAIL_HOST>
    User deploy-meridian
    Port 22
    IdentityFile <private-key-file>
    IdentitiesOnly yes
    UserKnownHostsFile <known-hosts-file>
    StrictHostKeyChecking yes
    BatchMode yes
```

Never:

* use `StrictHostKeyChecking=no`
* use `accept-new`
* run `ssh-keyscan` during deployment
* print the private key
* echo secrets
* use the infrastructure deployment key
* use the lightsail-demo deployment key

Clean the SSH files from the runner in an `always()` step.
10. SSH preflight
Before uploading anything, verify:

```
ssh meridian 'id -un'
```

must return:

```
deploy-meridian
```

Also verify the restricted sudo contract works:

```
sudo -n /usr/local/sbin/cowhill-meridian-service status
```

Do not require the backend to be running on the first deployment.
A pre-deployment service state of inactive/condition-skipped is expected.
11. Public DNS/TLS preflight BEFORE changing current
Before modifying the server release, verify from the GitHub runner that BOTH public hostnames:

```
banking.cowhill.dev
banking-ops.cowhill.dev
```

resolve and complete a valid HTTPS handshake.
Because this is before the first application deployment, acceptable HTTP results include expected infrastructure states such as:

* static 404
* backend 502

Do not require an application HTTP 200 yet.
The purpose is to prove:

* DNS resolves;
* Caddy is reachable;
* TLS certificates are valid.

If either hostname cannot resolve or establish trusted HTTPS, abort BEFORE changing `/srv/apps/meridian/current`.
Do not disable TLS verification.
12. Prevent stale main deployments
Production deployments must be serialized.
Use a concurrency group such as:

```
meridian-production
```

with:

```
cancel-in-progress: false
```

The manual reset workflow described later must use the same concurrency group.
Also prevent an old queued workflow from deploying an obsolete main commit.
Immediately before publishing/switching a release, compare the target SHA against the current `refs/heads/main`.
Do not use `gh`.
For example, use Git itself or the GitHub API.
If:

```
TARGET_SHA != current main SHA
```

then report that the run is stale and exit successfully WITHOUT modifying the server.
This prevents queued workflows from temporarily rolling the public demo backward.
13. Upload the release
Use the application-specific deployment account.
Upload into:

```
/srv/apps/meridian/incoming/<full-sha>/
```

Use rsync over the pinned SSH connection.
Do not follow or upload symlinks.
Do not upload directly into `releases/`.
Do not upload directly into `current`.
Do not touch:

```
/srv/apps/meridian/data
```

Preserve runtime executable bits where required.
Do not blindly force every file to 0644 during upload if that would break a required native/runtime executable.
The server-side publish step will remove group/world write access using:

```
chmod -R u=rwX,go=rX
```

so preserve meaningful source executable bits through the archive/rsync operation.
14. Server-side validation and immutable publication
After upload, execute a bounded, non-interactive SSH command as `deploy-meridian`.
Use:

```
set -euo pipefail
```

Validate the incoming release before publishing.
At minimum require:

* full SHA is exactly 40 lowercase hex characters;
* `REVISION` contains exactly that SHA;
* customer `index.html` exists;
* operations `index.html` exists;
* backend `index.js` exists;
* `node_modules/` exists;
* baseline DB exists;
* baseline is a non-empty regular file;
* baseline starts with the SQLite header;
* no symlinks anywhere in the incoming release;
* customer/operations static trees contain only directories and regular files;
* no dotfiles under the static roots unless intentionally required;
* no group/world-writable files.

Then publish to:

```
/srv/apps/meridian/releases/<sha>
```

The release becomes immutable-by-convention once ready.
Do not overwrite an already-ready release for the same SHA.
Make reruns safe:

* if a valid ready release for this SHA already exists with matching `REVISION`, reuse it;
* if an incomplete release for this SHA exists and it is NOT current, it may be safely removed/recreated;
* never remove or overwrite the release that `current` points at.

After publication:

```
chmod -R u=rwX,go=rX <release>
```

Then create:

```
.release-ready
```

LAST.
The marker means every required part of the release is complete.
15. Capture rollback target
Before switching `current`, determine whether a previous release is active.
Resolve:

```
/srv/apps/meridian/current
```

if it exists.
Accept it as a rollback target ONLY if:

* it resolves beneath `/srv/apps/meridian/releases/`;
* it is not the new release;
* it has `.release-ready`;
* its `REVISION` matches its release name.

Record that path for rollback.
On the first deployment there will be no rollback target. That is expected.
16. Atomically switch current under the shared lock
The deployment lock is:

```
/run/lock/cowhill-meridian.lock
```

Use it exactly as the infrastructure contract specifies.
Open it read-only and acquire:

```
flock -w 300
```

While holding the lock:

1. Recheck that the release is ready.
2. Recheck that the run is not stale where practical.
3. Create a temporary symlink in `/srv/apps/meridian`.
4. Atomically replace `current` with that symlink using `mv -T`.

Conceptually:

```
exec 9</run/lock/cowhill-meridian.lock
flock -w 300 9

ln -sfn /srv/apps/meridian/releases/<sha> /srv/apps/meridian/current.tmp
mv -T /srv/apps/meridian/current.tmp /srv/apps/meridian/current

flock -u 9
exec 9<&-
```

Use a safely unique temporary symlink name if appropriate.
IMPORTANT:
The `reset` helper takes this SAME non-reentrant lock itself.
Therefore:
RELEASE THE LOCK BEFORE CALLING RESET.
Never run:

```
sudo ... reset
```

while holding the lock.
17. Reset the public demo after every successful release switch
For this public portfolio demo, deployment should intentionally start from pristine data.
After releasing the deployment lock, execute:

```
sudo -n /usr/local/sbin/cowhill-meridian-service reset
```

This trusted infrastructure helper:

* takes the lock itself;
* stops the service;
* verifies the release baseline;
* replaces the entire live SQLite DB;
* removes old SQLite sidecars;
* starts the backend;
* verifies local `/health`;
* verifies local `/status`;
* requires DB connectivity;
* requires `PUBLIC_DEMO=true`.

A non-zero result is a failed deployment.
Do not manually copy the live DB from the GitHub workflow.
Do not invoke Prisma on the VM.
Do not implement another reset mechanism here.
18. Verify deployed revision on the server
After reset succeeds, verify over SSH:

```
readlink -f /srv/apps/meridian/current
cat /srv/apps/meridian/current/REVISION
sudo -n /usr/local/sbin/cowhill-meridian-service status
```

Require `REVISION` to equal `TARGET_SHA`.
Do not expose journal access to the deploy account.
19. Public post-deployment verification
Poll the public customer site with retries.
Require:

```
https://banking.cowhill.dev/status
```

to return HTTP 200 with JSON containing:

```
status = ok
publicDemo = true
database.connected = true
```

Also verify:
Customer:

```
https://banking.cowhill.dev/
https://banking.cowhill.dev/dashboard
https://banking.cowhill.dev/health
```

Operations:

```
https://banking-ops.cowhill.dev/
https://banking-ops.cowhill.dev/queues
https://banking-ops.cowhill.dev/health
```

Require appropriate HTTP 200 responses.
Verify static responses include:

```
X-Robots-Tag: noindex, nofollow
```

Verify the public-demo warning is present in the rendered/static application where practical.
Also perform a lightweight Socket.IO transport smoke test through at least one public hostname, for example the normal Engine.IO polling handshake under:

```
/socket.io/?EIO=4&transport=polling
```

Do not attempt to bypass authentication to test privileged operator events.
20. Rollback on failed activation
Deployment must distinguish failures BEFORE and AFTER switching `current`.
Failure before switch
If build, artifact validation, SSH preflight, DNS/TLS preflight, upload, or incoming-release validation fails:

* do not modify `current`;
* do not reset the live DB;
* fail the workflow.

Failure after switch
If:

* reset fails;
* the backend does not become healthy;
* revision verification fails;
* public application verification fails after reasonable retries;

then attempt rollback IF a valid previous release was captured.
Rollback procedure:

1. Under the shared lock, atomically point `current` back to the previous ready release.
2. Release the lock.
3. Call:


```
sudo -n /usr/local/sbin/cowhill-meridian-service reset
```

This intentionally resets to the previous release's pristine baseline. Visitor data is disposable by design.

4. Verify `/status` again.

If rollback succeeds:

* report clearly that the new deployment failed and was rolled back;
* still fail the workflow so the bad release is visible.

If rollback fails:

* attempt:


```
sudo -n /usr/local/sbin/cowhill-meridian-service stop
```

* report a high-visibility failure;
* leave the service down rather than pretending deployment succeeded.

On the FIRST deployment there is no previous release. If first activation fails, leave the service in the safe state produced by the helper and fail clearly.
Do not silently restore old visitor-generated data.
21. Release pruning
Only prune releases AFTER the new release has:

* reset successfully;
* passed local verification;
* passed public verification.

Never prune:

* the current release;
* the immediate previous valid release needed for rollback.

Because this is a small Lightsail instance, avoid accumulating large Node release trees indefinitely.
Retain at least:

```
current release
+ one previous ready release
```

Keeping one additional recent ready release is acceptable if disk usage is reasonable.
Prune old `incoming/` directories safely as well.
Do not touch:

```
/srv/apps/meridian/data
```

during pruning.
22. Manual "Reset demo data" workflow
Add a separate manually-triggered workflow for resetting the shared public demo without deploying code.
A reasonable filename is:

```
.github/workflows/reset-demo.yml
```

It must:

* use `workflow_dispatch` only;
* use the same repository variables/secrets;
* use the same strict SSH/known-hosts configuration;
* expect `deploy-meridian`;
* use the SAME GitHub Actions concurrency group as production deployment:


```
meridian-production
```

with `cancel-in-progress: false`;

* execute ONLY:


```
sudo -n /usr/local/sbin/cowhill-meridian-service reset
```

for the state-changing operation;

* not take the server lock itself, because the helper takes it;
* afterward verify public `/status` shows:
   * status ok
   * database connected
   * publicDemo true;
* verify both customer and operations roots answer successfully.

Do not implement another DB-copy routine in GitHub Actions.
23. Workflow security
Review this carefully.
Production secrets must only be accessible to the deployment/reset jobs that actually need them.
They must not be exposed to:

* PR jobs;
* lint/tests;
* packaging scripts;
* arbitrary branch code.

Keep Actions permissions minimal.
Do not:

* use `pull_request_target`;
* upload the SSH private key as an artifact;
* put secrets into command-line arguments when avoidable;
* print environment dumps;
* enable shell tracing around secrets;
* weaken host verification;
* dynamically download shell scripts and pipe them into a shell;
* use `gh`;
* allow arbitrary user-provided server commands through workflow inputs.

Manual workflow inputs, if any, must be tightly enumerated and must not be interpolated into SSH commands unsafely.
24. Prefer maintainable deployment scripts over giant YAML shell blocks
Do not put hundreds of lines of fragile shell directly into workflow YAML.
Prefer small source-controlled scripts under an appropriate location such as:

```
scripts/deploy/
```

Possible responsibilities:

```
build-release
validate-release
deploy-release
verify-public
```

The exact implementation language is your choice.
Shell scripts must use:

```
set -Eeuo pipefail
```

and should pass shellcheck.
Node scripts are also acceptable where structured JSON/package processing is clearer.
Keep server-side remote commands fixed and auditable.
25. Deployment tests
Add automated tests for deployment logic where practical.
At minimum test locally/CI without contacting production:

* release validation rejects missing customer app;
* rejects missing operations app;
* rejects missing backend;
* rejects missing/empty/non-SQLite baseline;
* rejects bad REVISION;
* rejects symlinks;
* rejects unsafe static-tree entries;
* release package contains no secrets/.env;
* packaged backend boots with its packaged `node_modules`;
* public-demo posture smoke test works;
* stale SHA detection logic;
* rollback target validation;
* current-switch command is under the lock;
* reset is called only AFTER releasing the lock;
* deploy workflow cannot run for pull requests;
* deploy workflow cannot run from a non-main ref;
* reset workflow uses the same concurrency group;
* SSH configuration requires strict host-key verification;
* workflow contains no `ssh-keyscan`;
* workflow contains no `gh`;
* workflow does not run npm/build/Prisma remotely.

Do not contact the real Lightsail server during pull-request validation.
26. Update documentation
Update `docs/PUBLIC_DEMO_DEPLOYMENT.md` so it no longer describes deployment as purely future work.
Document the actual workflow and release process.
Also update README as appropriate.
Document:

* automatic deployment after successful main CI;
* exact release shape;
* runtime dependency packaging;
* baseline generation;
* server paths;
* Actions variables/secrets;
* immutable releases;
* locking;
* reset-on-deploy;
* daily reset remains infrastructure-owned;
* manual GitHub Actions reset workflow;
* rollback;
* pruning;
* troubleshooting;
* how to inspect deployment status;
* no Docker;
* no remote npm/build;
* no separate API hostname.

Make clear that application deployment and infrastructure deployment remain separate responsibilities.
27. Existing application behavior must remain unchanged
Do not weaken or remove:

* authentication
* CSRF
* separate customer/operations sessions
* RBAC
* seeded-account public-demo protections
* rate limiting
* privacy handling
* resource caps
* deterministic baseline support
* simulation warnings
* noindex behavior
* existing tests

Local development must continue working exactly as before.
Do not turn Meridian into a real banking application.
28. Validation before opening the PR
Run at minimum:

```
npm ci
npm run db:reset
npm run verify
npm run test:e2e
```

Also run all new deployment/release packaging tests.
Actually build a production public-demo release artifact.
Actually smoke-test the packaged backend using Node 22 and the packaged runtime dependencies.
Validate workflow YAML.
Shellcheck any new shell scripts.
Confirm the final release artifact contains no symlinks or secret material.
Do NOT test the new production deployment against the real Lightsail server from the feature branch.
The real deployment must happen only from `main`.
29. Git workflow

1. Start from the current `main`.
2. Create a descriptive feature branch.
3. Implement the deployment pipeline.
4. Run all tests.
5. Review the entire diff.
6. Commit.
7. Push.
8. Open a pull request into `main`.

DO NOT merge the PR automatically.
Merging this PR will be the first real Meridian application deployment, so I want to review the workflow before it runs against Lightsail.
30. Final report
When finished, report:

1. Branch name.
2. Pull request URL.
3. Significant files added/changed.
4. Workflow/job dependency design.
5. Exactly when production deployment is allowed to run.
6. Production release directory shape.
7. How production `node_modules` is constructed.
8. How Prisma runtime files are preserved.
9. Confirmation that the exact packaged release was smoke-tested.
10. Baseline generation strategy and `SEED_NOW` value source.
11. Artifact integrity/checksum design.
12. SSH/known-hosts security.
13. Stale-main protection.
14. Server publication procedure.
15. Locking/current-switch procedure.
16. Reset-on-deployment procedure.
17. Public verification performed by the workflow.
18. Rollback procedure.
19. Release-retention/pruning policy.
20. Manual reset-workflow design.
21. Exact validation commands/results.
22. Confirmation that PR validation never contacts production.
23. Confirmation that no new secrets are required beyond the existing four Actions settings.
24. Any assumptions or decisions I should review before merging.

Do not stop at merely creating a workflow file. Treat this as the production handoff for the existing public-demo application and bring it to a thoroughly tested, reviewable state.
````

## Claude's interpretation

Not a roadmap milestone: the **production deployment pipeline** for the public demo,
now that the server side (`pcowhill/cowhill-infrastructure`, contract version 1) is
installed. Both contracts were read first (`docs/PUBLIC_DEMO_DEPLOYMENT.md` here;
`docs/meridian.md`, `server/apps/meridian/app.conf`, the helper
`cowhill-meridian-service.sh`, the sudoers fragment, the units and the Caddyfile there —
read-only, the infrastructure repository was **not** modified). The application
repository builds and ships an immutable release; the server never builds. The human
wants a PR to review — merging it is the first real deployment — so nothing was run
against Lightsail from the feature branch.

## Resulting task changes

A new board section **"Production deployment pipeline (post-v1.0.0)"** with tasks
`D-01…D-14` in `TASK_BOARD.md`. No roadmap change (`ROADMAP.md` untouched).

## Accepted feedback

All 30 points accepted. Shape: `verify` + `e2e` → `package-release` → `deploy` in
`ci.yml` (no separate push workflow); `reset-demo.yml`; scripts in `scripts/deploy/`
(build, runtime-dependency collection, baseline check, smoke test, validation, archive /
extract, SSH setup / cleanup, the orchestrator with rollback, the HTTP verifier, the
server-side release script) with 129 deployment tests; docs (§14–§20 of
`docs/PUBLIC_DEMO_DEPLOYMENT.md`, README, architecture).

## Deferred feedback

None.

## Rejected or modified feedback

- **Branch naming (item 29.2):** this Claude Code Cloud session is bound to the
  provisioned branch `claude/nice-lovelace-i7sj6j`; it is used as the feature branch
  (intended descriptive name: `feature/production-deployment-pipeline`), per the
  repository's convention for session branches.
- **`package-release` also runs on pull requests** (as a dry run, after verify + e2e,
  no secrets, no artifact upload). The brief's shape had it on `main` only; running it
  on PRs means a change that breaks packaging or the packaged boot is caught before the
  merge that would deploy it. Deployment itself stays `main`-only.
- **One additive application change:** `GET /status` now also reports `revision` (the
  release's `REVISION` file; `null` in local development) so the public verification
  can prove the new release — not the old process — is serving. Nothing else in the
  application changed.
- **"Recheck that the run is not stale" while holding the lock (item 16.2):** the
  server cannot query GitHub, so staleness is re-checked on the runner immediately
  before the switch; inside the lock the switch re-checks readiness and performs a
  **compare-and-swap** on `current` (it must still be what the deployment captured),
  which covers any concurrent change on the server.
- **CI now runs on Node.js 22** (was 20) to match the server runtime; `engines` still
  says `>=20`.

## Questions carried forward

- Optionally move the four Actions settings into a GitHub **environment** (e.g.
  `production`) restricted to `main`, so even a workflow edited on another branch could
  not read them (repository secrets are readable by any branch's workflow run by a
  collaborator with write access).
- GitHub keeps only one pending job per concurrency group, so an intermediate queued
  deployment can be cancelled by GitHub; the newest run still deploys `main`
  (documented in §14).

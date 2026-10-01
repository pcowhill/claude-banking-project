// Security properties of the GitHub Actions workflows and the deployment
// scripts, checked statically: who can deploy, which job sees secrets, the
// shared concurrency group, strict host keys, no ssh-keyscan / gh /
// pull_request_target, and no npm/build/Prisma on the server.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { DEPLOY_DIR, REMOTE_SCRIPT, REPO_ROOT } from './helpers';

type Step = {
  name?: string;
  uses?: string;
  run?: string;
  if?: string;
  env?: Record<string, string>;
  with?: Record<string, unknown>;
};
type Job = {
  needs?: string[];
  if?: string;
  permissions?: unknown;
  concurrency?: { group: string; 'cancel-in-progress': boolean | string };
  env?: Record<string, string>;
  steps: Step[];
};
type Workflow = {
  on: Record<string, unknown>;
  permissions?: unknown;
  concurrency?: Job['concurrency'];
  jobs: Record<string, Job>;
};

const WORKFLOWS_DIR = join(REPO_ROOT, '.github', 'workflows');
const readText = (path: string) => readFileSync(path, 'utf8');
const load = (name: string) => parse(readText(join(WORKFLOWS_DIR, name))) as Workflow;
const ci = load('ci.yml');
const reset = load('reset-demo.yml');
const allWorkflowFiles = readdirSync(WORKFLOWS_DIR).filter((f) => /\.ya?ml$/.test(f));

/** Shell scripts and Node scripts that make up the deployment (tests excluded). */
const deployScripts = [
  ...readdirSync(DEPLOY_DIR)
    .filter((f) => /\.(sh|mjs)$/.test(f))
    .map((f) => join(DEPLOY_DIR, f)),
  join(DEPLOY_DIR, 'lib', 'common.sh'),
  REMOTE_SCRIPT,
];

/** Strip `#` comment lines so documentation does not trip the scans. */
const code = (text: string) =>
  text
    .split('\n')
    .filter((line) => !/^\s*(#|\/\/)/.test(line))
    .join('\n');

interface Ctx {
  event: string;
  ref: string;
  results?: Record<string, string>;
}

/**
 * Evaluate a job-level `if:` the way GitHub does for the subset used here:
 * string comparisons on github.ref / github.event_name / needs.<job>.result,
 * && / || / parentheses, and the implicit `success() &&` when the expression
 * calls no status function (every needed job must have succeeded).
 */
function evaluateIf(job: Job, ctx: Ctx): boolean {
  const results = ctx.results ?? {};
  const implicitSuccess = (job.needs ?? []).every((n) => (results[n] ?? 'success') === 'success');
  if (!job.if) return implicitSuccess;
  let expr = job.if.replace(/^\$\{\{|\}\}$/g, '').trim();
  expect(expr).not.toMatch(/\b(always|failure|cancelled)\(\)/);
  expr = expr
    .replace(/needs\.([\w-]+)\.result/g, (_m, name: string) =>
      JSON.stringify(results[name] ?? 'success'),
    )
    .replace(/github\.event_name/g, JSON.stringify(ctx.event))
    .replace(/github\.ref/g, JSON.stringify(ctx.ref))
    .replace(/'([^']*)'/g, (_m, s: string) => JSON.stringify(s))
    .replace(/!=/g, '!==')
    .replace(/([^!=])==/g, '$1===');
  const leftover = expr.replace(/"[^"]*"/g, '');
  expect(leftover, `unsupported expression: ${job.if}`).toMatch(/^[\s()&|!=]*$/);
  return implicitSuccess && Boolean(new Function(`return (${expr});`)());
}

const ALL_OK = { verify: 'success', e2e: 'success', 'package-release': 'success' };

describe('ci.yml — deployment gating', () => {
  it('has the verify/e2e → package-release → deploy shape', () => {
    expect(Object.keys(ci.jobs).sort()).toEqual(['deploy', 'e2e', 'package-release', 'verify']);
    expect(ci.jobs['package-release'].needs).toEqual(['verify', 'e2e']);
    expect(ci.jobs.deploy.needs).toEqual(['verify', 'e2e', 'package-release']);
  });

  it('triggers on push to main, pull requests and manual runs — never pull_request_target', () => {
    expect(Object.keys(ci.on).sort()).toEqual(['pull_request', 'push', 'workflow_dispatch']);
    expect((ci.on.push as { branches: string[] }).branches).toEqual(['main']);
  });

  it('deploys for a push to main and a manual run on main when every prerequisite succeeded', () => {
    expect(
      evaluateIf(ci.jobs.deploy, { event: 'push', ref: 'refs/heads/main', results: ALL_OK }),
    ).toBe(true);
    expect(
      evaluateIf(ci.jobs.deploy, {
        event: 'workflow_dispatch',
        ref: 'refs/heads/main',
        results: ALL_OK,
      }),
    ).toBe(true);
  });

  it('never deploys for pull requests', () => {
    for (const ref of ['refs/pull/12/merge', 'refs/heads/main']) {
      expect(evaluateIf(ci.jobs.deploy, { event: 'pull_request', ref, results: ALL_OK })).toBe(
        false,
      );
    }
  });

  it('never deploys from a ref other than main', () => {
    for (const event of ['push', 'workflow_dispatch']) {
      for (const ref of [
        'refs/heads/feature',
        'refs/heads/main-backup',
        'refs/tags/v1.0.0',
        'refs/heads/maint',
      ]) {
        expect(evaluateIf(ci.jobs.deploy, { event, ref, results: ALL_OK })).toBe(false);
      }
    }
  });

  it('never deploys for other events', () => {
    for (const event of [
      'pull_request_target',
      'schedule',
      'repository_dispatch',
      'workflow_run',
    ]) {
      expect(evaluateIf(ci.jobs.deploy, { event, ref: 'refs/heads/main', results: ALL_OK })).toBe(
        false,
      );
    }
  });

  it('never deploys when a prerequisite failed, was skipped or cancelled', () => {
    for (const job of ['verify', 'e2e', 'package-release']) {
      for (const result of ['failure', 'skipped', 'cancelled']) {
        const results = { ...ALL_OK, [job]: result };
        expect(
          evaluateIf(ci.jobs.deploy, { event: 'push', ref: 'refs/heads/main', results }),
          `${job}=${result}`,
        ).toBe(false);
      }
    }
  });

  it('packages only after verify and e2e succeeded, and uploads the artifact only for main', () => {
    const pkg = ci.jobs['package-release'];
    expect(evaluateIf(pkg, { event: 'push', ref: 'refs/heads/main', results: ALL_OK })).toBe(true);
    expect(
      evaluateIf(pkg, {
        event: 'push',
        ref: 'refs/heads/main',
        results: { ...ALL_OK, e2e: 'failure' },
      }),
    ).toBe(false);
    expect(
      evaluateIf(pkg, {
        event: 'push',
        ref: 'refs/heads/main',
        results: { ...ALL_OK, verify: 'skipped' },
      }),
    ).toBe(false);
    const upload = pkg.steps.find((s) => s.uses?.startsWith('actions/upload-artifact'));
    expect(upload?.if).toBeDefined();
    const asJob = { if: upload!.if, steps: [] } as Job;
    expect(evaluateIf(asJob, { event: 'pull_request', ref: 'refs/pull/3/merge' })).toBe(false);
    expect(evaluateIf(asJob, { event: 'workflow_dispatch', ref: 'refs/heads/other' })).toBe(false);
    expect(evaluateIf(asJob, { event: 'push', ref: 'refs/heads/main' })).toBe(true);
    expect(Number(upload!.with?.['retention-days'])).toBeLessThanOrEqual(7);
  });

  it('serialises production in the meridian-production group, never cancelled', () => {
    expect(ci.jobs.deploy.concurrency).toEqual({
      group: 'meridian-production',
      'cancel-in-progress': false,
    });
  });

  it('only cancels superseded runs for pull requests (a new main push never kills a deploy)', () => {
    expect(String(ci.concurrency?.['cancel-in-progress'])).toBe(
      "${{ github.event_name == 'pull_request' }}",
    );
    expect(ci.concurrency?.group).toContain('github.sha');
  });

  it('builds and tests on Node.js 22 (the server runtime)', () => {
    expect(readText(join(WORKFLOWS_DIR, 'ci.yml'))).toMatch(/NODE_VERSION: 22/);
  });
});

describe('workflow secrets and permissions', () => {
  const secretSteps = (wf: Workflow) =>
    Object.entries(wf.jobs).flatMap(([jobName, job]) =>
      job.steps
        .filter((s) => JSON.stringify(s).includes('secrets.'))
        .map((s) => ({ jobName, step: s })),
    );

  it('ci.yml: only the deploy job sees secrets, in exactly one step, via env, feeding ssh-setup.sh', () => {
    for (const [name, job] of Object.entries(ci.jobs)) {
      if (name !== 'deploy')
        expect(JSON.stringify(job), name).not.toMatch(/secrets\.|vars\.LIGHTSAIL/);
    }
    const steps = secretSteps(ci);
    expect(steps).toHaveLength(1);
    expect(steps[0].jobName).toBe('deploy');
    expect(steps[0].step.run?.trim()).toBe(
      'scripts/deploy/ssh-setup.sh "${RUNNER_TEMP}/meridian-ssh"',
    );
    expect(steps[0].step.run).not.toContain('secrets.');
    expect(Object.keys(steps[0].step.env ?? {}).sort()).toEqual([
      'SSH_KNOWN_HOSTS',
      'SSH_PRIVATE_KEY',
    ]);
    expect(JSON.stringify(ci.jobs.deploy.env)).not.toContain('secrets.');
  });

  it('reset-demo.yml: secrets only in its one SSH setup step', () => {
    const steps = secretSteps(reset);
    expect(steps).toHaveLength(1);
    expect(steps[0].step.run?.trim()).toBe(
      'scripts/deploy/ssh-setup.sh "${RUNNER_TEMP}/meridian-ssh"',
    );
  });

  it('keeps permissions at contents: read everywhere', () => {
    for (const wf of [ci, reset]) {
      expect(wf.permissions).toEqual({ contents: 'read' });
      for (const job of Object.values(wf.jobs)) expect(job.permissions).toBeUndefined();
    }
  });

  it('removes the SSH files in an always() step after every secret-using job', () => {
    for (const job of [ci.jobs.deploy, reset.jobs.reset]) {
      const last = job.steps.at(-1)!;
      expect(last.if).toBe('${{ always() }}');
      expect(last.run).toContain('scripts/deploy/ssh-cleanup.sh');
    }
  });

  it('never persists checkout credentials where they are not needed', () => {
    for (const name of ['verify', 'e2e', 'package-release']) {
      const checkout = ci.jobs[name].steps.find((s) => s.uses?.startsWith('actions/checkout'));
      expect(checkout?.with?.['persist-credentials'], name).toBe(false);
    }
  });

  it('never sets the scripts’ test hooks', () => {
    for (const file of allWorkflowFiles)
      expect(readText(join(WORKFLOWS_DIR, file))).not.toMatch(/MERIDIAN_TEST_/);
  });
});

describe('reset-demo.yml', () => {
  it('is manual-only, without inputs, and only runs from main', () => {
    expect(Object.keys(reset.on)).toEqual(['workflow_dispatch']);
    expect(reset.on.workflow_dispatch).toBeNull();
    expect(
      evaluateIf(reset.jobs.reset, { event: 'workflow_dispatch', ref: 'refs/heads/main' }),
    ).toBe(true);
    expect(
      evaluateIf(reset.jobs.reset, { event: 'workflow_dispatch', ref: 'refs/heads/feature' }),
    ).toBe(false);
  });

  it('uses the same concurrency group as the production deployment', () => {
    expect(reset.jobs.reset.concurrency).toEqual({
      group: 'meridian-production',
      'cancel-in-progress': false,
    });
    expect(reset.jobs.reset.concurrency).toEqual(ci.jobs.deploy.concurrency);
  });

  it('runs only fixed remote commands, and the helper reset is the only state change', () => {
    const run = reset.jobs.reset.steps.map((s) => s.run ?? '').join('\n');
    const remote = [...run.matchAll(/meridian\s+(?:\\\s*)?'([^']+)'/g)].map((m) => m[1]);
    expect(remote).toEqual([
      'id -un',
      'sudo -n /usr/local/sbin/cowhill-meridian-service status',
      'sudo -n /usr/local/sbin/cowhill-meridian-service reset',
    ]);
    // It never takes the server lock itself (the helper does) and never copies a DB.
    expect(run).not.toMatch(
      /flock|cowhill-meridian\.lock|\bcp\b|sqlite|prisma|meridian-release\.sh/,
    );
    expect(run).toContain('verify-public.mjs live');
  });
});

describe('scripts and workflows: forbidden patterns', () => {
  const sources = [...allWorkflowFiles.map((f) => join(WORKFLOWS_DIR, f)), ...deployScripts];

  it.each(sources.map((s) => [s.slice(REPO_ROOT.length + 1), s]))('%s', (_label, path) => {
    const text = code(readText(path));
    expect(text).not.toMatch(/ssh-keyscan/);
    expect(text).not.toMatch(/StrictHostKeyChecking[ =]+(no|accept-new|off)/i);
    expect(text).not.toMatch(/accept-new/);
    expect(text).not.toMatch(/pull_request_target/);
    expect(text).not.toMatch(/(^|[\s;|&(`$])gh\s/m); // the GitHub CLI
    expect(text).not.toMatch(/\bset -[a-zA-Z]*x|set -o xtrace|\bprintenv\b|^\s*env\s*$/m);
    expect(text).not.toMatch(/(curl|wget)[^\n|]*\|\s*(ba|z)?sh\b/);
    expect(text).not.toMatch(
      /rejectUnauthorized:\s*false|NODE_TLS_REJECT_UNAUTHORIZED|curl[^\n]*\s(-k|--insecure)\b/,
    );
  });

  it('pins StrictHostKeyChecking yes in the generated SSH config', () => {
    const setup = readText(join(DEPLOY_DIR, 'ssh-setup.sh'));
    expect(setup).toMatch(/^\s*StrictHostKeyChecking yes$/m);
    expect(setup).toMatch(/^\s*BatchMode yes$/m);
    expect(setup).toMatch(/^\s*IdentitiesOnly yes$/m);
  });

  it('never runs npm, a build, Node or Prisma on the server', () => {
    const remote = code(readText(REMOTE_SCRIPT));
    // No such program in command position anywhere in the server-side script
    // (path checks such as node_modules/.prisma/client are fine).
    const commandPosition =
      /(^|[;&|(]|\$\(|\b(?:then|do|exec|sudo)\b)\s*(npm|npx|yarn|pnpm|prisma|vite|tsc|tsx|node|git|curl|wget)(\s|$)/m;
    expect(remote).not.toMatch(commandPosition);
    expect('  npm ci').toMatch(commandPosition); // the scan itself works
    expect('x=$(node -e 1)').toMatch(commandPosition);
    // The only remote invocations of the orchestrator: id -un and the streamed script.
    const deploy = code(readText(join(DEPLOY_DIR, 'deploy-release.sh')));
    const sshCalls = deploy.split('\n').filter((l) => /\bssh_meridian\s/.test(l));
    expect(sshCalls).toHaveLength(2);
    expect(sshCalls.some((l) => l.includes("ssh_meridian 60 'id -un'"))).toBe(true);
    expect(
      sshCalls.some((l) =>
        l.includes('ssh_meridian "${seconds}" "bash -s -- $*" < "${REMOTE_SCRIPT}"'),
      ),
    ).toBe(true);
    // Every other ssh use is rsync's transport over the same pinned config.
    const rawSsh = deploy.split('\n').filter((l) => /\bssh\s+-F/.test(l));
    expect(
      rawSsh.every(
        (l) =>
          l.includes('timeout --kill-after=15 "${seconds}" ssh -F') || l.includes('-e "ssh -F'),
      ),
    ).toBe(true);
    // The helper is only ever reached through the remote script's fixed actions.
    expect(deploy).not.toMatch(/(^|[;&|(]|\$\()\s*sudo\b/m);
  });

  it('builds everything on the runner (no build commands sent over SSH)', () => {
    const deploy = code(readText(join(DEPLOY_DIR, 'deploy-release.sh')));
    expect(deploy).not.toMatch(/\bnpm\b|\bnpx\b|prisma|vite/);
  });
});

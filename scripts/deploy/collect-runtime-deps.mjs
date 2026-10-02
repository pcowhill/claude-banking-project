#!/usr/bin/env node
// Meridian release packaging — production runtime dependencies for the backend.
//
//   node scripts/deploy/collect-runtime-deps.mjs --out <release>/node_modules
//
// The backend bundle (apps/backend/dist/index.js, built by tsup) inlines
// @simbank/shared but leaves its runtime packages external (Fastify, Socket.IO,
// bcryptjs, the Prisma client …). This script copies EXACTLY the transitive
// production dependency closure of @simbank/backend out of the repository's
// installed node_modules (the very tree `npm ci` produced and every CI test ran
// against) into a fresh directory, preserving Node's resolution layout:
//
//   <repo>/node_modules/<pkg>                     → <out>/<pkg>
//   <repo>/node_modules/<a>/node_modules/<b>      → <out>/<a>/node_modules/<b>
//
// Why not `npm prune --omit=dev` or `npm ci --omit=dev`? In this npm-workspaces
// monorepo those keep the frontends' production deps (React …), keep workspace
// SYMLINKS (node_modules/@simbank/*) and `.bin` links, and would need a second
// install. Walking the real tree is exact, offline and deterministic for a
// given package-lock.json.
//
// Rules (each enforced; any violation fails the build):
//   - dependencies + optionalDependencies + NON-optional peerDependencies are
//     followed, resolved the way Node does (nearest node_modules upwards, never
//     above the repository root); a missing required dependency is an error, a
//     missing optional one is skipped;
//   - workspace packages (@simbank/*) are never copied — tsup bundles them —
//     and the bundle is checked not to import them;
//   - every copied package must be a production package in package-lock.json
//     (no `"dev": true` entry ever ships);
//   - nested node_modules are only copied when they are part of the closure, so
//     no `.bin` directory and nothing unrelated is carried along;
//   - symbolic links, sockets, devices … anywhere → error (the release must
//     contain only regular files and directories);
//   - the generated Prisma client (node_modules/.prisma/client — schema, query
//     engine library, JS client) is copied whole next to @prisma/client;
//   - file modes are preserved (e.g. the Prisma query engine keeps its bits);
//   - every bare import of the bundle must resolve inside <out>.
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
  chmodSync,
} from 'node:fs';
import { builtinModules } from 'node:module';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const backendDir = join(repoRoot, 'apps', 'backend');
const bundlePath = join(backendDir, 'dist', 'index.js');
const WORKSPACE_SCOPE = '@simbank/';

function fail(message) {
  console.error(`[runtime-deps] ERROR: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') args.out = argv[++i];
    else if (argv[i].startsWith('--out=')) args.out = argv[i].slice('--out='.length);
    else fail(`unknown argument ${argv[i]}`);
  }
  if (!args.out) fail('usage: collect-runtime-deps.mjs --out <dir>');
  return args;
}

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

/** Resolve package `name` as Node would from directory `fromDir` (never above the repo root). */
function resolvePackageDir(name, fromDir) {
  let dir = fromDir;
  for (;;) {
    const candidate = join(dir, 'node_modules', name);
    if (existsSync(join(candidate, 'package.json'))) return candidate;
    if (dir === repoRoot) return null;
    const parent = dirname(dir);
    if (parent === dir || !parent.startsWith(repoRoot)) return null;
    dir = parent;
  }
}

/** `<repo>/node_modules/x/...` → `x/...`; `<repo>/apps/backend/node_modules/x` → `../backend/node_modules/x`. */
function destinationFor(sourceDir) {
  const rel = relative(repoRoot, sourceDir);
  const rootPrefix = `node_modules${sep}`;
  const backendPrefix = `apps${sep}backend${sep}node_modules${sep}`;
  if (rel.startsWith(rootPrefix)) return { base: 'out', rel: rel.slice(rootPrefix.length) };
  if (rel.startsWith(backendPrefix))
    return { base: 'backend', rel: rel.slice(backendPrefix.length) };
  fail(`dependency resolved outside the supported layout: ${rel}`);
}

const args = parseArgs(process.argv.slice(2));
const outDir = resolve(args.out);
if (!existsSync(bundlePath))
  fail(`backend bundle not found at ${bundlePath} (run the build first)`);
if (existsSync(outDir) && readdirSync(outDir).length > 0) fail(`${outDir} exists and is not empty`);
if ((outDir + sep).startsWith(repoRoot + sep))
  fail(`--out must be outside the repository (${outDir})`);

const lock = readJson(join(repoRoot, 'package-lock.json'));
const lockPackages = lock.packages ?? {};
const backendManifest = readJson(join(backendDir, 'package.json'));

// ---------------------------------------------------------------------------
// 1. Walk the closure.
// ---------------------------------------------------------------------------
/** @type {Map<string, {name: string, version: string}>} sourceDir → info */
const closure = new Map();
const queue = [];
const skippedWorkspace = new Set();
const skippedOptional = new Set();

function enqueueDeps(manifest, fromDir, owner) {
  const optionalPeers = new Set(
    Object.entries(manifest.peerDependenciesMeta ?? {})
      .filter(([, meta]) => meta && meta.optional)
      .map(([name]) => name),
  );
  const wanted = [
    ...Object.keys(manifest.dependencies ?? {}).map((name) => ({ name, optional: false })),
    ...Object.keys(manifest.optionalDependencies ?? {}).map((name) => ({ name, optional: true })),
    ...Object.keys(manifest.peerDependencies ?? {})
      .filter((name) => !optionalPeers.has(name))
      .map((name) => ({ name, optional: false })),
  ];
  for (const dep of wanted) queue.push({ ...dep, fromDir, owner });
}

enqueueDeps({ dependencies: backendManifest.dependencies }, backendDir, '@simbank/backend');

while (queue.length > 0) {
  const { name, optional, fromDir, owner } = queue.shift();
  if (name.startsWith(WORKSPACE_SCOPE)) {
    skippedWorkspace.add(name);
    continue;
  }
  const found = resolvePackageDir(name, fromDir);
  if (!found) {
    if (optional) {
      skippedOptional.add(name);
      continue;
    }
    fail(`${owner} needs "${name}" but it is not installed (run npm ci)`);
  }
  if (lstatSync(found).isSymbolicLink()) fail(`${name} resolves to a symlink (${found}); refusing`);
  const sourceDir = realpathSync(found);
  if (closure.has(sourceDir)) continue;
  const manifest = readJson(join(sourceDir, 'package.json'));
  if (manifest.bundleDependencies || manifest.bundledDependencies) {
    fail(`${name} declares bundled dependencies; extend this script before shipping it`);
  }
  const lockKey = relative(repoRoot, sourceDir).split(sep).join('/');
  const lockEntry = lockPackages[lockKey];
  if (!lockEntry) fail(`${lockKey} is installed but not in package-lock.json`);
  if (lockEntry.dev)
    fail(`${lockKey} is a dev-only package in package-lock.json; refusing to ship it`);
  closure.set(sourceDir, { name, version: manifest.version });
  enqueueDeps(manifest, sourceDir, name);
}

// ---------------------------------------------------------------------------
// 2. Copy (regular files + directories only; nested node_modules excluded —
//    the closure lists the nested packages that are really needed).
// ---------------------------------------------------------------------------
let fileCount = 0;
let byteCount = 0;

function copyTree(src, dest, { skipNodeModules }) {
  const st = lstatSync(src);
  if (st.isSymbolicLink())
    fail(`symbolic link in a runtime dependency: ${relative(repoRoot, src)}`);
  if (st.isDirectory()) {
    mkdirSync(dest, { recursive: true });
    chmodSync(dest, st.mode & 0o7777);
    for (const entry of readdirSync(src)) {
      if (skipNodeModules && entry === 'node_modules') continue;
      copyTree(join(src, entry), join(dest, entry), { skipNodeModules: false });
    }
    return;
  }
  if (!st.isFile()) fail(`not a regular file in a runtime dependency: ${relative(repoRoot, src)}`);
  copyFileSync(src, dest);
  chmodSync(dest, st.mode & 0o7777);
  fileCount += 1;
  byteCount += st.size;
}

// A package's own nested node_modules is never copied wholesale: only the
// packages the closure resolved there. (A package dir never IS "node_modules".)
function copyPackage(sourceDir) {
  const { base, rel } = destinationFor(sourceDir);
  const dest =
    base === 'out' ? join(outDir, rel) : join(outDir, '..', 'backend', 'node_modules', rel);
  copyTree(sourceDir, dest, { skipNodeModules: true });
}

mkdirSync(outDir, { recursive: true });
const sorted = [...closure.keys()].sort();
for (const sourceDir of sorted) copyPackage(sourceDir);

// The generated Prisma client lives beside @prisma/client as node_modules/.prisma.
const prismaClientDir = [...closure.entries()].find(
  ([, info]) => info.name === '@prisma/client',
)?.[0];
if (prismaClientDir) {
  const generated = join(dirname(dirname(prismaClientDir)), '.prisma', 'client');
  if (!existsSync(join(generated, 'index.js'))) {
    fail(`generated Prisma client not found at ${generated} (npm ci runs prisma generate)`);
  }
  const engines = readdirSync(generated).filter((f) => /^libquery_engine-.*\.so\.node$/.test(f));
  if (engines.length === 0) fail(`no Prisma query engine library in ${generated}`);
  if (!existsSync(join(generated, 'schema.prisma'))) fail(`no schema.prisma in ${generated}`);
  const { base, rel } = destinationFor(generated);
  if (base !== 'out') fail('the generated Prisma client must live in the root node_modules');
  copyTree(generated, join(outDir, rel), { skipNodeModules: true });
  console.log(`[runtime-deps] generated Prisma client: ${rel} (engine: ${engines.join(', ')})`);
}

// ---------------------------------------------------------------------------
// 3. Prove the bundle's bare imports resolve inside the new tree.
// ---------------------------------------------------------------------------
const bundle = readFileSync(bundlePath, 'utf8');
const specifiers = new Set();
const importPatterns = [
  /^\s*(?:import|export)\s[^;'"]*?\bfrom\s*["']([^"']+)["']/gm, // import x from "y"
  /^\s*import\s*["']([^"']+)["']/gm, // import "y"
  /\bimport\(\s*["']([^"']+)["']\s*\)/g, // import("y")
  /\b__require\(\s*["']([^"']+)["']\s*\)/g, // tsup's CJS interop shim
];
for (const pattern of importPatterns) {
  for (const match of bundle.matchAll(pattern)) {
    if (!/^[./]/.test(match[1])) specifiers.add(match[1]);
  }
}
if (specifiers.size === 0)
  fail('found no imports in the backend bundle; the import scan is broken');
const builtins = new Set(builtinModules.flatMap((m) => [m, `node:${m}`]));
for (const spec of [...specifiers].sort()) {
  if (builtins.has(spec) || spec.startsWith('node:')) continue;
  if (spec.startsWith(WORKSPACE_SCOPE))
    fail(`the bundle imports workspace package ${spec}; it must be bundled`);
  const pkgName = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
  if (!existsSync(join(outDir, pkgName, 'package.json'))) {
    fail(`the bundle imports "${spec}" but ${pkgName} is not in the runtime dependency tree`);
  }
}

// ---------------------------------------------------------------------------
// 4. Report.
// ---------------------------------------------------------------------------
const totalBytes = (() => {
  let total = 0;
  const walk = (p) => {
    const st = statSync(p);
    if (st.isDirectory()) for (const e of readdirSync(p)) walk(join(p, e));
    else total += st.size;
  };
  walk(outDir);
  return total;
})();
console.log(
  `[runtime-deps] ${closure.size} packages, ${fileCount} files, ${(byteCount / 1048576).toFixed(1)} MiB copied`,
);
for (const sourceDir of sorted) {
  const info = closure.get(sourceDir);
  console.log(
    `[runtime-deps]   ${relative(join(repoRoot, 'node_modules'), sourceDir)}@${info.version}`,
  );
}
if (skippedWorkspace.size)
  console.log(
    `[runtime-deps] bundled workspace packages (not copied): ${[...skippedWorkspace].join(', ')}`,
  );
if (skippedOptional.size)
  console.log(
    `[runtime-deps] optional packages not installed (skipped): ${[...skippedOptional].sort().join(', ')}`,
  );
console.log(
  `[runtime-deps] bare imports of the bundle resolved: ${[...specifiers]
    .filter((s) => !builtins.has(s))
    .sort()
    .join(', ')}`,
);
console.log(`[runtime-deps] OK — ${(totalBytes / 1048576).toFixed(1)} MiB in ${outDir}`);

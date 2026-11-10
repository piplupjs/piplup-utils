/**
 * Release script for @piplup/utils.
 *
 * Phases:
 *   1. Prompt    — interactive questions (tests, version bump, changelog)
 *   2. Prepare   — build + optional test run
 *   3. Version   — bump package.json versions, update cross-deps, show diff, update lockfile
 *   4. Changelog — prepend entry to CHANGELOG.md
 *   5. Commit    — git commit + tag
 *   6. Release   — npm publish (skipped in dry-run)
 *   7. Rollback  — revert everything (dry-run cleanup or error recovery)
 *
 * Usage:
 *   npm run release          # full release
 *   npm run release:dry      # dry run (reverts all changes at the end)
 *
 * Non-interactive (used by .github/workflows/release.yml):
 *   npm run release -- --bump patch --tests --changelog --push
 */

import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import semver from 'semver';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

// ─── Colors ───────────────────────────────────────────────────────────────────

const useColor = process.stdout.isTTY !== false;

const c = {
  reset: (s: string) => (useColor ? `\x1b[0m${s}\x1b[0m` : s),
  bold: (s: string) => (useColor ? `\x1b[1m${s}\x1b[0m` : s),
  dim: (s: string) => (useColor ? `\x1b[2m${s}\x1b[0m` : s),
  red: (s: string) => (useColor ? `\x1b[31m${s}\x1b[0m` : s),
  green: (s: string) => (useColor ? `\x1b[32m${s}\x1b[0m` : s),
  yellow: (s: string) => (useColor ? `\x1b[33m${s}\x1b[0m` : s),
  cyan: (s: string) => (useColor ? `\x1b[36m${s}\x1b[0m` : s),
  white: (s: string) => (useColor ? `\x1b[37m${s}\x1b[0m` : s),
};

/** Colorize a unified diff string line-by-line. */
function colorizeDiff(diff: string): string {
  return diff
    .split('\n')
    .map((line) => {
      if (line.startsWith('+++') || line.startsWith('---')) return c.bold(c.white(line));
      if (line.startsWith('@@')) return c.cyan(line);
      if (line.startsWith('diff ') || line.startsWith('index ')) return c.dim(line);
      if (line.startsWith('+')) return c.green(line);
      if (line.startsWith('-')) return c.red(line);
      return line;
    })
    .join('\n');
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const PACKAGES: ReadonlyArray<{ name: string; dir: string }> = [
  // Single-package repo: the publishable package is the repo root.
  { name: '@piplup/utils', dir: ROOT },
];

// ─── Types ────────────────────────────────────────────────────────────────────

type VersionBump = 'patch' | 'minor' | 'major';

interface Answers {
  runTests: boolean;
  versionBump: VersionBump;
  createChangelog: boolean;
}

interface ReleaseState {
  filesModified: boolean;
  committed: boolean;
  tagged: boolean;
  tagName: string;
}

type PackageJson = {
  name: string;
  version: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  [key: string]: unknown;
};

// ─── Shell Helpers ────────────────────────────────────────────────────────────

/** Run a command and return its stdout (throws on non-zero exit). */
function run(cmd: string, cwd: string = ROOT): string {
  return execSync(cmd, { cwd, encoding: 'utf8', stdio: 'pipe' }).trim();
}

/** Run a command with output piped directly to the terminal. */
function runInherited(cmd: string, cwd: string = ROOT): void {
  execSync(cmd, { cwd, stdio: 'inherit' });
}

// ─── Logging ──────────────────────────────────────────────────────────────────

function logPhase(label: string): void {
  const line = c.cyan('═'.repeat(60));
  console.log(`\n${line}`);
  console.log(`  ${c.bold(c.cyan(label))}`);
  console.log(`${line}\n`);
}

function step(msg: string): void {
  console.log(`  ${c.green('▸')} ${msg}`);
}

// ─── Interactive Prompt Helpers ───────────────────────────────────────────────

function question(rl: readline.Interface, prompt: string): Promise<string> {
  return new Promise((resolve) => rl.question(prompt, resolve));
}

async function selectChoice<T extends string>(
  rl: readline.Interface,
  prompt: string,
  choices: ReadonlyArray<{ label: string; value: T }>,
): Promise<T> {
  console.log(`\n  ${prompt}`);
  choices.forEach((c, i) => console.log(`    ${i + 1}) ${c.label}`));

  while (true) {
    const raw = await question(rl, `\n  Enter choice (1–${choices.length}): `);
    const n = parseInt(raw.trim(), 10);
    if (Number.isInteger(n) && n >= 1 && n <= choices.length) {
      const chosen = choices[n - 1]!;
      console.log(`  ✓ ${chosen.label}`);
      return chosen.value;
    }
    console.log(`  Invalid input — please enter a number between 1 and ${choices.length}.`);
  }
}

async function selectYesNo(rl: readline.Interface, prompt: string): Promise<boolean> {
  const value = await selectChoice(rl, prompt, [
    { label: 'Yes', value: 'yes' as const },
    { label: 'No', value: 'no' as const },
  ]);
  return value === 'yes';
}

// ─── Package JSON Helpers ─────────────────────────────────────────────────────

function readPkg(dir: string): PackageJson {
  return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')) as PackageJson;
}

function writePkg(dir: string, pkg: PackageJson): void {
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
}

/**
 * Update any workspace package entries inside a dependency group,
 * skipping entries that use the `file:` protocol.
 * The existing semver range prefix (^, ~, >=, …) is preserved.
 */
function applyVersionBumps(
  deps: Record<string, string> | undefined,
  releases: Map<string, string>,
): Record<string, string> | undefined {
  if (!deps) return undefined;

  let changed = false;
  const result: Record<string, string> = { ...deps };

  for (const [pkg, current] of Object.entries(result)) {
    if (!releases.has(pkg)) continue;
    // Never touch file: workspace links — they resolve locally
    if (current.startsWith('file:')) continue;

    const newVer = releases.get(pkg)!;
    // Preserve range prefix: everything before the first digit
    const prefix = /^([^\d]*)/.exec(current)![1];
    const updated = prefix + newVer;

    if (current !== updated) {
      result[pkg] = updated;
      changed = true;
    }
  }

  return changed ? result : deps;
}

/** Latest version of a package on npm, or `null` if it has never been published. */
function getPublishedVersion(name: string): string | null {
  try {
    return run(`npm view ${name} version`) || null;
  } catch {
    return null;
  }
}

// ─── Phase 1: Prompt ──────────────────────────────────────────────────────────

async function phasePrompt(preset: {
  [K in keyof Answers]?: Answers[K] | undefined;
}): Promise<Answers> {
  logPhase('PHASE 1 — Prompt');

  // Skip the questions when every answer was passed on the command line (e.g. in CI)
  if (
    preset.runTests !== undefined &&
    preset.versionBump !== undefined &&
    preset.createChangelog !== undefined
  ) {
    step(`Run tests: ${preset.runTests ? 'yes' : 'no'}`);
    step(`Version bump: ${preset.versionBump}`);
    step(`Update CHANGELOG.md: ${preset.createChangelog ? 'yes' : 'no'}`);
    return preset as Answers;
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  try {
    const runTests = await selectYesNo(rl, 'Run tests before releasing?');

    const versionBump = await selectChoice<VersionBump>(rl, 'Version bump type?', [
      { label: 'Patch  (x.x.+1) — bug fixes only', value: 'patch' },
      { label: 'Minor  (x.+1.0) — new backwards-compatible features', value: 'minor' },
      { label: 'Major  (+1.0.0) — breaking changes', value: 'major' },
    ]);

    const createChangelog = await selectYesNo(rl, 'Update CHANGELOG.md?');

    return { runTests, versionBump, createChangelog };
  } finally {
    rl.close();
  }
}

// ─── Phase 2: Prepare ─────────────────────────────────────────────────────────

async function phasePrepare(answers: Answers): Promise<void> {
  logPhase('PHASE 2 — Prepare');

  step('Checking git working tree…');
  const dirty = run('git status --porcelain');
  if (dirty) {
    console.error(
      '\n' +
        c.red(
          c.bold('  ✗ Working tree is not clean. Commit or stash your changes before releasing.'),
        ) +
        '\n',
    );
    console.error(c.dim(dirty) + '\n');
    process.exit(1);
  }
  step('Working tree is clean.');

  step('Building packages…');
  runInherited('npm run build');
  step('Build complete.');

  if (answers.runTests) {
    step('Running tests…');
    runInherited('npm run test');
    step('All tests passed.');
  } else {
    step('Tests skipped.');
  }
}

// ─── Phase 3: Version ─────────────────────────────────────────────────────────

async function phaseVersion(answers: Answers): Promise<string> {
  logPhase('PHASE 3 — Version');

  // Bump from whichever is higher: the version in the repo or the latest one on npm.
  // This keeps a release from colliding with a version that was published without being committed.
  const localVersion = readPkg(PACKAGES[0]!.dir).version;
  const currentVersion = PACKAGES.map((p) => getPublishedVersion(p.name)).reduce<string>(
    (max, v) => (v && semver.gt(v, max) ? v : max),
    localVersion,
  );
  if (currentVersion !== localVersion) {
    step(
      c.yellow(
        `npm already has ${currentVersion} (repo is at ${localVersion}); bumping from ${currentVersion}.`,
      ),
    );
  }
  const newVersion = semver.inc(currentVersion, answers.versionBump);
  if (!newVersion) {
    throw new Error(
      `semver.inc failed for version "${currentVersion}" with bump "${answers.versionBump}"`,
    );
  }

  step(`Bumping: ${c.yellow(currentVersion)} → ${c.green(c.bold(newVersion))}`);

  const releases = new Map(PACKAGES.map((p) => [p.name, newVersion]));

  for (const pkg of PACKAGES) {
    const pkgJson = readPkg(pkg.dir);
    pkgJson.version = newVersion;
    const deps = applyVersionBumps(pkgJson.dependencies, releases);
    const devDeps = applyVersionBumps(pkgJson.devDependencies, releases);
    const peerDeps = applyVersionBumps(pkgJson.peerDependencies, releases);
    if (deps !== undefined) pkgJson.dependencies = deps;
    if (devDeps !== undefined) pkgJson.devDependencies = devDeps;
    if (peerDeps !== undefined) pkgJson.peerDependencies = peerDeps;
    writePkg(pkg.dir, pkgJson);
    step(`Updated ${pkg.name}`);
  }

  step('Updating lockfile…');
  runInherited('npm install --package-lock-only');

  // Show a readable summary + focused diff so the user can review changes
  const stat = run('git diff --stat');
  if (stat) {
    console.log('\n' + c.bold(stat));
  }
  const pkgPaths = PACKAGES.map((p) => path.relative(ROOT, path.join(p.dir, 'package.json')));
  const pkgDiff = run(`git diff -- ${pkgPaths.join(' ')}`);
  if (pkgDiff) {
    console.log('\n' + colorizeDiff(pkgDiff) + '\n');
  }

  return newVersion;
}

// ─── Phase 4: Changelog ───────────────────────────────────────────────────────

async function phaseChangelog(answers: Answers, newVersion: string): Promise<void> {
  logPhase('PHASE 4 — Changelog');

  if (!answers.createChangelog) {
    step('Changelog update skipped.');
    return;
  }

  const changelogPath = path.join(ROOT, 'CHANGELOG.md');
  const today = new Date().toISOString().slice(0, 10);

  let commits: string;
  try {
    const lastTag = run('git describe --tags --abbrev=0');
    commits = run(`git log ${lastTag}..HEAD --format="- %s (%h)" --no-merges`);
  } catch {
    // No previous tag — use the last 20 commits as a fallback
    commits = run('git log --format="- %s (%h)" --no-merges -20');
  }

  const entry = [`## ${newVersion} (${today})`, '', commits || '- Version bump', '', ''].join('\n');

  const existing = fs.existsSync(changelogPath) ? fs.readFileSync(changelogPath, 'utf8') : '';
  fs.writeFileSync(changelogPath, entry + existing);

  step(`CHANGELOG.md updated for v${newVersion}`);
}

// ─── Phase 5: Commit ──────────────────────────────────────────────────────────

async function phaseCommit(newVersion: string, state: ReleaseState): Promise<void> {
  logPhase('PHASE 5 — Commit');

  const tag = `v${newVersion}`;

  run('git add -A');
  run(`git commit -m "chore: release ${tag}"`);
  state.committed = true;
  step(`Committed: "chore: release ${tag}"`);

  run(`git tag ${tag}`);
  state.tagged = true;
  state.tagName = tag;
  step(`Tagged: ${tag}`);
}

// ─── Phase 6: Release ─────────────────────────────────────────────────────────

async function phaseRelease(dryRun: boolean): Promise<void> {
  logPhase('PHASE 6 — Release');

  if (dryRun) {
    step('[DRY RUN] Skipping npm publish. Would have published:');
    for (const pkg of PACKAGES) {
      step(`  • ${pkg.name}`);
    }
    return;
  }

  for (const pkg of PACKAGES) {
    step(`Publishing ${pkg.name}…`);
    runInherited('npm publish --access public', pkg.dir);
    step(`Published ${pkg.name}.`);
  }
}

// ─── Push ─────────────────────────────────────────────────────────────────────

async function phasePush(state: ReleaseState): Promise<void> {
  logPhase('PUSH');

  run(`git push origin HEAD refs/tags/${state.tagName}`);
  step(`Pushed the release commit and tag ${state.tagName}.`);
}

// ─── Phase 7: Rollback ────────────────────────────────────────────────────────

async function phaseRollback(state: ReleaseState, reason: 'dry-run' | 'error'): Promise<void> {
  logPhase(`PHASE 7 — Rollback (${reason})`);

  // 1. Remove git tag (must happen before resetting the commit)
  if (state.tagged) {
    try {
      run(`git tag -d ${state.tagName}`);
      step(`Deleted tag: ${c.yellow(state.tagName)}`);
    } catch (e) {
      step(c.yellow(`Warning: could not delete tag ${state.tagName} — ${e}`));
    }
    state.tagged = false;
  }

  // 2. Undo the release commit
  if (state.committed) {
    try {
      run('git reset --hard HEAD~1');
      step(c.yellow('Reverted commit (git reset --hard HEAD~1).'));
      state.committed = false;
      state.filesModified = false;
    } catch (e) {
      step(c.yellow(`Warning: could not revert commit — ${e}`));
    }
    return;
  }

  // 3. If we modified files but never committed, restore them individually
  if (state.filesModified) {
    try {
      const filesToRestore = [
        ...PACKAGES.map((p) => path.relative(ROOT, path.join(p.dir, 'package.json'))),
        'CHANGELOG.md',
        'package-lock.json',
      ].join(' ');
      run(`git checkout HEAD -- ${filesToRestore}`);
      step(c.yellow('Reverted file changes via git checkout.'));
      state.filesModified = false;
    } catch (e) {
      step(c.yellow(`Warning: could not revert file changes — ${e}`));
    }
    return;
  }

  step('Nothing to revert.');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const argv = await yargs(hideBin(process.argv))
    .scriptName('release')
    .usage('Usage: $0 [options]')
    .option('dry-run', {
      alias: 'd',
      type: 'boolean',
      default: false,
      description:
        'Simulate the full release without publishing to npm. All changes are reverted at the end.',
    })
    .option('bump', {
      choices: ['patch', 'minor', 'major'] as const,
      description: 'Version bump type (skips the prompt).',
    })
    .option('tests', {
      type: 'boolean',
      description: 'Run tests before releasing (skips the prompt). Use --no-tests to skip them.',
    })
    .option('changelog', {
      type: 'boolean',
      description: 'Update CHANGELOG.md (skips the prompt). Use --no-changelog to skip it.',
    })
    .option('push', {
      type: 'boolean',
      default: false,
      description: 'Push the release commit and tag after publishing.',
    })
    .help()
    .alias('h', 'help')
    .strict()
    .parse();

  const dryRun = argv['dry-run'] as boolean;
  const preset: { [K in keyof Answers]?: Answers[K] | undefined } = {
    runTests: argv.tests,
    versionBump: argv.bump,
    createChangelog: argv.changelog,
  };

  if (dryRun) {
    console.log(
      '\n' +
        c.yellow(
          c.bold('  ⚠  DRY RUN — packages will NOT be published; all changes will be reverted.'),
        ) +
        '\n',
    );
  }

  const state: ReleaseState = {
    filesModified: false,
    committed: false,
    tagged: false,
    tagName: '',
  };

  try {
    // ── Phase 1: Prompt ──────────────────────────────────────────────────────
    const answers = await phasePrompt(preset);

    // ── Phase 2: Prepare ─────────────────────────────────────────────────────
    await phasePrepare(answers);

    // ── Phase 3: Version ─────────────────────────────────────────────────────
    // Mark files as modified before we start writing so rollback triggers on
    // any failure inside phaseVersion.
    state.filesModified = true;
    const newVersion = await phaseVersion(answers);

    // ── Phase 4: Changelog ───────────────────────────────────────────────────
    await phaseChangelog(answers, newVersion);

    // ── Phase 5: Commit ──────────────────────────────────────────────────────
    await phaseCommit(newVersion, state);

    // ── Phase 6: Release ─────────────────────────────────────────────────────
    await phaseRelease(dryRun);

    // ── Phase 7: Rollback (dry-run cleanup) ──────────────────────────────────
    if (dryRun) {
      await phaseRollback(state, 'dry-run');
      logPhase('DRY RUN COMPLETE');
      console.log(
        c.green('  Simulation finished successfully. Run without --dry-run to publish.') + '\n',
      );
    } else {
      logPhase('RELEASE COMPLETE');
      console.log(c.green(c.bold(`  v${newVersion} has been published to npm!`)));
      if (!argv.push) {
        console.log(c.dim('  Remember to push: git push && git push --tags') + '\n');
        return;
      }
      // The packages are already on npm, so a failed push must not roll back the release commit.
      try {
        await phasePush(state);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('\n' + c.red(c.bold(`  ✗ Push failed: ${message}`)));
        console.error(c.dim(`  Push the release commit and ${state.tagName} manually.`) + '\n');
        process.exit(1);
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('\n' + c.red(c.bold(`  ✗ Release failed: ${message}`)) + '\n');

    if (state.filesModified || state.committed || state.tagged) {
      await phaseRollback(state, 'error');
    }

    process.exit(1);
  }
}

main();

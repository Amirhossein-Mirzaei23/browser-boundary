import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

/**
 * Durable version of the `npm run pack-check` gate (roadmap Task 7 Step 6 /
 * Task 8 Step 1): the published tarball must contain ONLY the whitelisted
 * runtime files. Demo assets, docs, tests, scripts, agent definitions, and
 * local plan/cache directories must never ship.
 */

const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

/** Top-level tarball entries package.json allows via `files` (+ npm's always-included files). */
const ALLOWED_TOP_LEVEL = new Set(
  [...pkg.files, 'package.json', 'README.md', 'LICENSE', 'CHANGELOG.md'].map((entry) =>
    entry.replace(/\/$/, ''),
  ),
);

/** Directories whose contents must never leak into the tarball. */
const FORBIDDEN_PREFIXES = [
  'docs/',
  'examples/',
  'tests/',
  'scripts/',
  '.agents/',
  '.github/',
  '.hermes/',
  'reports/',
  'node_modules/',
];

function packContents(): string[] {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(npm, ['pack', '--dry-run', '--json'], {
    cwd: new URL('../../', import.meta.url),
    encoding: 'utf8',
    timeout: 120_000,
  });
  assert.equal(result.status, 0, `npm pack --dry-run failed: ${result.stdout}\n${result.stderr}`);
  const parsed = JSON.parse(result.stdout) as Array<{ files: Array<{ path: string }> }>;
  return parsed[0].files.map((f) => f.path);
}

test('package.json files whitelist contains only runtime deliverables', () => {
  for (const entry of pkg.files) {
    assert.ok(
      ALLOWED_TOP_LEVEL.has(entry),
      `files entry "${entry}" must be a known runtime deliverable`,
    );
    assert.ok(!FORBIDDEN_PREFIXES.some((p) => entry.startsWith(p)), `"${entry}" must not ship`);
  }
  // The CLI entrypoint must be shipped and declared executable.
  assert.ok(pkg.files.includes('bin'), 'bin/ must ship (CLI entrypoint)');
  assert.equal(pkg.bin['browser-boundary'], 'bin/browser-boundary.js');
});

test('npm pack tarball ships only whitelisted files', () => {
  const files = packContents();
  assert.ok(files.length > 0, 'tarball is not empty');

  for (const file of files) {
    const topLevel = file.split('/')[0];
    assert.ok(
      ALLOWED_TOP_LEVEL.has(topLevel),
      `tarball file "${file}" is outside the whitelist (${[...ALLOWED_TOP_LEVEL].join(', ')})`,
    );
    for (const prefix of FORBIDDEN_PREFIXES) {
      assert.ok(!file.startsWith(prefix), `tarball must not contain "${prefix}" (found "${file}")`);
    }
  }

  // The compiled CLI must actually be present once built; without dist the
  // published package would be unusable.
  if (files.some((f) => f.startsWith('dist/'))) {
    assert.ok(files.some((f) => f === 'bin/browser-boundary.js'), 'CLI bin ships alongside dist');
  }
});

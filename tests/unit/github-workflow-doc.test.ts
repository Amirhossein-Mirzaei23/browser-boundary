import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const WORKFLOW = readFileSync(new URL('../../docs/ci/github-actions.yml', import.meta.url), 'utf8');
const DOC = readFileSync(new URL('../../docs/CI_BASELINE_WORKFLOW.md', import.meta.url), 'utf8');
const README = readFileSync(new URL('../../README.md', import.meta.url), 'utf8');

test('workflow includes checkout and pinned Node setup', () => {
  assert.match(WORKFLOW, /actions\/checkout@/);
  assert.match(WORKFLOW, /actions\/setup-node@/);
  assert.match(WORKFLOW, /node-version:\s*'?2\d/);
});

test('workflow installs the package with npm ci or documented installation', () => {
  assert.match(WORKFLOW, /npm (ci|install)/);
});

test('workflow caches Playwright and historical browsers with OS/arch/package/Playwright-aware keys', () => {
  assert.match(WORKFLOW, /actions\/cache@/);
  assert.match(WORKFLOW, /\$\{\{ runner\.os \}\}/);
  assert.match(WORKFLOW, /\$\{\{ runner\.arch \}\}/);
  assert.match(WORKFLOW, /hashFiles\([^\)]*package-lock\.json/);
  // Playwright version participates in the cache key.
  assert.match(WORKFLOW, /playwright.*--version|version.*playwright/s);
});

test('workflow generates a scan report, then compares with an explicit --gate', () => {
  assert.match(WORKFLOW, /browser-boundary[^\n]*--versions|browser-boundary[^\n]*scan|npx browser-boundary[^\n]*http/);
  assert.match(WORKFLOW, /compare/);
  assert.match(WORKFLOW, /--gate/);
  assert.match(WORKFLOW, /--baseline/);
  assert.match(WORKFLOW, /--current/);
});

test('artifact upload is guarded with if: always()', () => {
  assert.match(WORKFLOW, /actions\/upload-artifact@/);
  assert.match(WORKFLOW, /if:\s*always\(\)/);
});

test('workflow produces GitHub summary output', () => {
  assert.match(WORKFLOW, /GITHUB_STEP_SUMMARY/);
});

test('workflow never overwrites the baseline automatically', () => {
  assert.ok(!/baseline create/.test(WORKFLOW), 'baseline create must not run in CI');
  assert.ok(!/--force/.test(WORKFLOW));
});

test('documentation covers the acceptance flow and re-baselining as a reviewed change', () => {
  assert.match(DOC, /baseline create/);
  assert.match(DOC, /commit/i);
  assert.match(DOC, /re-baselin/i);
  assert.match(DOC, /review/i);
  assert.match(DOC, /staging|auth/i);
});

test('README CI section links the official workflow and documents the conservative gate', () => {
  const ciSection = README.split('## CI example')[1] ?? '';
  assert.ok(ciSection.length > 0, 'README keeps a CI section');
  assert.match(ciSection, /github-actions\.yml|CI_BASELINE_WORKFLOW/);
  assert.match(ciSection, /--gate/);
});

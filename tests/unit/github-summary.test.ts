import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { renderGithubSummary, appendGithubStepSummary } from '../../src/reporting/github-summary.js';
import type { ScanComparison } from '../../src/baseline/compare.js';

function comparison(): ScanComparison {
  return {
    overall: 'regressed',
    scopeMatch: false,
    baselineFingerprint: 'a'.repeat(64),
    currentFingerprint: 'b'.repeat(64),
    engines: [
      {
        engine: 'chromium',
        versionType: 'real-major',
        state: 'regressed',
        baselineBoundary: '71',
        currentBoundary: '73',
        reasonCode: 'verified-regression',
        message: 'floor moved 71 -> 73 with verified failure at 72',
        comparable: true,
        warnings: [{ code: 'scope-drift', message: 'configuration differs' }],
        evidence: [],
      },
      {
        engine: 'firefox',
        versionType: 'real-major',
        state: 'inconclusive',
        baselineBoundary: '63',
        currentBoundary: null,
        reasonCode: 'infrastructure-only',
        message: 'no verified evidence',
        comparable: false,
        warnings: [],
        evidence: [],
      },
    ],
  };
}

test('summary table contains engine, baseline, current, state, and concise diagnostic', () => {
  const md = renderGithubSummary(comparison());
  assert.match(md, /\| Engine \| Baseline \| Current \| State \|/);
  assert.match(md, /chromium/);
  assert.match(md, /71/);
  assert.match(md, /73/);
  assert.match(md, /regressed/);
  assert.match(md, /verified-regression/);
});

test('warnings and inconclusive states remain visible', () => {
  const md = renderGithubSummary(comparison());
  assert.match(md, /inconclusive/);
  assert.match(md, /scope-drift/);
});

test('markdown-significant characters are escaped safely', () => {
  const c = comparison();
  c.engines[0].message = 'failure | `<script>` \n newline';
  const md = renderGithubSummary(c);
  assert.ok(!md.includes('<script>'));
  // pipes inside cells are escaped
  assert.ok(md.includes('failure \\|'));
});

test('appendGithubStepSummary is a no-op when the env path is absent', async () => {
  const wrote = await appendGithubStepSummary(comparison(), { env: {} as NodeJS.ProcessEnv });
  assert.equal(wrote, false);
});

test('appendGithubStepSummary appends to the file named by GITHUB_STEP_SUMMARY', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bb-gh-'));
  const file = path.join(dir, 'step-summary.md');
  const env = { GITHUB_STEP_SUMMARY: file } as NodeJS.ProcessEnv;
  assert.equal(await appendGithubStepSummary(comparison(), { env }), true);
  assert.equal(await appendGithubStepSummary(comparison(), { env }), true); // appends, not replaces
  const content = readFileSync(file, 'utf8');
  assert.equal(content.match(/# Browser Boundary Comparison/g)?.length, 2);
  rmSync(dir, { recursive: true, force: true });
});

test('appendGithubStepSummary does not create a file when absent from env', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bb-gh-'));
  const wouldBe = path.join(dir, 'step-summary.md');
  await appendGithubStepSummary(comparison(), { env: {} as NodeJS.ProcessEnv });
  assert.ok(!existsSync(wouldBe));
  rmSync(dir, { recursive: true, force: true });
});

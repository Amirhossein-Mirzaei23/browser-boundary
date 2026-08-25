import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runCompare } from '../../src/cli/compare.js';
import { EXIT } from '../../src/cli/exit-codes.js';
import { baselineJson, scanJson, writeArtifacts } from './comparison-fixtures.js';

function setup(): string {
  return mkdtempSync(path.join(tmpdir(), 'bb-gate-'));
}

test('gate fails (exit 1) only when an engine is verified-regressed', async () => {
  const dir = setup();
  const a = writeArtifacts(dir, baselineJson('71', '70'), scanJson('73', '72'));
  assert.equal(await runCompare({ baseline: a.baselinePath, current: a.currentPath, gate: true }), EXIT.COMPAT_FAIL);
  rmSync(dir, { recursive: true, force: true });
});

test('inconclusive does not fail the gate', async () => {
  const dir = setup();
  // Newer floor without verified failure -> inconclusive, never a regression.
  const a = writeArtifacts(dir, baselineJson('71', '70'), scanJson('73', null));
  assert.equal(await runCompare({ baseline: a.baselinePath, current: a.currentPath, gate: true }), EXIT.OK);
  // Infrastructure-only current scan -> inconclusive.
  const b = writeArtifacts(dir, baselineJson('71', '70'), scanJson(null, null));
  assert.equal(await runCompare({ baseline: b.baselinePath, current: b.currentPath, gate: true }), EXIT.OK);
  rmSync(dir, { recursive: true, force: true });
});

test('unbaselined and not-compared engines do not fail the gate by default', async () => {
  const dir = setup();
  // Baseline has no chromium entry at all (firefox instead).
  const firefoxOnly = baselineJson();
  firefoxOnly.engines[0] = { ...firefoxOnly.engines[0], engine: 'firefox' as const };
  const a = writeArtifacts(dir, firefoxOnly, scanJson('63', null));
  assert.equal(await runCompare({ baseline: a.baselinePath, current: a.currentPath, gate: true }), EXIT.OK);
  // Engine absent from the current scan (not-compared).
  const noEngineScan = scanJson(null, null);
  noEngineScan.summaries = [];
  const b = writeArtifacts(dir, baselineJson('71', '70'), noEngineScan);
  assert.equal(await runCompare({ baseline: b.baselinePath, current: b.currentPath, gate: true }), EXIT.OK);
  rmSync(dir, { recursive: true, force: true });
});

test('exit codes are centralized and documented', async () => {
  assert.equal(EXIT.OK, 0);
  assert.equal(EXIT.COMPAT_FAIL, 1);
  assert.equal(EXIT.CONFIG_ERROR, 2);
  assert.equal(EXIT.INFRA_ERROR, 3);
  const source = await import('node:fs').then((fs) => fs.readFileSync(new URL('../../src/cli/exit-codes.ts', import.meta.url), 'utf8'));
  assert.match(source, /regression gate/i);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseCli } from '../../src/cli/options.js';
import { runCompare } from '../../src/cli/compare.js';
import { baselineJson, scanJson, writeArtifacts } from './comparison-fixtures.js';

test('compare parses --baseline and --current with optional --gate', () => {
  const p = parseCli(['compare', '--baseline', 'b.json', '--current', 'c.json']);
  assert.equal(p.command, 'compare');
  if (p.command === 'compare') {
    assert.equal(p.baseline, 'b.json');
    assert.equal(p.current, 'c.json');
    assert.equal(p.gate, false);
  }
  const gated = parseCli(['compare', '--baseline', 'b.json', '--current', 'c.json', '--gate']);
  if (gated.command === 'compare') assert.equal(gated.gate, true);
});

test('compare requires --baseline and --current', () => {
  assert.throws(() => parseCli(['compare', '--baseline', 'b.json']), /--current/);
  assert.throws(() => parseCli(['compare', '--current', 'c.json']), /--baseline/);
});

test('compare without --gate reports a verified regression but exits 0', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bb-cmp-'));
  const { baselinePath, currentPath } = writeArtifacts(dir, baselineJson('71', '70'), scanJson('73', '72'));
  const code = await runCompare({ baseline: baselinePath, current: currentPath, gate: false });
  assert.equal(code, 0);
  rmSync(dir, { recursive: true, force: true });
});

test('unchanged and improved comparisons exit 0 in gate mode', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bb-cmp-'));
  const unchanged = writeArtifacts(dir, baselineJson('71', '70'), scanJson('71', '70'));
  assert.equal(await runCompare({ baseline: unchanged.baselinePath, current: unchanged.currentPath, gate: true }), 0);
  const improved = writeArtifacts(dir, baselineJson('71', '70'), scanJson('69', '68'));
  assert.equal(await runCompare({ baseline: improved.baselinePath, current: improved.currentPath, gate: true }), 0);
  rmSync(dir, { recursive: true, force: true });
});

test('malformed input is a configuration error (exit 2)', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bb-cmp-'));
  const { baselinePath, currentPath } = writeArtifacts(dir, baselineJson(), scanJson('71', '70'));
  // Corrupt the baseline.
  const raw = JSON.parse(readFileSync(baselinePath, 'utf8'));
  delete raw.schemaVersion;
  const malformed = path.join(dir, 'bad.baseline.json');
  const { writeFileSync } = await import('node:fs');
  writeFileSync(malformed, JSON.stringify(raw));
  assert.equal(await runCompare({ baseline: malformed, current: currentPath, gate: false }), 2);
  assert.equal(await runCompare({ baseline: path.join(dir, 'missing.json'), current: currentPath, gate: false }), 2);
  rmSync(dir, { recursive: true, force: true });
});

test('compare never writes the baseline file', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bb-cmp-'));
  const { baselinePath, currentPath } = writeArtifacts(dir, baselineJson('71', '70'), scanJson('73', '72'));
  const before = readFileSync(baselinePath, 'utf8');
  await runCompare({ baseline: baselinePath, current: currentPath, gate: true });
  assert.equal(readFileSync(baselinePath, 'utf8'), before);
  rmSync(dir, { recursive: true, force: true });
});

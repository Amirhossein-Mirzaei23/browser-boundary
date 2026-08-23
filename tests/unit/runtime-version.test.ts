import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeRuntimeVersion,
  resolveRuntimeVersion,
} from '../../src/runtimes/version.js';

test('normalizeRuntimeVersion preserves valid numeric version precision', () => {
  assert.deepEqual(normalizeRuntimeVersion('140', 'explicit'), {
    raw: '140', major: 140, precision: 'major', source: 'explicit',
  });
  assert.equal(normalizeRuntimeVersion('140.1', 'explicit').precision, 'partial');
  assert.equal(normalizeRuntimeVersion('140.1.2', 'explicit').precision, 'partial');
  assert.equal(normalizeRuntimeVersion('140.1.2.3', 'explicit').precision, 'full');
});

for (const value of ['', '-1', '1e2', 'latest', '140.beta', '1.2.3.4.5']) {
  test(`normalizeRuntimeVersion rejects ${JSON.stringify(value)}`, () => {
    assert.deepEqual(normalizeRuntimeVersion(value, 'explicit'), {
      raw: value || null,
      major: null,
      precision: 'unknown',
      source: 'explicit',
    });
  });
}

test('resolveRuntimeVersion prefers native package evidence and reports mismatches', () => {
  const resolved = resolveRuntimeVersion({
    nativePackageVersion: '140.0.7339.51',
    clientHintsVersion: '140.0.7339.50',
    explicitVersion: '139',
    userAgentVersion: '138.0.0.0',
  });
  assert.equal(resolved.version.source, 'native-package');
  assert.equal(resolved.version.raw, '140.0.7339.51');
  assert.equal(resolved.conflicts.length, 3);
  assert.match(resolved.conflicts[0], /native-package.*client-hints/i);
});

test('resolveRuntimeVersion falls back through client hints, explicit, UA, then unknown', () => {
  assert.equal(resolveRuntimeVersion({ clientHintsVersion: '141' }).version.source, 'client-hints');
  assert.equal(resolveRuntimeVersion({ explicitVersion: '140' }).version.source, 'explicit');
  assert.equal(resolveRuntimeVersion({ userAgentVersion: '139' }).version.source, 'user-agent');
  assert.equal(resolveRuntimeVersion({}).version.source, 'unknown');
});

test('invalid higher-priority evidence does not hide a valid lower-priority version', () => {
  const resolved = resolveRuntimeVersion({ nativePackageVersion: 'broken', userAgentVersion: '140.0.0.0' });
  assert.equal(resolved.version.source, 'user-agent');
  assert.equal(resolved.version.major, 140);
  assert.ok(resolved.warnings.some((warning) => /native-package/i.test(warning)));
});

test('conflicting major versions are exposed as structured unsafe evidence', () => {
  const result = resolveRuntimeVersion({
    nativePackageVersion: '141.0.7390.12',
    userAgentVersion: '140.0.0.0',
  });
  assert.equal(result.hasConflicts, true);
  assert.deepEqual(result.conflictingVersions.map((version) => version.major), [140]);
});

test('different precision for the same major is not a compatibility conflict', () => {
  const result = resolveRuntimeVersion({
    nativePackageVersion: '140.0.7339.51',
    userAgentVersion: '140.0.0.0',
  });
  assert.equal(result.hasConflicts, false);
  assert.equal(result.conflicts.length, 1);
});

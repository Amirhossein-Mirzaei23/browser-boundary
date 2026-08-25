import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateDemoBoundary, type DemoCheckEvidence, type DemoReportEvidence } from '../../scripts/verify-readme-demo.js';

function check(version: string, verdict: string, overrides: Record<string, unknown> = {}): DemoCheckEvidence {
  return {
    engine: 'chromium',
    version,
    versionType: 'real-major',
    verdict,
    controller: 'playwright',
    identity: {
      requestedVersion: version,
      requestedEngine: 'chromium',
      executableVersion: `${version}.0.6099.109`,
      executableEngine: 'chromium',
      runtimeVersion: `${version}.0.6099.109`,
      runtimeEngine: 'chromium',
      executableMethod: 'executable:--version',
      runtimeMethod: 'playwright:browser.version()',
      verified: true,
      mismatchReason: null,
    },
    ...overrides,
  };
}

function report(results: DemoCheckEvidence[], overrides: Record<string, unknown> = {}): DemoReportEvidence {
  const oldest = results.filter((r) => r.verdict === 'pass').map((r) => r.version).sort((a, b) => Number(a) - Number(b))[0] ?? null;
  const newestFail = results.filter((r) => r.verdict === 'fail').map((r) => r.version).sort((a, b) => Number(b) - Number(a))[0] ?? null;
  return {
    results,
    summaries: [{ engine: 'chromium', versionType: 'real-major', oldestVerifiedPassing: oldest, firstVerifiedFailing: newestFail }],
    ...overrides,
  };
}

const EXPECTED = { failMajor: 120, passMajor: 121 };

test('adjacent verified fail/pass pair is accepted as an exact boundary', () => {
  const v = validateDemoBoundary(report([check('120', 'fail'), check('121', 'pass')]), EXPECTED);
  assert.equal(v.accepted, true);
  assert.equal(v.semantics, 'exact');
  assert.equal(v.oldestVerifiedPassing, 121);
  assert.equal(v.firstVerifiedFailing, 120);
  assert.deepEqual(v.gapMajors, []);
});

test('non-adjacent pair is accepted as a bracket with a disclosed gap', () => {
  const v = validateDemoBoundary(report([check('113', 'fail'), check('121', 'pass')]), { failMajor: 113, passMajor: 121 });
  assert.equal(v.accepted, true);
  assert.equal(v.semantics, 'bracket');
  assert.deepEqual(v.gapMajors, [114, 115, 116, 117, 118, 119, 120]);
});

test('identity mismatch rejects the boundary', () => {
  const bad = check('120', 'fail', { identity: { ...check('120', 'fail').identity, verified: false, mismatchReason: 'runtime-version-mismatch' } });
  const v = validateDemoBoundary(report([bad, check('121', 'pass')]), EXPECTED);
  assert.equal(v.accepted, false);
  assert.match(v.reason, /identity/);
});

test('older error or inconclusive result is rejected', () => {
  for (const verdict of ['error', 'inconclusive', 'skipped'] as const) {
    const v = validateDemoBoundary(report([check('120', verdict), check('121', 'pass')]), EXPECTED);
    assert.equal(v.accepted, false, verdict);
    assert.match(v.reason, /120/);
  }
});

test('summary disagreeing with check results is rejected', () => {
  const r = report([check('120', 'fail'), check('121', 'pass')]);
  r.summaries[0].oldestVerifiedPassing = '999';
  const v = validateDemoBoundary(r, EXPECTED);
  assert.equal(v.accepted, false);
  assert.match(v.reason, /summary/i);
});

test('unexpected boundary movement is rejected', () => {
  // The expected passing major now fails: the boundary moved.
  const v = validateDemoBoundary(report([check('120', 'fail'), check('121', 'fail')]), EXPECTED);
  assert.equal(v.accepted, false);
  assert.match(v.reason, /moved|121/);
});

test('missing expected checks are rejected', () => {
  const v = validateDemoBoundary(report([check('121', 'pass')]), EXPECTED);
  assert.equal(v.accepted, false);
  assert.match(v.reason, /120/);
});

test('playwright-revision (WebKit) evidence is never accepted for the chromium demo boundary', () => {
  const webkitCheck = { ...check('120', 'fail'), engine: 'webkit', versionType: 'playwright-revision' };
  const v = validateDemoBoundary(report([webkitCheck, check('121', 'pass')]), EXPECTED);
  assert.equal(v.accepted, false);
});

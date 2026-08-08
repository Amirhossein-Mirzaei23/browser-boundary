import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchBoundary, versionRange } from '../../src/core/version-search.js';
import type { Verdict } from '../../src/reporting/types.js';

/**
 * version-search is the honesty-critical module: it must report VERIFIED
 * boundaries and skip untested versions, never claim a whole supported/
 * unsupported range.
 */
test('versionRange builds descending integer list floor..latest inclusive', () => {
  assert.deepEqual(versionRange(5, 2), ['5', '4', '3', '2']);
  assert.deepEqual(versionRange(2, 2), ['2']);
});

test('binary search pins exact boundary and marks the rest skipped', async () => {
  // Truth: pass >= 111, fail <= 110.
  const truth = async (v: string): Promise<Verdict> => (Number(v) >= 111 ? 'pass' : 'fail');
  const out = await searchBoundary({
    versions: versionRange(120, 100),
    test: truth,
    strategy: 'binary',
    stepSize: 10,
  });
  assert.equal(out.oldestVerifiedPassing, '111');
  assert.equal(out.firstVerifiedFailing, '110');
  assert.equal(out.boundaryConfidence, 'high');
  assert.ok(out.skipped.length > 0);
  assert.ok(out.tested.includes('111'));
  assert.ok(out.tested.includes('110'));
  assert.ok(!out.skipped.includes('111'));
  assert.ok(!out.skipped.includes('110'));
});

test('all-pass range: oldestPass = floor, no firstFail, low confidence', async () => {
  const out = await searchBoundary({
    versions: versionRange(120, 110),
    test: async () => 'pass' as Verdict,
    strategy: 'binary',
    stepSize: 5,
  });
  assert.equal(out.firstVerifiedFailing, null);
  assert.equal(out.boundaryConfidence, 'low');
  assert.equal(out.oldestVerifiedPassing, '110');
});

test('latest strategy tests only the newest version', async () => {
  const tested: string[] = [];
  await searchBoundary({
    versions: versionRange(120, 100),
    test: async (v) => { tested.push(v); return 'pass' as Verdict; },
    strategy: 'latest',
  });
  assert.deepEqual(tested, ['120']);
});

test('explicit strategy tests every listed version', async () => {
  const tested: string[] = [];
  await searchBoundary({
    versions: ['120', '115', '100'],
    test: async (v) => { tested.push(v); return 'pass' as Verdict; },
    strategy: 'explicit',
  });
  assert.deepEqual(tested, ['120', '115', '100']);
});

test('inconclusive versions are recorded, never crash the search', async () => {
  const out = await searchBoundary({
    versions: versionRange(120, 110),
    test: async (v): Promise<Verdict> => (v === '115' ? 'inconclusive' : 'pass'),
    strategy: 'binary',
    stepSize: 5,
  });
  assert.ok(out.inconclusive.includes('115'));
  assert.equal(out.oldestVerifiedPassing, '110');
});

test('REGRESSION: all-errored range must NOT report the floor as oldest pass', async () => {
  // This reproduces the real-world bug where every Firefox historical binary
  // failed to launch (error), and the summary wrongly claimed "PASS >= 60".
  const out = await searchBoundary({
    versions: versionRange(120, 60),
    test: async (): Promise<Verdict> => 'error',
    strategy: 'step-down',
    stepSize: 10,
  });
  assert.equal(out.oldestVerifiedPassing, null, 'no pass was observed → must be null');
  assert.equal(out.firstVerifiedFailing, null, 'no fail was observed → must be null');
  assert.equal(out.boundaryConfidence, 'unknown');
  assert.ok(out.tested.length > 0, 'versions were still tested');
});

test('REGRESSION: all-inconclusive range must NOT report the floor as oldest pass', async () => {
  const out = await searchBoundary({
    versions: versionRange(120, 60),
    test: async (): Promise<Verdict> => 'inconclusive',
    strategy: 'step-down',
    stepSize: 10,
  });
  assert.equal(out.oldestVerifiedPassing, null);
  assert.equal(out.firstVerifiedFailing, null);
});

test('all-pass range still correctly reports floor as oldest pass', async () => {
  // Sanity: when versions genuinely pass, floor IS the oldest pass.
  const out = await searchBoundary({
    versions: versionRange(120, 110),
    test: async (): Promise<Verdict> => 'pass',
    strategy: 'step-down',
    stepSize: 5,
  });
  assert.equal(out.oldestVerifiedPassing, '110');
  assert.equal(out.firstVerifiedFailing, null);
});

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

test('explicit strategy preserves the user-supplied version order', async () => {
  const tested: string[] = [];
  await searchBoundary({
    versions: ['100', '120', '110'],
    test: async (version) => { tested.push(version); return 'pass' as Verdict; },
    strategy: 'explicit',
  });
  assert.deepEqual(tested, ['100', '120', '110']);
});

test('explicit strategy never starts the next version before the current one finishes', async () => {
  const events: string[] = [];
  let releaseCurrent = () => {};
  const currentClosed = new Promise<void>((resolve) => { releaseCurrent = resolve; });

  const scan = searchBoundary({
    versions: ['120', '115'],
    strategy: 'explicit',
    test: async (version) => {
      events.push(`open:${version}`);
      if (version === '120') await currentClosed;
      events.push(`close:${version}`);
      return 'pass' as Verdict;
    },
  });

  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(events, ['open:120'], 'v115 must not open while v120 is still open');

  releaseCurrent();
  await scan;
  assert.deepEqual(events, ['open:120', 'close:120', 'open:115', 'close:115']);
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

test('REGRESSION: step-down bails after a streak of unavailable versions (no wall of probes)', async () => {
  // Real-world scenario from the CFT scan: newest versions pass, then older
  // versions are all unavailable (403 → inconclusive). The step phase must NOT
  // probe every remaining step point — it bails after a short unavailable streak.
  const tested: string[] = [];
  const truth = async (v: string): Promise<Verdict> => {
    tested.push(v);
    return Number(v) >= 121 ? 'pass' : 'inconclusive';
  };
  await searchBoundary({
    versions: versionRange(151, 60), // 92 versions
    test: truth,
    strategy: 'binary',
    stepSize: 10,
  });
  // Step probes: 151(pass), 141(pass), 131(pass), 121(pass), 111(inc),
  // 101(inc) → streak hits the threshold and we STOP. We must NOT reach 91/81/71/61.
  for (const old of ['91', '81', '71', '61']) {
    assert.ok(!tested.includes(old), `should not probe v${old} after unavailable streak (probed: ${tested.join(',')})`);
  }
});

test('REGRESSION: unavailable older range reports oldest VERIFIED pass, not the untested floor', async () => {
  // Same scenario: 151/141/131/121 pass, then everything older is unavailable.
  // The summary MUST cite v121 (oldest verified pass), NOT v60 (the floor,
  // which was never tested). Confidence is low.
  const truth = async (v: string): Promise<Verdict> =>
    Number(v) >= 121 ? 'pass' : 'inconclusive';
  const out = await searchBoundary({
    versions: versionRange(151, 60),
    test: truth,
    strategy: 'binary',
    stepSize: 10,
  });
  assert.equal(out.oldestVerifiedPassing, '121', 'must report the oldest VERIFIED pass');
  assert.notEqual(out.oldestVerifiedPassing, '60', 'must NOT claim the untested floor passed');
  assert.equal(out.firstVerifiedFailing, null);
  assert.equal(out.boundaryConfidence, 'low');
  assert.ok(out.inconclusive.length > 0, 'the unavailable versions are recorded as inconclusive');
});

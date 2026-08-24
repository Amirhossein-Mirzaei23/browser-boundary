import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareScanToBaseline } from '../../src/baseline/compare.js';
import type { BoundaryBaseline, BaselineEngineEntry } from '../../src/baseline/types.js';
import type { CheckResult, EngineSummary, ScanResult } from '../../src/reporting/types.js';

function baselineEntry(engine: BaselineEngineEntry['engine'], oldest: string | null, firstFail: string | null, versionType?: string): BaselineEngineEntry {
  return {
    engine,
    versionType: (versionType ?? (engine === 'webkit' ? 'playwright-revision' : 'real-major')) as BaselineEngineEntry['versionType'],
    oldestVerifiedPassing: oldest,
    firstVerifiedFailing: firstFail,
    failureReason: firstFail ? 'TypeError: Array.fromAsync is not a function' : null,
    testedVersions: oldest ? [oldest] : [],
    inconclusiveVersions: [],
    browserSource: `build ${oldest ?? firstFail}`,
    controller: 'playwright',
    os: 'linux',
    arch: 'x64',
    identity: { requestedVersion: oldest ?? '0', runtimeVersion: oldest, executableVersion: oldest, verified: true, mismatchReason: null },
  };
}

function baseline(entries: BaselineEngineEntry[], fingerprint = 'b'.repeat(64)): BoundaryBaseline {
  return {
    schemaVersion: 1,
    createdAt: '2026-08-24T00:00:00.000Z',
    packageVersion: '1.5.2',
    configFingerprint: fingerprint,
    scope: {
      routes: [{ url: 'http://127.0.0.1:4317/', label: 'home', readiness: { kind: 'none' } }],
      checks: { navigation: true, javascript: true, console: true, network: true, rendering: true, readiness: true },
      engines: ['chromium'],
      controllerPolicy: 'auto',
      minConfidence: 'low',
      floors: { chromium: 67 },
      ignoredPatterns: [],
      criticalResourceTypes: [],
      timeoutMs: 30000,
      waitUntil: 'domcontentloaded',
      viewport: { width: 1366, height: 768 },
      nonPortable: [],
    },
    engines: entries,
  };
}

function summary(engine: EngineSummary['engine'], oldest: string | null, firstFail: string | null): EngineSummary {
  return {
    engine,
    versionType: engine === 'webkit' ? 'playwright-revision' : 'real-major',
    tested: oldest ? [oldest] : [],
    latestTested: oldest,
    oldestVerifiedPassing: oldest,
    firstVerifiedFailing: firstFail,
    boundaryConfidence: 'high',
    inconclusive: [],
    skipped: [],
    resultLine: 'line',
    failureReason: firstFail ? 'TypeError: Array.fromAsync is not a function' : null,
    limitationNote: null,
  };
}

function scan(summaries: EngineSummary[], fingerprint = 'b'.repeat(64), routes = ['http://127.0.0.1:4317/']): ScanResult {
  return {
    website: 'http://127.0.0.1:4317',
    pages: routes,
    startedAt: '2026-08-24T00:00:00.000Z',
    finishedAt: '2026-08-24T00:01:00.000Z',
    config: { timeoutMs: 30000, headed: false, latestOnly: false, quick: false, strategy: 'binary', stepSize: 10, versionFloor: { chromium: 67 } },
    provenance: {
      packageVersion: '1.5.2', os: 'linux', arch: 'x64', controllerPolicy: 'auto',
      routes: routes.map((r, i) => ({ url: r, label: `p${i}`, readiness: 'none' as const })),
      checks: { navigation: true, javascript: true, console: true, network: true, rendering: true, readiness: true },
    },
    scope: {
      routes: routes.map((r, i) => ({ url: r, label: `p${i}`, readiness: { kind: 'none' as const } })),
      checks: { navigation: true, javascript: true, console: true, network: true, rendering: true, readiness: true },
      engines: ['chromium'],
      controllerPolicy: 'auto',
      minConfidence: 'low',
      floors: { chromium: 67 },
      ignoredPatterns: [],
      criticalResourceTypes: [],
      timeoutMs: 30000,
      waitUntil: 'domcontentloaded',
      viewport: { width: 1366, height: 768 },
      nonPortable: [],
    },
    configFingerprint: fingerprint,
    results: [],
    summaries,
    featureFindings: [],
  } as unknown as ScanResult;
}

const B71 = baseline([baselineEntry('chromium', '71', '70')]);

test('baseline 71, current 71 with equivalent verified evidence -> unchanged', () => {
  const c = compareScanToBaseline(B71, scan([summary('chromium', '71', '70')]));
  const e = c.engines[0];
  assert.equal(e.state, 'unchanged');
  assert.equal(e.comparable, true);
  assert.equal(e.reasonCode, 'boundary-unchanged');
});

test('baseline 71, current 69 -> improved', () => {
  const c = compareScanToBaseline(B71, scan([summary('chromium', '69', '68')]));
  assert.equal(c.engines[0].state, 'improved');
});

test('baseline 71, current 73 with verified failure at/above 71 -> regressed', () => {
  const c = compareScanToBaseline(B71, scan([summary('chromium', '73', '72')]));
  const e = c.engines[0];
  assert.equal(e.state, 'regressed');
  assert.equal(e.reasonCode, 'verified-regression');
  assert.ok(e.evidence.some((x) => x.verdict === 'fail' && x.version === '72'));
});

test('baseline 71, current 73 without relevant verified failure -> inconclusive', () => {
  const c = compareScanToBaseline(B71, scan([summary('chromium', '73', null)]));
  const e = c.engines[0];
  assert.equal(e.state, 'inconclusive');
  assert.equal(e.reasonCode, 'newer-floor-without-verified-failure');
});

test('baseline exists, current infrastructure-only -> inconclusive', () => {
  const c = compareScanToBaseline(B71, scan([summary('chromium', null, null)]));
  const e = c.engines[0];
  assert.equal(e.state, 'inconclusive');
  assert.equal(e.reasonCode, 'infrastructure-only');
});

test('no baseline entry, current verified -> unbaselined', () => {
  const c = compareScanToBaseline(baseline([]), scan([summary('firefox', '63', null)]));
  const e = c.engines[0];
  assert.equal(e.state, 'unbaselined');
  assert.equal(e.comparable, false);
});

test('baseline engine absent from current scan -> not-compared', () => {
  const c = compareScanToBaseline(B71, scan([summary('firefox', '63', null)]));
  const chromium = c.engines.find((e) => e.engine === 'chromium')!;
  assert.equal(chromium.state, 'not-compared');
});

test('versionType mismatch (real-major vs playwright-revision) -> not comparable, never regressed', () => {
  const b = baseline([baselineEntry('chromium', '71', '70', 'playwright-revision')]);
  const c = compareScanToBaseline(b, scan([summary('chromium', '73', '72')]));
  const e = c.engines[0];
  assert.equal(e.state, 'not-compared');
  assert.equal(e.comparable, false);
  assert.ok(e.warnings.some((w) => /version domain/i.test(w.message)));
});

test('material scope drift (different routes) forces inconclusive with a warning', () => {
  const c = compareScanToBaseline(B71, scan([summary('chromium', '71', '70')], 'c'.repeat(64), ['http://other.route/']));
  const e = c.engines[0];
  assert.equal(e.state, 'inconclusive');
  assert.ok(e.warnings.some((w) => w.code === 'scope-drift'));
});

test('fingerprint-only drift keeps the comparison but emits a warning', () => {
  const c = compareScanToBaseline(B71, scan([summary('chromium', '71', '70')], 'c'.repeat(64)));
  const e = c.engines[0];
  assert.equal(e.state, 'unchanged');
  assert.ok(e.warnings.some((w) => w.code === 'scope-drift'));
});

test('versions compare numerically, not lexicographically', () => {
  // 100 < 99 lexicographically; numerically 99 < 100.
  const b = baseline([baselineEntry('chromium', '100', '99')]);
  const improved = compareScanToBaseline(b, scan([summary('chromium', '99', '98')]));
  assert.equal(improved.engines[0].state, 'improved');
});

test('aggregate overall never hides per-engine inconclusive states', () => {
  const c = compareScanToBaseline(B71, scan([summary('chromium', '71', '70'), summary('firefox', null, null)]));
  // firefox: no baseline entry AND no verified evidence -> stays inconclusive, never "improved" or hidden.
  assert.equal(c.engines.find((e) => e.engine === 'firefox')!.state, 'inconclusive');
  // display-only overall: one unchanged + one inconclusive -> unchanged shown, but engines retain detail
  assert.ok(['unchanged', 'inconclusive'].includes(c.overall));
});

test('regressed overall when any engine verified-regressed', () => {
  const c = compareScanToBaseline(B71, scan([summary('chromium', '73', '72')]));
  assert.equal(c.overall, 'regressed');
});

test('comparison never mutates the accepted baseline', () => {
  const before = JSON.stringify(B71);
  compareScanToBaseline(B71, scan([summary('chromium', '73', '72')]));
  assert.equal(JSON.stringify(B71), before);
});

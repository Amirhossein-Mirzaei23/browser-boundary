import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createBaseline, BaselineCreationError } from '../../src/baseline/create.js';
import { readBaseline, writeBaseline } from '../../src/baseline/io.js';
import type { CheckResult, ScanResult } from '../../src/reporting/types.js';

function check(engine: string, version: string, verdict: CheckResult['verdict'], extra: Partial<CheckResult> = {}): CheckResult {
  return {
    engine: engine as CheckResult['engine'],
    version,
    versionType: engine === 'webkit' ? 'playwright-revision' : 'real-major',
    buildLabel: `build ${version}`,
    executablePath: '/volatile/path/to/chrome',
    url: 'http://127.0.0.1:4317/',
    verdict,
    reason: verdict === 'fail' ? 'TypeError: Array.fromAsync is not a function' : '',
    identity: {
      requestedVersion: version,
      requestedEngine: engine as CheckResult['engine'],
      executableVersion: engine === 'webkit' ? null : `${version}.0.0.0`,
      executableEngine: engine,
      runtimeVersion: engine === 'webkit' ? version : `${version}.0.0.0`,
      runtimeEngine: engine,
      executableMethod: 'executable:--version',
      runtimeMethod: 'playwright:browser.version()',
      verified: true,
      mismatchReason: null,
    },
    controller: 'playwright',
    signals: {
      navigationError: null, jsErrors: [], consoleErrors: [], failedRequests: [],
      rendered: true, renderedSelectors: [], readyMs: 10,
    },
    artifacts: { screenshotPath: '/volatile/shot.png', tracePath: null },
    finding: null,
    limitationNote: null,
    durationMs: 100,
    ...extra,
  };
}

function scan(results: CheckResult[], summaries: ScanResult['summaries']): ScanResult {
  return {
    website: 'http://127.0.0.1:4317',
    pages: ['http://127.0.0.1:4317/'],
    startedAt: '2026-08-24T00:00:00.000Z',
    finishedAt: '2026-08-24T00:01:00.000Z',
    config: { timeoutMs: 30000, headed: false, latestOnly: false, quick: false, strategy: 'binary', stepSize: 10, versionFloor: { chromium: 67 } },
    provenance: {
      packageVersion: '1.5.2', os: 'linux', arch: 'x64', controllerPolicy: 'auto',
      routes: [{ url: 'http://127.0.0.1:4317/', label: 'home', readiness: 'none' }],
      checks: { navigation: true, javascript: true, console: true, network: true, rendering: true, readiness: true },
    },
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
    configFingerprint: 'b'.repeat(64),
    results,
    summaries,
    featureFindings: [],
  } as ScanResult;
}

function chromiumScan(): ScanResult {
  return scan(
    [check('chromium', '120', 'fail'), check('chromium', '121', 'pass')],
    [{
      engine: 'chromium', versionType: 'real-major', tested: ['120', '121'], latestTested: '121',
      oldestVerifiedPassing: '121', firstVerifiedFailing: '120', boundaryConfidence: 'high',
      inconclusive: [], skipped: [], resultLine: 'verified PASS >= 121; verified FAIL at 120',
      failureReason: 'TypeError: Array.fromAsync is not a function', limitationNote: null,
    }],
  );
}

test('verified per-engine boundaries become accepted entries', () => {
  const baseline = createBaseline(chromiumScan());
  assert.equal(baseline.schemaVersion, 1);
  assert.equal(baseline.engines.length, 1);
  const entry = baseline.engines[0];
  assert.equal(entry.engine, 'chromium');
  assert.equal(entry.oldestVerifiedPassing, '121');
  assert.equal(entry.firstVerifiedFailing, '120');
  assert.equal(entry.identity.verified, true);
  assert.equal(entry.browserSource, 'build 121');
  assert.equal(entry.controller, 'playwright');
});

test('WebKit revision entries keep their own version type', () => {
  const s = scan(
    [check('webkit', '2182', 'pass')],
    [{
      engine: 'webkit', versionType: 'playwright-revision', tested: ['2182'], latestTested: '2182',
      oldestVerifiedPassing: '2182', firstVerifiedFailing: null, boundaryConfidence: 'unknown',
      inconclusive: [], skipped: [], resultLine: 'verified PASS >= 2182', failureReason: null, limitationNote: null,
    }],
  );
  const baseline = createBaseline(s);
  assert.equal(baseline.engines[0].versionType, 'playwright-revision');
  assert.equal(baseline.engines[0].oldestVerifiedPassing, '2182');
});

test('an engine with no verified boundary is excluded, never invented', () => {
  const s = scan(
    [check('chromium', '120', 'fail'), check('chromium', '121', 'pass'), check('firefox', '73', 'inconclusive')],
    [
      chromiumScan().summaries[0],
      {
        engine: 'firefox', versionType: 'real-major', tested: ['73'], latestTested: '73',
        oldestVerifiedPassing: null, firstVerifiedFailing: null, boundaryConfidence: 'unknown',
        inconclusive: ['73'], skipped: [], resultLine: 'INCONCLUSIVE', failureReason: null, limitationNote: null,
      },
    ],
  );
  const baseline = createBaseline(s);
  assert.deepEqual(baseline.engines.map((e) => e.engine), ['chromium']);
});

test('a scan with no acceptable verified engine evidence is rejected', () => {
  const s = scan(
    [check('firefox', '73', 'inconclusive')],
    [{
      engine: 'firefox', versionType: 'real-major', tested: ['73'], latestTested: '73',
      oldestVerifiedPassing: null, firstVerifiedFailing: null, boundaryConfidence: 'unknown',
      inconclusive: ['73'], skipped: [], resultLine: 'INCONCLUSIVE', failureReason: null, limitationNote: null,
    }],
  );
  assert.throws(() => createBaseline(s), BaselineCreationError);
});

test('volatile paths (executables, artifacts) are omitted from the baseline', () => {
  const json = JSON.stringify(createBaseline(chromiumScan()));
  assert.ok(!json.includes('/volatile'));
});

test('writeBaseline is non-destructive without force and validates on read', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bb-baseline-'));
  const file = path.join(dir, 'baseline.json');
  const baseline = createBaseline(chromiumScan());

  writeBaseline(file, baseline);
  assert.ok(existsSync(file));
  assert.throws(() => writeBaseline(file, baseline), /exists/i);
  assert.throws(() => writeBaseline(file, baseline, { force: false }), /exists/i);
  writeBaseline(file, baseline, { force: true }); // explicit update

  const read = readBaseline(file);
  assert.equal(read.ok, true);
  rmSync(dir, { recursive: true, force: true });
});

test('output JSON ends with a newline and has stable ordering', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bb-baseline-'));
  const file = path.join(dir, 'baseline.json');
  const baseline = createBaseline(chromiumScan()); // one artifact, written twice
  writeBaseline(file, baseline);
  writeBaseline(path.join(dir, 'b2.json'), baseline, { force: true });
  const a = readFileSync(file, 'utf8');
  const b = readFileSync(path.join(dir, 'b2.json'), 'utf8');
  assert.ok(a.endsWith('\n'));
  assert.equal(a, b); // deterministic serialization
  rmSync(dir, { recursive: true, force: true });
});

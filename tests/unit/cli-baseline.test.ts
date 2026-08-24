import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseCli, HELP } from '../../src/cli/options.js';
import { runBaselineCreate } from '../../src/cli/baseline.js';
import type { ScanResult } from '../../src/reporting/types.js';

function parseBaseline(args: string[]) {
  const parsed = parseCli(args);
  assert.equal(parsed.command, 'baseline-create');
  return parsed;
}

test('baseline create parses --from and --output', () => {
  const p = parseBaseline(['baseline', 'create', '--from', './reports/compatibility.json', '--output', './browser-boundary.baseline.json']);
  assert.equal(p.from, './reports/compatibility.json');
  assert.equal(p.output, './browser-boundary.baseline.json');
  assert.equal(p.force, false);
});

test('baseline create parses --force and application metadata', () => {
  const p = parseBaseline(['baseline', 'create', '--from', 'a.json', '--output', 'b.json', '--force', '--app-id', 'my-app', '--app-revision', 'sha123']);
  assert.equal(p.force, true);
  assert.deepEqual(p.application, { id: 'my-app', revision: 'sha123' });
});

test('baseline create requires --from and --output', () => {
  assert.throws(() => parseCli(['baseline', 'create', '--output', 'b.json']), /--from/);
  assert.throws(() => parseCli(['baseline', 'create', '--from', 'a.json']), /--output/);
});

test('help documents baseline create as explicit and reviewable', () => {
  assert.match(HELP, /baseline create/);
  assert.match(HELP, /never rewrites|never rewritten/i);
});

function scanJson(): ScanResult {
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
    configFingerprint: 'c'.repeat(64),
    results: [
      {
        engine: 'chromium', version: '120', versionType: 'real-major', buildLabel: 'build 121',
        executablePath: '/x', url: 'http://127.0.0.1:4317/', verdict: 'fail',
        reason: 'TypeError: Array.fromAsync is not a function',
        identity: {
          requestedVersion: '120', requestedEngine: 'chromium', executableVersion: '120.0', executableEngine: 'chromium',
          runtimeVersion: '120.0', runtimeEngine: 'chromium', executableMethod: 'executable:--version',
          runtimeMethod: 'playwright:browser.version()', verified: true, mismatchReason: null,
        },
        controller: 'playwright',
        signals: { navigationError: null, jsErrors: [], consoleErrors: [], failedRequests: [], rendered: true, renderedSelectors: [], readyMs: 1 },
        artifacts: { screenshotPath: null, tracePath: null }, finding: null, limitationNote: null, durationMs: 1,
      },
      {
        engine: 'chromium', version: '121', versionType: 'real-major', buildLabel: 'build 121',
        executablePath: '/x', url: 'http://127.0.0.1:4317/', verdict: 'pass', reason: '',
        identity: {
          requestedVersion: '121', requestedEngine: 'chromium', executableVersion: '121.0', executableEngine: 'chromium',
          runtimeVersion: '121.0', runtimeEngine: 'chromium', executableMethod: 'executable:--version',
          runtimeMethod: 'playwright:browser.version()', verified: true, mismatchReason: null,
        },
        controller: 'playwright',
        signals: { navigationError: null, jsErrors: [], consoleErrors: [], failedRequests: [], rendered: true, renderedSelectors: [], readyMs: 1 },
        artifacts: { screenshotPath: null, tracePath: null }, finding: null, limitationNote: null, durationMs: 1,
      },
    ],
    summaries: [
      {
        engine: 'chromium', versionType: 'real-major', tested: ['120', '121'], latestTested: '121',
        oldestVerifiedPassing: '121', firstVerifiedFailing: '120', boundaryConfidence: 'high',
        inconclusive: [], skipped: [], resultLine: 'verified PASS >= 121; verified FAIL at 120',
        failureReason: 'TypeError: Array.fromAsync is not a function', limitationNote: null,
      },
    ],
    featureFindings: [],
  } as ScanResult;
}

function writeScan(dir: string, scan: unknown): string {
  mkdirSync(path.join(dir, 'reports'), { recursive: true });
  const file = path.join(dir, 'reports', 'compatibility.json');
  writeFileSync(file, JSON.stringify(scan));
  return file;
}

test('runBaselineCreate accepts a verified scan and writes a reviewable baseline (exit 0)', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bb-cli-'));
  const from = writeScan(dir, scanJson());
  const out = path.join(dir, 'baseline.json');
  const code = await runBaselineCreate({ from, output: out, force: false, application: { id: 'my-app' } });
  assert.equal(code, 0);
  const baseline = JSON.parse(readFileSync(out, 'utf8'));
  assert.equal(baseline.schemaVersion, 1);
  assert.equal(baseline.application?.id, 'my-app');
  assert.deepEqual(baseline.engines.map((e: { engine: string }) => e.engine), ['chromium']);
  rmSync(dir, { recursive: true, force: true });
});

test('missing report file returns the configuration exit code', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bb-cli-'));
  const code = await runBaselineCreate({ from: path.join(dir, 'nope.json'), output: path.join(dir, 'b.json'), force: false });
  assert.equal(code, 2);
  rmSync(dir, { recursive: true, force: true });
});

test('scan with no verified evidence returns the configuration exit code and writes nothing', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bb-cli-'));
  const scan = scanJson();
  scan.summaries[0].oldestVerifiedPassing = null;
  scan.summaries[0].firstVerifiedFailing = null;
  scan.results = [];
  const from = writeScan(dir, scan);
  const out = path.join(dir, 'b.json');
  assert.equal(await runBaselineCreate({ from, output: out, force: false }), 2);
  assert.ok(!existsSync(out));
  rmSync(dir, { recursive: true, force: true });
});

test('existing output is refused without --force and replaced with it', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bb-cli-'));
  const from = writeScan(dir, scanJson());
  const out = path.join(dir, 'baseline.json');
  assert.equal(await runBaselineCreate({ from, output: out, force: false }), 0);
  // second run without force refuses with a configuration error
  assert.equal(await runBaselineCreate({ from, output: out, force: false }), 2);
  // explicit --force updates
  assert.equal(await runBaselineCreate({ from, output: out, force: true }), 0);
  rmSync(dir, { recursive: true, force: true });
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runBaselineCreate } from '../../src/cli/baseline.js';
import { runCompare } from '../../src/cli/compare.js';
import { renderComparisonJson } from '../../src/reporting/comparison-json.js';
import { renderComparisonMarkdown } from '../../src/reporting/comparison-markdown.js';
import { renderGithubSummary } from '../../src/reporting/github-summary.js';
import { compareScanToBaseline } from '../../src/baseline/compare.js';
import { readBaseline } from '../../src/baseline/io.js';
import type { ScanResult } from '../../src/reporting/types.js';

/**
 * P1 end-to-end retention gate (Task 18): a committed baseline detects a real
 * verified regression while infrastructure uncertainty stays non-regressive.
 * Uses controlled scan-result fixtures (no live browsers) and exercises the
 * REAL command adapters, comparator, reporters, and gate exit codes.
 */

const FINGERPRINT = 'f'.repeat(64);

function scanResult(oldest: string | null, firstFail: string | null): ScanResult {
  const fingerprint = FINGERPRINT;
  const identity = (version: string) => ({
    requestedVersion: version, requestedEngine: 'chromium' as const,
    executableVersion: `${version}.0`, executableEngine: 'chromium',
    runtimeVersion: `${version}.0`, runtimeEngine: 'chromium',
    executableMethod: 'executable:--version', runtimeMethod: 'playwright:browser.version()',
    verified: true, mismatchReason: null,
  });
  const anchors = [
    ...(firstFail ? [{ version: firstFail, verdict: 'fail' as const }] : []),
    ...(oldest ? [{ version: oldest, verdict: 'pass' as const }] : []),
  ].map(({ version, verdict }) => ({
    engine: 'chromium' as const, version, versionType: 'real-major' as const,
    buildLabel: `build ${version}`, executablePath: '/x', url: 'http://127.0.0.1:4317/',
    verdict, reason: verdict === 'fail' ? 'TypeError: Array.fromAsync is not a function' : '',
    identity: identity(version), controller: 'playwright' as const,
    signals: { navigationError: null, jsErrors: [], consoleErrors: [], failedRequests: [], rendered: true, renderedSelectors: [], readyMs: 1 },
    artifacts: { screenshotPath: null, tracePath: null }, finding: null, limitationNote: null, durationMs: 1,
  }));
  return {
    website: 'http://127.0.0.1:4317',
    pages: ['http://127.0.0.1:4317/'],
    startedAt: '2026-08-25T00:00:00.000Z',
    finishedAt: '2026-08-25T00:01:00.000Z',
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
    configFingerprint: fingerprint,
    results: anchors,
    summaries: [
      {
        engine: 'chromium', versionType: 'real-major', tested: [], latestTested: null,
        oldestVerifiedPassing: oldest, firstVerifiedFailing: firstFail, boundaryConfidence: 'high',
        inconclusive: [], skipped: [], resultLine: 'line',
        failureReason: firstFail ? 'TypeError: Array.fromAsync is not a function' : null, limitationNote: null,
      },
    ],
    featureFindings: [],
  } as unknown as ScanResult;
}

interface Rig {
  dir: string;
  scanPath: (name: string, scan: ScanResult) => string;
  baselinePath: string;
  reportPath: string;
}

function rig(): Rig {
  const dir = mkdtempSync(path.join(tmpdir(), 'bb-e2e-'));
  mkdirSync(path.join(dir, 'reports'), { recursive: true });
  return {
    dir,
    scanPath: (name, scan) => {
      const file = path.join(dir, name);
      writeFileSync(file, JSON.stringify(scan));
      return file;
    },
    baselinePath: path.join(dir, 'browser-boundary.baseline.json'),
    reportPath: path.join(dir, 'reports', 'compatibility.json'),
  };
}

test('P1 flow: baseline accepts floor 71, compares unchanged, regressed, and infra-only without mutation', async () => {
  const r = rig();

  // 1. Create a baseline at floor 71 from a completed scan.
  const floor71 = r.scanPath('floor71.json', scanResult('71', '70'));
  assert.equal(await runBaselineCreate({ from: floor71, output: r.baselinePath, force: false }), 0);
  const baselineBytes = readFileSync(r.baselinePath, 'utf8');
  const accepted = readBaseline(r.baselinePath);
  assert.equal(accepted.ok, true);

  // 2. Equivalent floor 71 → unchanged, gate passes.
  const same = r.scanPath('same.json', scanResult('71', '70'));
  assert.equal(await runCompare({ baseline: r.baselinePath, current: same, gate: true }), 0);

  // 3. Verified floor 73 with verified failure at 72 → regressed, gate fails (exit 1).
  const moved = r.scanPath('moved.json', scanResult('73', '72'));
  assert.equal(await runCompare({ baseline: r.baselinePath, current: moved, gate: true }), 1);

  // 4. Infrastructure-only current result → inconclusive, gate passes.
  const infra = r.scanPath('infra.json', scanResult(null, null));
  assert.equal(await runCompare({ baseline: r.baselinePath, current: infra, gate: true }), 0);

  // 5. The baseline bytes are unchanged after every compare.
  assert.equal(readFileSync(r.baselinePath, 'utf8'), baselineBytes);

  // 6. JSON, Markdown, GitHub summary, and gate exit agree on the regression.
  const comparison = compareScanToBaseline(accepted.baseline, scanResult('73', '72'));
  assert.equal(comparison.engines[0].state, 'regressed');
  const json = renderComparisonJson(comparison);
  const md = renderComparisonMarkdown(comparison);
  const gh = renderGithubSummary(comparison);
  for (const output of [JSON.stringify(json), md, gh]) {
    assert.ok(output.includes('regressed'));
    assert.ok(output.includes('72'));
  }
  rmSync(r.dir, { recursive: true, force: true });
});

test('P1 flow: material scope drift is visible and never silently compared', async () => {
  const r = rig();
  const floor71 = r.scanPath('floor71.json', scanResult('71', '70'));
  assert.equal(await runBaselineCreate({ from: floor71, output: r.baselinePath, force: false }), 0);

  // Same fingerprint but a different route set would drift; simulate by
  // rebuilding a scan whose scope routes differ while keeping the floor.
  const drifted = scanResult('71', '70');
  drifted.scope.routes = [{ url: 'http://127.0.0.1:9999/other', label: 'other', readiness: { kind: 'none' } }];
  // A drifted scope yields a different canonical fingerprint in real scans.
  drifted.configFingerprint = 'd'.repeat(64);
  const driftedPath = r.scanPath('drifted.json', drifted);
  assert.equal(await runCompare({ baseline: r.baselinePath, current: driftedPath, gate: true }), 0); // inconclusive, not regressed

  const acceptedDrift = readBaseline(r.baselinePath);
  assert.equal(acceptedDrift.ok, true);
  if (!acceptedDrift.ok) return;
  const comparison = compareScanToBaseline(acceptedDrift.baseline, drifted);
  const engine = comparison.engines[0];
  assert.equal(engine.state, 'inconclusive');
  assert.ok(engine.warnings.some((w) => w.code === 'scope-drift'));
  assert.ok(renderComparisonMarkdown(comparison).includes('scope-drift'));
  rmSync(r.dir, { recursive: true, force: true });
});

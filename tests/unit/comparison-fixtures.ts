import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { BoundaryBaseline } from '../../src/baseline/types.js';
import type { ScanResult } from '../../src/reporting/types.js';

/** Shared fixtures for the compare CLI and regression-gate tests. */

export function baselineJson(oldest: string | null = '71', firstFail: string | null = '70'): BoundaryBaseline {
  return {
    schemaVersion: 1,
    createdAt: '2026-08-24T00:00:00.000Z',
    packageVersion: '1.5.2',
    configFingerprint: 'b'.repeat(64),
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
    engines: [
      {
        engine: 'chromium',
        versionType: 'real-major',
        oldestVerifiedPassing: oldest,
        firstVerifiedFailing: firstFail,
        failureReason: firstFail ? 'TypeError' : null,
        testedVersions: oldest ? [oldest] : [],
        inconclusiveVersions: [],
        browserSource: 'build',
        controller: 'playwright',
        os: 'linux',
        arch: 'x64',
        identity: { requestedVersion: oldest ?? '0', runtimeVersion: oldest, executableVersion: oldest, verified: true, mismatchReason: null },
      },
    ],
  };
}

export function scanJson(oldest: string | null, firstFail: string | null, fingerprint = 'b'.repeat(64)): ScanResult {
  return {
    website: 'http://127.0.0.1:4317',
    pages: ['http://127.0.0.1:4317/'],
    startedAt: '2026-08-24T00:00:00.000Z',
    finishedAt: '2026-08-24T00:01:00.000Z',
    config: { timeoutMs: 30000, headed: false, latestOnly: false, quick: false, strategy: 'binary', stepSize: 10, versionFloor: { chromium: 67 } },
    provenance: {
      packageVersion: '1.5.2', os: 'linux', arch: 'x64', controllerPolicy: 'auto',
      routes: [{ url: 'http://127.0.0.1:4317/', label: 'home', readiness: 'none' as const }],
      checks: { navigation: true, javascript: true, console: true, network: true, rendering: true, readiness: true },
    },
    scope: baselineJson().scope,
    configFingerprint: fingerprint,
    results: [],
    summaries: [
      {
        engine: 'chromium', versionType: 'real-major', tested: oldest ? [oldest] : [], latestTested: oldest,
        oldestVerifiedPassing: oldest, firstVerifiedFailing: firstFail, boundaryConfidence: 'high',
        inconclusive: [], skipped: [], resultLine: 'line',
        failureReason: firstFail ? 'TypeError' : null, limitationNote: null,
      },
    ],
    featureFindings: [],
  } as unknown as ScanResult;
}

export function writeArtifacts(
  dir: string,
  baseline: BoundaryBaseline,
  scan: ScanResult,
): { baselinePath: string; currentPath: string } {
  const baselinePath = path.join(dir, 'browser-boundary.baseline.json');
  const currentPath = path.join(dir, 'reports', 'compatibility.json');
  mkdirSync(path.dirname(currentPath), { recursive: true });
  writeFileSync(baselinePath, JSON.stringify(baseline, null, 2));
  writeFileSync(currentPath, JSON.stringify(scan));
  return { baselinePath, currentPath };
}

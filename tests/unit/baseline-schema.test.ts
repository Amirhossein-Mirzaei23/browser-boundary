import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { BoundaryBaseline, ComparisonState } from '../../src/baseline/types.js';
import { validateBaseline, BASELINE_SCHEMA_VERSION } from '../../src/baseline/schema.js';

function validBaseline(): BoundaryBaseline {
  return {
    schemaVersion: 1,
    createdAt: '2026-08-24T00:00:00.000Z',
    packageVersion: '1.5.2',
    configFingerprint: 'a'.repeat(64),
    scope: {
      routes: [{ url: 'http://127.0.0.1:4317/', label: 'home', readiness: { kind: 'selectors', selectors: ['#app'], mode: 'any' } }],
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
        oldestVerifiedPassing: '121',
        firstVerifiedFailing: '120',
        failureReason: 'TypeError: Array.fromAsync is not a function',
        testedVersions: ['120', '121'],
        inconclusiveVersions: [],
        browserSource: 'Chrome for Testing 121.0.6167.184',
        controller: 'playwright',
        os: 'linux',
        arch: 'x64',
        identity: { requestedVersion: '121', runtimeVersion: '121.0.6167.184', executableVersion: '121.0.6167.184', verified: true, mismatchReason: null },
      },
    ],
  };
}

test('a valid Chromium real-major baseline is accepted', () => {
  const r = validateBaseline(validBaseline());
  assert.equal(r.ok, true);
});

test('valid Firefox real-major and WebKit playwright-revision entries are accepted', () => {
  const b = validBaseline();
  b.engines = [
    {
      engine: 'firefox',
      versionType: 'real-major',
      oldestVerifiedPassing: '63',
      firstVerifiedFailing: null,
      failureReason: null,
      testedVersions: ['63'],
      inconclusiveVersions: [],
      browserSource: 'Firefox 143.0',
      controller: 'webdriver',
      os: 'linux',
      arch: 'x64',
      identity: { requestedVersion: '63', runtimeVersion: '63.0', executableVersion: '63.0', verified: true, mismatchReason: null },
    },
    {
      engine: 'webkit',
      versionType: 'playwright-revision',
      oldestVerifiedPassing: '2182',
      firstVerifiedFailing: null,
      failureReason: null,
      testedVersions: ['2182'],
      inconclusiveVersions: [],
      browserSource: 'Playwright WebKit 2182',
      controller: 'playwright',
      os: 'linux',
      arch: 'x64',
      identity: { requestedVersion: '2182', runtimeVersion: '2182', executableVersion: null, verified: true, mismatchReason: null },
    },
  ];
  const r = validateBaseline(b);
  assert.equal(r.ok, true);
});

test('unsupported schema version is rejected with an actionable diagnostic', () => {
  const b = validBaseline();
  (b as { schemaVersion: number }).schemaVersion = 2;
  const r = validateBaseline(b);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /schema version/i.test(e) && /1/.test(e)));
});

test('missing versionType on an engine entry is rejected', () => {
  const b = validBaseline();
  delete (b.engines[0] as { versionType?: string }).versionType;
  const r = validateBaseline(b);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /versionType/.test(e)));
});

test('malformed timestamp is rejected', () => {
  const b = validBaseline();
  b.createdAt = 'yesterday';
  const r = validateBaseline(b);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /createdAt/.test(e)));
});

test('duplicate engines are rejected', () => {
  const b = validBaseline();
  b.engines = [b.engines[0], { ...b.engines[0] }];
  const r = validateBaseline(b);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /duplicate/i.test(e)));
});

test('real-major/revision mismatch is rejected (WebKit claimed as real major)', () => {
  const b = validBaseline();
  (b.engines[0] as { engine: string }).engine = 'webkit';
  const r = validateBaseline(b);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /webkit/i.test(e) && /playwright-revision/i.test(e)));
});

test('unknown top-level fields are rejected under the strict forward-compatibility policy', () => {
  const b = validBaseline() as unknown as Record<string, unknown>;
  b.futureField = true;
  const r = validateBaseline(b);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /unknown field/i.test(e)));
});

test('missing required fields are each reported', () => {
  const r = validateBaseline({});
  assert.equal(r.ok, false);
  for (const field of ['schemaVersion', 'createdAt', 'packageVersion', 'configFingerprint', 'scope', 'engines']) {
    assert.ok(r.errors.some((e) => e.includes(field)), field);
  }
});

test('fingerprint must be a sha256 hex digest', () => {
  const b = validBaseline();
  b.configFingerprint = 'not-a-hash';
  const r = validateBaseline(b);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /configFingerprint/.test(e)));
});

test('comparison states include the six contract values', () => {
  const states: ComparisonState[] = ['improved', 'unchanged', 'regressed', 'inconclusive', 'unbaselined', 'not-compared'];
  assert.equal(states.length, 6);
  assert.equal(BASELINE_SCHEMA_VERSION, 1);
});

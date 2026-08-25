import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildIdentityEvidence, majorOf, parseVersionIdentity } from '../../src/browsers/identity.js';
import type { BrowserIdentityEvidence } from '../../src/reporting/types.js';

test('requested, on-disk, and live majors agree yields verified identity', () => {
  const evidence = buildIdentityEvidence({
    requestedVersion: '114',
    requestedEngine: 'chromium',
    versionType: 'real-major',
    executable: { engine: 'chromium', version: 'Chromium 114.0.5735.35', method: 'executable:--version' },
    runtime: { engine: 'chromium', version: '114.0.5735.35', method: 'playwright:browser.version()' },
  });

  assert.equal(evidence.verified, true);
  assert.equal(evidence.mismatchReason, null);
  assert.equal(evidence.executableEngine, 'chromium');
  assert.equal(evidence.runtimeEngine, 'chromium');
});

test('live major mismatch marks the identity unverified', () => {
  const evidence = buildIdentityEvidence({
    requestedVersion: '102',
    requestedEngine: 'firefox',
    versionType: 'real-major',
    executable: { engine: 'firefox', version: 'Mozilla Firefox 102.0', method: 'executable:--version' },
    runtime: { engine: 'firefox', version: '132.0', method: 'webdriver:session-capabilities' },
  });

  assert.equal(evidence.verified, false);
  assert.equal(evidence.mismatchReason, 'runtime-version-mismatch');
  // Identity evidence is still retained for the failed check.
  assert.equal(evidence.runtimeVersion, '132.0');
});

test('unparseable on-disk identity marks the identity unverified', () => {
  const evidence = buildIdentityEvidence({
    requestedVersion: '114',
    requestedEngine: 'chromium',
    versionType: 'real-major',
    executable: { engine: null, version: null, method: 'executable:--version' },
    runtime: { engine: 'chromium', version: '114.0', method: 'playwright:browser.version()' },
  });

  assert.equal(evidence.verified, false);
  assert.equal(evidence.mismatchReason, 'executable-identity-unparseable');
});

test('missing live identity marks the identity unverified', () => {
  const evidence = buildIdentityEvidence({
    requestedVersion: '114',
    requestedEngine: 'chromium',
    versionType: 'real-major',
    executable: { engine: 'chromium', version: 'Chromium 114.0.5735.35', method: 'executable:--version' },
    runtime: null,
  });

  assert.equal(evidence.verified, false);
  assert.equal(evidence.mismatchReason, 'runtime-identity-unavailable');
});

test('WebKit keeps the playwright-revision domain and is never compared to Safari majors', () => {
  const evidence = buildIdentityEvidence({
    requestedVersion: '2150',
    requestedEngine: 'webkit',
    versionType: 'playwright-revision',
    // Revision builds have no real-major on-disk identity to compare.
    executable: null,
    runtime: { engine: 'webkit', version: '2150', method: 'playwright:browser.version()' },
  });

  assert.equal(evidence.verified, true);
  assert.equal(evidence.mismatchReason, null);
  assert.equal(evidence.requestedEngine, 'webkit');
  // The revision must never be re-labelled as a Safari major.
  assert.ok(!/safari/i.test(evidence.executableEngine ?? ''));
  assert.ok(!/safari/i.test(evidence.runtimeEngine ?? ''));
});

test('WebKit revision identity with a non-WebKit live engine stays unverified', () => {
  const evidence = buildIdentityEvidence({
    requestedVersion: '2150',
    requestedEngine: 'webkit',
    versionType: 'playwright-revision',
    executable: null,
    runtime: { engine: 'chromium', version: '138.0', method: 'playwright:browser.version()' },
  });

  assert.equal(evidence.verified, false);
  assert.equal(evidence.mismatchReason, 'runtime-engine-mismatch');
});

test('on-disk engine from a different version domain is a mismatch', () => {
  const evidence = buildIdentityEvidence({
    requestedVersion: '102',
    requestedEngine: 'firefox',
    versionType: 'real-major',
    executable: { engine: 'chromium', version: 'Chromium 102.0', method: 'executable:--version' },
    runtime: { engine: 'firefox', version: '102.0', method: 'webdriver:session-capabilities' },
  });

  assert.equal(evidence.verified, false);
  assert.equal(evidence.mismatchReason, 'executable-engine-mismatch');
});

test('version output parsing handles common browser strings', () => {
  assert.deepEqual(parseVersionIdentity('Chromium 114.0.5735.35'), { engine: 'chromium', version: '114.0.5735.35' });
  assert.deepEqual(parseVersionIdentity('Mozilla Firefox 102.0.1'), { engine: 'firefox', version: '102.0.1' });
  assert.equal(majorOf('114.0.5735.35'), '114');
  assert.equal(majorOf(null), null);
});

test('runCheck enforces the identity honesty rule and reports identity evidence', () => {
  const checker = readFileSync(new URL('../../src/core/compatibility-checker.ts', import.meta.url), 'utf8');
  const types = readFileSync(new URL('../../src/reporting/types.ts', import.meta.url), 'utf8');

  // CheckResult carries identity + controller for both passing and failing checks.
  assert.ok(types.includes('identity: BrowserIdentityEvidence'));
  assert.ok(types.includes("controller: 'playwright' | 'webdriver' | null"));

  // Identity is collected after launch and before navigation.
  const launchIdx = checker.indexOf('controller.launch');
  const identityIdx = checker.indexOf('identity = buildIdentityEvidence');
  const gotoIdx = checker.indexOf('session.goto');
  assert.ok(launchIdx >= 0 && identityIdx > launchIdx && gotoIdx > identityIdx);

  // An unverified identity yields inconclusive without running compatibility checks.
  assert.match(checker, /identity\.verified/);
  assert.match(checker, /Browser identity could not be verified/);
});

test('controller sessions expose a live identity query', () => {
  const source = readFileSync(new URL('../../src/controllers/types.ts', import.meta.url), 'utf8');
  assert.match(source, /getIdentity\(\): Promise<RawControllerIdentity>/);
  const playwright = readFileSync(new URL('../../src/controllers/playwright.ts', import.meta.url), 'utf8');
  assert.match(playwright, /browser\.version\(\)/);
  const webdriver = readFileSync(new URL('../../src/controllers/webdriver.ts', import.meta.url), 'utf8');
  assert.match(webdriver, /browserVersion|getCapabilities/);
});

test('evidence fields are fully populated for a passing check', () => {
  const evidence: BrowserIdentityEvidence = buildIdentityEvidence({
    requestedVersion: '138',
    requestedEngine: 'chromium',
    versionType: 'real-major',
    executable: { engine: 'chrome', version: 'Google Chrome 138.0.7204.49', method: 'executable:--version' },
    runtime: { engine: 'chromium', version: '138.0.7204.49', method: 'playwright:browser.version()' },
  });

  assert.equal(evidence.requestedVersion, '138');
  assert.equal(evidence.requestedEngine, 'chromium');
  assert.equal(evidence.verified, true);
  assert.equal(evidence.executableMethod, 'executable:--version');
  assert.equal(evidence.runtimeMethod, 'playwright:browser.version()');
});

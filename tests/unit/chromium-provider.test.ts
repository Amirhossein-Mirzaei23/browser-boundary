import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { mkdtempSync } from 'node:fs';
import path from 'node:path';
import { ChromiumProvider } from '../../src/browsers/chromium-provider.js';
import { HistoricalUnavailableError } from '../../src/browsers/types.js';

/**
 * Honesty contract for Chromium: a historical binary that cannot be obtained is
 * reported INCONCLUSIVE, NEVER substituted with the current Chrome build. This
 * mirrors the Firefox provider's strict-inconclusive rule.
 */
test('ChromiumProvider.install throws HistoricalUnavailableError on snapshot download failure (never substitutes current)', async () => {
  const c = new ChromiumProvider();
  // Force getLatest to a high version so the historical branch is taken.
  (c as unknown as { playwright: { getLatest: () => Promise<unknown> } }).playwright = {
    getLatest: async () => ({ version: '999', executablePath: '/x', buildLabel: 'Chrome 999', versionType: 'real-major' }),
  };
  // Major 80 routes to the snapshot path; force it to fail without any
  // network/puppeteer dependency, to assert the error is wrapped honestly.
  (c as unknown as { downloadChromiumSnapshot: () => Promise<never> }).downloadChromiumSnapshot = async () => {
    throw new Error('simulated download failure');
  };
  const cache = mkdtempSync(path.join(tmpdir(), 'mrz-chromium-'));

  await assert.rejects(
    () => c.install('chromium', '80', cache),
    (err: unknown) => {
      assert.ok(err instanceof HistoricalUnavailableError, 'must be HistoricalUnavailableError, not a substitution');
      assert.equal((err as HistoricalUnavailableError).code, 'download-failed');
      assert.match((err as Error).message, /not tested/);
      return true;
    },
  );
});

test('ChromiumProvider.install returns the Playwright build for latest-or-newer', async () => {
  const c = new ChromiumProvider();
  const fakeLatest = {
    executablePath: '/fake/chrome',
    buildLabel: 'Chrome 999',
    version: '999',
    versionType: 'real-major' as const,
  };
  (c as unknown as { playwright: { getLatest: () => Promise<typeof fakeLatest> } }).playwright = {
    getLatest: async () => fakeLatest,
  };
  const cache = mkdtempSync(path.join(tmpdir(), 'mrz-chromium-latest-'));
  const binary = await c.install('chromium', '999', cache);
  assert.equal(binary.isPlaywrightBuild, true);
  assert.equal(binary.controller, 'playwright');
  assert.equal(binary.executablePath, '/fake/chrome');
  assert.equal(binary.limitationNote, null);
});

test('REGRESSION: majors below CFT existence floor route to the snapshot source, not CFT', async () => {
  // Major 111 is in the snapshot range (60–112). The provider must NOT route it
  // to the CFT path (which would 404/403). We assert routing by stubbing both
  // download methods and confirming only the snapshot one is called.
  const c = new ChromiumProvider();
  (c as unknown as { playwright: { getLatest: () => Promise<unknown> } }).playwright = {
    getLatest: async () => ({ version: '999', executablePath: '/x', buildLabel: 'Chrome 999', versionType: 'real-major' }),
  };
  let cftCalled = false;
  let snapCalled = false;
  (c as unknown as { downloadChromiumForTesting: () => Promise<never> }).downloadChromiumForTesting = async () => {
    cftCalled = true;
    throw new Error('CFT must not be used for major <113');
  };
  (c as unknown as { downloadChromiumSnapshot: () => Promise<{ executablePath: string; buildLabel: string }> }).downloadChromiumSnapshot = async () => {
    snapCalled = true;
    return { executablePath: '/fake/chrome-snap', buildLabel: 'Chromium 111 (snapshot)' };
  };
  const cache = mkdtempSync(path.join(tmpdir(), 'mrz-chromium-route-'));

  const binary = await c.install('chromium', '111', cache);
  assert.equal(snapCalled, true, 'major 111 must use the snapshot path');
  assert.equal(cftCalled, false, 'major 111 must NOT use the CFT path');
  assert.equal(binary.buildLabel, 'Chromium 111 (snapshot)');
  assert.equal(binary.controller, 'playwright');
  assert.equal(binary.isPlaywrightBuild, false);
});

test('REGRESSION: a major with no curated snapshot revision throws HistoricalUnavailableError', async () => {
  // Major 59 is below the supported snapshot floor (60). It must throw honestly
  // rather than attempt a download or substitute another version.
  const c = new ChromiumProvider();
  (c as unknown as { playwright: { getLatest: () => Promise<unknown> } }).playwright = {
    getLatest: async () => ({ version: '999', executablePath: '/x', buildLabel: 'Chrome 999', versionType: 'real-major' }),
  };
  const cache = mkdtempSync(path.join(tmpdir(), 'mrz-chromium-norev-'));

  await assert.rejects(
    () => c.install('chromium', '59', cache),
    (err: unknown) => {
      assert.ok(err instanceof HistoricalUnavailableError);
      assert.equal((err as HistoricalUnavailableError).code, 'download-failed');
      assert.match((err as Error).message, /No curated Chromium snapshot revision for Chrome 59/);
      return true;
    },
  );
});

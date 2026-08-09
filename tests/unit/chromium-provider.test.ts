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
test('ChromiumProvider.install throws HistoricalUnavailableError on download failure (never substitutes current)', async () => {
  const c = new ChromiumProvider();
  // Force getLatest to a high version so the historical branch is taken.
  (c as unknown as { playwright: { getLatest: () => Promise<unknown> } }).playwright = {
    getLatest: async () => ({ version: '999', executablePath: '/x', buildLabel: 'Chrome 999', versionType: 'real-major' }),
  };
  // Force the download path to fail without any network/puppeteer dependency.
  (c as unknown as { downloadChromiumForTesting: () => Promise<never> }).downloadChromiumForTesting = async () => {
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

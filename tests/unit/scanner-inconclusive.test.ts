import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BrowserCompatibilityScanner } from '../../src/core/scanner.js';
import { HistoricalUnavailableError } from '../../src/browsers/types.js';
import type { BrowserBinary, BrowserProvider, BrowserVersion } from '../../src/browsers/types.js';
import type { EngineName } from '../../src/reporting/types.js';

/**
 * Honesty contract for unavailable historical binaries: the scanner must
 * record INCONCLUSIVE for the requested version, never substitute another
 * version, never attribute a controller that was not launched, and keep
 * identity evidence explicit about the fact nothing ran.
 */
function unavailableProvider(latest: BrowserVersion): BrowserProvider {
  return {
    async getLatest(_engine: EngineName): Promise<BrowserVersion> {
      return latest;
    },
    supportsHistoricalVersions: () => false,
    async install(
      _engine: EngineName,
      _version: string,
      _cacheDir: string,
    ): Promise<BrowserBinary> {
      throw new HistoricalUnavailableError(
        'no real historical binary exists for this version',
        'below-floor',
      );
    },
  };
}

test('unavailable historical binary yields inconclusive with a null controller', async () => {
  const scanner = new BrowserCompatibilityScanner(
    { urls: ['http://127.0.0.1/'], engines: ['chromium'], search: { strategy: 'latest' } },
    {
      provider: unavailableProvider({
        version: '130',
        executablePath: '/fake/latest',
        buildLabel: 'Fake 130',
        versionType: 'real-major',
      }),
    },
  );

  const result = await scanner.scan();

  assert.equal(result.results.length, 1);
  const check = result.results[0];
  assert.equal(check.verdict, 'inconclusive');
  assert.equal(check.version, '130');
  assert.equal(check.buildLabel, '(unavailable)');
  // No browser launched, so no controller drove this check — recording one
  // would fabricate evidence.
  assert.equal(check.controller, null);
  assert.equal(check.identity.verified, false);
  assert.equal(check.identity.mismatchReason, 'executable-identity-unparseable');
  assert.equal(check.reason, 'no real historical binary exists for this version');
  assert.equal(check.limitationNote, check.reason);
  assert.equal(check.signals.rendered, false);
  assert.equal(check.artifacts.screenshotPath, null);
});

test('unavailable revision-domain binary keeps the playwright-revision mismatch reason', async () => {
  const scanner = new BrowserCompatibilityScanner(
    { urls: ['http://127.0.0.1/'], engines: ['webkit'], search: { strategy: 'latest' } },
    {
      provider: unavailableProvider({
        version: '2150',
        executablePath: '/fake/webkit',
        buildLabel: 'Fake WebKit 2150',
        versionType: 'playwright-revision',
      }),
    },
  );

  const result = await scanner.scan();

  const check = result.results[0];
  assert.equal(check.verdict, 'inconclusive');
  assert.equal(check.versionType, 'playwright-revision');
  assert.equal(check.controller, null);
  // Revision domain never consults an on-disk identity; only the (absent)
  // runtime identity can be missing.
  assert.equal(check.identity.mismatchReason, 'runtime-identity-unavailable');
  assert.deepEqual(result.summaries[0].inconclusive, ['2150']);
});

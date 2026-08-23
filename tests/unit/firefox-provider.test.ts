import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { FirefoxProvider, firefoxArchiveUrls, geckodriverAssetUrl } from '../../src/browsers/firefox-provider.js';
import { HistoricalUnavailableError } from '../../src/browsers/types.js';
import { GECKODRIVER_ABSOLUTE_FLOOR } from '../../src/browsers/geckodriver-matrix.js';

test('firefoxArchiveUrls returns both bz2 and xz candidates in order', () => {
  const urls = firefoxArchiveUrls(102);
  assert.equal(urls.length, 2, 'must produce both format candidates');
  assert.equal(urls[0].ext, 'tar.bz2', 'bz2 tried first (older releases)');
  assert.equal(urls[1].ext, 'tar.xz', 'xz tried second (newer releases)');
  assert.equal(
    urls[0].archiveUrl,
    'https://archive.mozilla.org/pub/firefox/releases/102.0/linux-x86_64/en-US/firefox-102.0.tar.bz2',
  );
  assert.equal(
    urls[1].archiveUrl,
    'https://archive.mozilla.org/pub/firefox/releases/102.0/linux-x86_64/en-US/firefox-102.0.tar.xz',
  );
});

test('geckodriverAssetUrl never doubles the platform token (regression: linux-linux64)', () => {
  const { url, ext } = geckodriverAssetUrl('0.34.0');
  assert.match(
    url,
    /^https:\/\/github\.com\/mozilla\/geckodriver\/releases\/download\/v0\.34\.0\/geckodriver-v0\.34\.0-/,
  );
  // The old bug produced "-linux-linux64" on Linux x64. Assert no doubled os token.
  assert.doesNotMatch(url, /linux-linux|win-win|macos-macos/);
  assert.ok(ext === 'tar.gz' || ext === 'zip', 'unexpected archive extension');
});

test('geckodriverAssetUrl on this host produces the exact expected token', () => {
  // On the Linux x64 dev/CI host, the asset MUST be -linux64 (not -linux-linux64).
  const { url } = geckodriverAssetUrl('0.34.0');
  if (process.platform === 'linux' && process.arch === 'x64') {
    assert.ok(url.includes('geckodriver-v0.34.0-linux64.'), `expected -linux64 token, got: ${url}`);
  }
});

test('FirefoxProvider reports historical capability for firefox only', () => {
  const p = new FirefoxProvider();
  assert.equal(p.supportsHistoricalVersions('firefox'), true);
  assert.equal(p.supportsHistoricalVersions('chromium'), false);
  assert.equal(p.supportsHistoricalVersions('webkit'), false);
});

test('FirefoxProvider.install throws HistoricalUnavailableError below geckodriver floor', async () => {
  const p = new FirefoxProvider();
  // Force getLatest to a high version so the historical branch is taken for an
  // old major, without needing a real Playwright install.
  (p as unknown as { playwright: { getLatest: () => Promise<unknown> } }).playwright = {
    getLatest: async () => ({ version: '999', executablePath: '/x', buildLabel: 'Firefox 999', versionType: 'real-major' }),
  };
  const cache = mkdtempSync(path.join(tmpdir(), 'mrz-ff-'));
  const below = GECKODRIVER_ABSOLUTE_FLOOR - 1; // 51
  await assert.rejects(
    () => p.install('firefox', String(below), cache),
    (err: unknown) => {
      assert.ok(err instanceof HistoricalUnavailableError, 'must be HistoricalUnavailableError');
      assert.equal((err as HistoricalUnavailableError).code, 'below-floor');
      assert.match((err as Error).message, /not tested/);
      return true;
    },
  );
});

test('FirefoxProvider.install returns the Playwright build for latest-or-newer', async () => {
  const p = new FirefoxProvider();
  const fakeLatest = {
    executablePath: '/fake/firefox',
    buildLabel: 'Firefox 999',
    version: '999',
    versionType: 'real-major' as const,
  };
  (p as unknown as { playwright: { getLatest: () => Promise<typeof fakeLatest> } }).playwright = {
    getLatest: async () => fakeLatest,
  };
  const cache = mkdtempSync(path.join(tmpdir(), 'mrz-ff-latest-'));
  // Requesting the current version (or newer) uses the Playwright Juggler build.
  const binary = await p.install('firefox', '999', cache);
  assert.equal(binary.isPlaywrightBuild, true);
  assert.equal(binary.controller, 'playwright');
  assert.equal(binary.executablePath, '/fake/firefox');
  assert.equal(binary.limitationNote, null);
});

test('FirefoxProvider replaces a corrupt cached Firefox archive', async () => {
  const cache = mkdtempSync(path.join(tmpdir(), 'mrz-ff-corrupt-'));
  const archiveDir = path.join(cache, 'fixture');
  const firefoxDir = path.join(archiveDir, 'firefox');
  mkdirSync(firefoxDir, { recursive: true });
  writeFileSync(path.join(firefoxDir, 'firefox'), '#!/bin/sh\n');
  const validArchive = path.join(cache, 'valid.tar.bz2');
  const tar = spawnSync('tar', ['-cjf', validArchive, '-C', archiveDir, 'firefox']);
  assert.equal(tar.status, 0, tar.stderr.toString());

  const cachedArchive = path.join(cache, 'firefox', 'firefox-95.0.tar.bz2');
  mkdirSync(path.dirname(cachedArchive), { recursive: true });
  writeFileSync(cachedArchive, Buffer.from('interrupted download'));

  const originalFetch = globalThis.fetch;
  let downloads = 0;
  globalThis.fetch = async () => {
    downloads += 1;
    return new Response(readFileSync(validArchive), {
      status: 200,
      headers: { 'content-length': String(readFileSync(validArchive).byteLength) },
    });
  };

  try {
    const provider = new FirefoxProvider() as unknown as {
      downloadFirefox: (major: number, cacheDir: string) => Promise<{ executablePath: string }>;
    };
    const result = await provider.downloadFirefox(95, cache);
    assert.equal(downloads, 1, 'the corrupt cache entry must be downloaded again');
    assert.ok(result.executablePath.endsWith(path.join('firefox-95', 'firefox', 'firefox')));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('HistoricalUnavailableError is distinguishable from generic errors', () => {
  const e = new HistoricalUnavailableError('x', 'no-driver');
  assert.equal(e.name, 'HistoricalUnavailableError');
  assert.equal(e.code, 'no-driver');
  assert.ok(e instanceof Error);
  assert.ok(e instanceof HistoricalUnavailableError);
});

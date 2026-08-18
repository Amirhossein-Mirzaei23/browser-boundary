import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { ChromiumProvider } from '../../src/browsers/chromium-provider.js';
import { HistoricalUnavailableError } from '../../src/browsers/types.js';

/**
 * Stub globalThis.fetch so the snapshot discovery/existence checks are hermetic.
 * HEAD requests for `chrome-linux.zip` return a status based on `headStatus`
 * (default 404 = pruned). 200 = present, 403 = geo-blocked, 404 = pruned.
 */
type FetchImpl = typeof fetch;
const originalFetch: FetchImpl = globalThis.fetch;

function stubFetch(headStatus: Record<number, number>): void {
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (init?.method === 'HEAD') {
      const m = url.match(/\/(\d+)\/chrome-linux\.zip$/);
      const rev = m ? Number(m[1]) : -1;
      return new Response(null, { status: headStatus[rev] ?? 404 });
    }
    return new Response('not found', { status: 404 });
  }) as FetchImpl;
}

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

test('REGRESSION: ChromiumProvider.install uses a cached historical binary without probing the network', async () => {
  const c = new ChromiumProvider();
  (c as unknown as { playwright: { getLatest: () => Promise<unknown> } }).playwright = {
    getLatest: async () => ({ version: '999', executablePath: '/x', buildLabel: 'Chrome 999', versionType: 'real-major' }),
  };
  const cache = mkdtempSync(path.join(tmpdir(), 'mrz-chromium-cached-'));
  const exe = path.join(cache, 'snapshots', 'chromium-89-776874', 'chrome-linux', 'chrome');
  mkdirSync(path.dirname(exe), { recursive: true });
  writeFileSync(exe, '');
  writeFileSync(
    path.join(cache, 'chromium-89-mrz-installed.json'),
    JSON.stringify({ executablePath: exe, buildLabel: 'Chromium 89 (snapshot r776874)' }),
  );

  let fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls++;
    return new Response(null, { status: 403 });
  }) as FetchImpl;
  try {
    const binary = await c.install('chromium', '89', cache);
    assert.equal(binary.executablePath, exe);
    assert.equal(binary.buildLabel, 'Chromium 89 (snapshot r776874)');
    assert.equal(binary.isPlaywrightBuild, false);
    assert.equal(fetchCalls, 0, 'a valid cache hit must not require snapshot-bucket access');
  } finally {
    globalThis.fetch = originalFetch;
  }
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

/**
 * Fallback behavior: the snapshot bucket prunes old builds, so a curated
 * revision can 404 while nearby revisions (same milestone window) are still
 * present. The provider must fall back to the nearest available revision and
 * report it honestly in the build label. If NONE is available, it throws
 * HistoricalUnavailableError (INCONCLUSIVE) — never a cross-milestone
 * substitution.
 */

test('downloadChromiumSnapshot uses the curated revision when it still exists (no fallback)', async () => {
  const c = new ChromiumProvider();
  // Curated revision 1014680 (Chrome 111) is present in the bucket.
  stubFetch({ 1014680: 200 });
  try {
    const cache = mkdtempSync(path.join(tmpdir(), 'mrz-chromium-curated-'));
    // Pre-create the executable at the curated revision's path so the download
    // branch is skipped — we are testing revision SELECTION, not extraction.
    const exe = path.join(cache, 'snapshots', 'chromium-111-1014680', 'chrome-linux', 'chrome');
    mkdirSync(path.dirname(exe), { recursive: true });
    writeFileSync(exe, '');

    const result = await (c as unknown as { downloadChromiumSnapshot: (m: number, d: string) => Promise<{ buildLabel: string }> }).downloadChromiumSnapshot(111, cache);
    assert.match(result.buildLabel, /r1014680/);
    assert.doesNotMatch(result.buildLabel, /nearest/, 'curated build label must not mention "nearest"');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('downloadChromiumSnapshot falls back to the nearest available revision when curated is pruned', async () => {
  const c = new ChromiumProvider();
  // Curated 1014680 is pruned (404); r+2=1014682 is the first present revision.
  stubFetch({ 1014682: 200 });
  try {
    const cache = mkdtempSync(path.join(tmpdir(), 'mrz-chromium-fallback-'));
    // Pre-create the executable at the FALLBACK revision's path.
    const exe = path.join(cache, 'snapshots', 'chromium-111-1014682', 'chrome-linux', 'chrome');
    mkdirSync(path.dirname(exe), { recursive: true });
    writeFileSync(exe, '');

    const result = await (c as unknown as { downloadChromiumSnapshot: (m: number, d: string) => Promise<{ buildLabel: string }> }).downloadChromiumSnapshot(111, cache);
    assert.match(result.buildLabel, /r1014682/);
    assert.match(result.buildLabel, /nearest to curated r1014680/, 'must honestly report it is a fallback');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('downloadChromiumSnapshot throws HistoricalUnavailableError when no nearby revision is available', async () => {
  const c = new ChromiumProvider();
  // Everything is pruned (404) — no curated, no nearby.
  stubFetch({});
  try {
    const cache = mkdtempSync(path.join(tmpdir(), 'mrz-chromium-nofallback-'));
    await assert.rejects(
      () => (c as unknown as { downloadChromiumSnapshot: (m: number, d: string) => Promise<unknown> }).downloadChromiumSnapshot(111, cache),
      (err: unknown) => {
        assert.ok(err instanceof HistoricalUnavailableError);
        assert.equal((err as HistoricalUnavailableError).code, 'download-failed');
        assert.match((err as Error).message, /no longer on the bucket/);
        assert.match((err as Error).message, /not tested/);
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('downloadChromiumSnapshot throws HistoricalUnavailableError immediately on geo-block (no probing)', async () => {
  const c = new ChromiumProvider();
  // The bucket returns 403 for every probe — a geo-block.
  stubFetch({ 1014680: 403 });
  let headCalls = 0;
  const wrapped = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    if (init?.method === 'HEAD') headCalls++;
    return wrapped(input, init);
  }) as FetchImpl;
  try {
    const cache = mkdtempSync(path.join(tmpdir(), 'mrz-chromium-geoblock-'));
    await assert.rejects(
      () => (c as unknown as { downloadChromiumSnapshot: (m: number, d: string) => Promise<unknown> }).downloadChromiumSnapshot(111, cache),
      (err: unknown) => {
        assert.ok(err instanceof HistoricalUnavailableError);
        assert.equal((err as HistoricalUnavailableError).code, 'download-failed');
        assert.match(
          (err as Error).message,
          /^\(Use a VPN\) Chromium snapshot downloads are unavailable in your location/,
        );
        return true;
      },
    );
    assert.equal(headCalls, 1, 'must not probe further after a geo-block');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

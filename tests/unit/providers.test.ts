import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FirefoxProvider } from '../../src/browsers/firefox-provider.js';
import { WebKitProvider } from '../../src/browsers/webkit-provider.js';
import { ChromiumProvider } from '../../src/browsers/chromium-provider.js';
import { DefaultBrowserProvider } from '../../src/browsers/provider.js';

/**
 * Provider capability honesty:
 *  - Chromium: claims historical support (Chrome-for-Testing is CDP-native)
 *  - Firefox: does NOT claim historical support (vanilla builds lack Juggler)
 *  - WebKit: does NOT claim historical support (no drivable historical Safari)
 *
 * This encodes the empirical finding from the Tabdeal scan, where Firefox
 * historical binaries launched then immediately exited (no Juggler patch).
 */
test('Chromium is the ONLY engine that claims historical support', () => {
  const p = new DefaultBrowserProvider();
  assert.equal(p.supportsHistoricalVersions('chromium'), true);
  assert.equal(p.supportsHistoricalVersions('firefox'), false, 'Firefox cannot do historical via Playwright');
  assert.equal(p.supportsHistoricalVersions('webkit'), false, 'WebKit cannot do historical via Playwright');
});

test('FirefoxProvider does not claim historical support', () => {
  const f = new FirefoxProvider();
  assert.equal(f.supportsHistoricalVersions('firefox'), false);
});

test('ChromiumProvider claims historical support', () => {
  const c = new ChromiumProvider();
  assert.equal(c.supportsHistoricalVersions('chromium'), true);
  assert.equal(c.supportsHistoricalVersions('firefox'), false);
});

test('WebKitProvider does not claim historical support', () => {
  const w = new WebKitProvider();
  assert.equal(w.supportsHistoricalVersions('webkit'), false);
});

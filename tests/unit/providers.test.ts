import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FirefoxProvider } from '../../src/browsers/firefox-provider.js';
import { WebKitProvider } from '../../src/browsers/webkit-provider.js';
import { ChromiumProvider } from '../../src/browsers/chromium-provider.js';
import { DefaultBrowserProvider } from '../../src/browsers/provider.js';

/**
 * Provider capability honesty:
 *  - Chromium: claims historical support (Chrome-for-Testing, driven by Playwright/CDP)
 *  - Firefox:  claims historical support (archive.mozilla.org, driven by geckodriver/WebDriver)
 *  - WebKit:   does NOT claim historical support (no drivable historical Safari off macOS)
 *
 * Firefox historical binaries are NOT driven by Playwright (vanilla builds lack
 * the Juggler patch); they are driven by geckodriver via Marionette instead.
 */
test('Chromium and Firefox claim historical support; WebKit does not', () => {
  const p = new DefaultBrowserProvider();
  assert.equal(p.supportsHistoricalVersions('chromium'), true);
  assert.equal(p.supportsHistoricalVersions('firefox'), true, 'Firefox supports historical via geckodriver');
  assert.equal(p.supportsHistoricalVersions('webkit'), false, 'WebKit cannot do historical off macOS');
});

test('FirefoxProvider claims historical support for firefox only', () => {
  const f = new FirefoxProvider();
  assert.equal(f.supportsHistoricalVersions('firefox'), true);
  assert.equal(f.supportsHistoricalVersions('chromium'), false);
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

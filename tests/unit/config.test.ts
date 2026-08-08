import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveConfig, resolvePageReadiness, ConfigError, toRegExp } from '../../src/config/resolve.js';

test('resolveConfig applies defaults', () => {
  const cfg = resolveConfig({ urls: ['https://example.com'] });
  assert.deepEqual(cfg.engines, ['chromium', 'firefox', 'webkit']);
  assert.equal(cfg.timeout, 30000);
  assert.equal(cfg.strategy, 'binary');
  assert.equal(cfg.siteName, 'https://example.com');
});

test('resolveConfig rejects missing urls', () => {
  assert.throws(() => resolveConfig({ urls: [] }), ConfigError);
});

test('resolveConfig rejects non-http(s) urls', () => {
  assert.throws(() => resolveConfig({ urls: ['file:///x'] }), ConfigError);
});

test('toRegExp escapes literal strings and is case-insensitive', () => {
  const re = toRegExp('google-analytics.com');
  assert.match('https://Google-Analytics.com/x', re);
  // '.' must be escaped (not a wildcard)
  assert.doesNotMatch('https://google-analyticsXcom/x', re);
});

test('resolvePageReadiness: bare URL with default readiness uses default', () => {
  const cfg = resolveConfig({ urls: ['https://x.com'], readiness: { selectors: ['main'] } });
  const p = resolvePageReadiness(cfg.pages[0], cfg);
  assert.equal(p.readiness.kind, 'selectors');
  if (p.readiness.kind === 'selectors') {
    assert.deepEqual(p.readiness.selectors, ['main']);
    assert.equal(p.readiness.mode, 'any');
  }
});

test('resolvePageReadiness: per-URL function readiness', () => {
  const cfg = resolveConfig({
    urls: [{ url: 'https://x.com', readiness: async () => true }],
  });
  const p = resolvePageReadiness(cfg.pages[0], cfg);
  assert.equal(p.readiness.kind, 'function');
});

test('resolvePageReadiness: no readiness anywhere → none', () => {
  const cfg = resolveConfig({ urls: ['https://x.com'] });
  const p = resolvePageReadiness(cfg.pages[0], cfg);
  assert.equal(p.readiness.kind, 'none');
});

test('floor defaults merge with overrides', () => {
  const cfg = resolveConfig({ urls: ['https://x.com'], search: { floor: { chromium: 90 } } });
  assert.equal(cfg.floor.chromium, 90);
  assert.equal(cfg.floor.firefox, 60); // default retained
});

test('strategy latest is valid', () => {
  const cfg = resolveConfig({ urls: ['https://x.com'], search: { strategy: 'latest' } });
  assert.equal(cfg.strategy, 'latest');
});

test('unknown strategy throws', () => {
  // @ts-expect-error invalid strategy
  assert.throws(() => resolveConfig({ urls: ['https://x.com'], search: { strategy: 'bogus' } }), ConfigError);
});

test('waitUntil defaults to domcontentloaded', () => {
  const cfg = resolveConfig({ urls: ['https://x.com'] });
  assert.equal(cfg.waitUntil, 'domcontentloaded');
});

test('waitUntil: load is honored when set', () => {
  const cfg = resolveConfig({ urls: ['https://x.com'], waitUntil: 'load' });
  assert.equal(cfg.waitUntil, 'load');
});

test('HTTP cache is DISABLED by default (correctness)', () => {
  const cfg = resolveConfig({ urls: ['https://x.com'] });
  assert.equal(cfg.disableHttpCache, true);
});

test('disableHttpCache: false can be opted back in', () => {
  const cfg = resolveConfig({ urls: ['https://x.com'], disableHttpCache: false });
  assert.equal(cfg.disableHttpCache, false);
});

test('holdOpenSec defaults to 0 (no delay)', () => {
  const cfg = resolveConfig({ urls: ['https://x.com'] });
  assert.equal(cfg.holdOpenSec, 0);
});

test('holdOpenSec is honored when set (seconds)', () => {
  const cfg = resolveConfig({ urls: ['https://x.com'], holdOpenSec: 5 });
  assert.equal(cfg.holdOpenSec, 5);
});

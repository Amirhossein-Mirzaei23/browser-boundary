import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeScanScope, scopeFingerprint } from '../../src/baseline/normalize.js';
import type { ResolvedConfig } from '../../src/config/resolve.js';
import { resolveConfig } from '../../src/config/resolve.js';

function config(overrides: Record<string, unknown> = {}): ResolvedConfig {
  return resolveConfig({
    urls: ['http://127.0.0.1:4317/'],
    engines: ['chromium'],
    headed: false,
    ...overrides,
  } as never);
}

function fp(cfg: ResolvedConfig): string {
  return scopeFingerprint(normalizeScanScope(cfg));
}

test('semantically equivalent configs produce the same fingerprint regardless of key order', () => {
  const a = config();
  const b = config();
  // Rebuild a with differently-ordered object literals that mean the same thing.
  const c = resolveConfig({
    engines: ['chromium'],
    urls: ['http://127.0.0.1:4317/'],
    headed: false,
  } as never);
  assert.equal(fp(a), fp(b));
  assert.equal(fp(a), fp(c));
});

test('URL order follows a documented stable policy (sorted by label, then url)', () => {
  const a = resolveConfig({ urls: ['http://x.test/a', 'http://x.test/b'], headed: false } as never);
  const b = resolveConfig({ urls: ['http://x.test/b', 'http://x.test/a'], headed: false } as never);
  assert.equal(fp(a), fp(b));
  const scopeA = normalizeScanScope(a);
  assert.deepEqual(scopeA.routes.map((r) => r.url), ['http://x.test/a', 'http://x.test/b']);
});

test('changed URL, readiness, checks, controller, confidence, and floor each change the fingerprint', () => {
  const base = fp(config());
  assert.notEqual(fp(resolveConfig({ urls: ['http://other.test/'], headed: false } as never)), base);
  assert.notEqual(fp(resolveConfig({ urls: ['http://127.0.0.1:4317/'], readiness: { selectors: ['#app'], mode: 'all' }, headed: false } as never)), base);
  assert.notEqual(fp(resolveConfig({ urls: ['http://127.0.0.1:4317/'], checks: { console: false }, headed: false } as never)), base);
  assert.notEqual(fp(resolveConfig({ urls: ['http://127.0.0.1:4317/'], chromiumController: 'webdriver', headed: false } as never)), base);
  assert.notEqual(fp(resolveConfig({ urls: ['http://127.0.0.1:4317/'], analysis: { minConfidence: 'high' }, headed: false } as never)), base);
  assert.notEqual(fp(resolveConfig({ urls: ['http://127.0.0.1:4317/'], search: { floor: { chromium: 90 } }, headed: false } as never)), base);
});

test('output/cache directories, executable paths, timestamps, and artifacts do not change the fingerprint', () => {
  const base = fp(config());
  assert.equal(
    fp(resolveConfig({ urls: ['http://127.0.0.1:4317/'], engines: ['chromium'], output: { directory: '/elsewhere' }, cache: { directory: '/other-cache' }, headed: false } as never)),
    base,
  );
});

test('regular-expression patterns normalize deterministically', () => {
  const base = fp(config());
  const a = fp(resolveConfig({ urls: ['http://127.0.0.1:4317/'], network: { ignoredPatterns: [/analytics\.example\.com/] }, headed: false } as never));
  const b = fp(resolveConfig({ urls: ['http://127.0.0.1:4317/'], network: { ignoredPatterns: [/analytics\.example\.com/] }, headed: false } as never));
  assert.equal(a, b);
  assert.notEqual(a, base);
});

test('function readiness is marked non-portable instead of serialized from source text', () => {
  const fnA = async () => true;
  const fnB = async () => true;
  const a = resolveConfig({ urls: [{ url: 'http://127.0.0.1:4317/', readiness: fnA }], headed: false } as never);
  const b = resolveConfig({ urls: [{ url: 'http://127.0.0.1:4317/', readiness: fnB }], headed: false } as never);
  const scopeA = normalizeScanScope(a);
  assert.equal(scopeA.routes[0].readiness.kind, 'non-portable-function');
  assert.ok(scopeA.nonPortable.some((n) => /readiness function/i.test(n)));
  // Same site shape → same fingerprint; different functions with identical shape do not drift.
  assert.equal(fp(a), fp(b));
});

test('fingerprint is a sha256 hex digest of the canonical scope', () => {
  const scope = normalizeScanScope(config());
  assert.match(scopeFingerprint(scope), /^[0-9a-f]{64}$/);
});

test('engines are sorted canonically', () => {
  const scope = normalizeScanScope(resolveConfig({ urls: ['http://x/'], engines: ['webkit', 'chromium', 'firefox'], headed: false } as never));
  assert.deepEqual(scope.engines, ['chromium', 'firefox', 'webkit']);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCli, HELP } from '../../src/cli/options.js';
import { QUICK_LABEL, quickNextActions } from '../../src/cli/quick.js';

test('quick resolves to chromium-only, latest strategy, headless, one URL', () => {
  const parsed = parseCli(['quick', 'http://example.com/']);
  assert.equal(parsed.command, 'quick');
  assert.deepEqual(parsed.config.urls, ['http://example.com/']);
  assert.deepEqual(parsed.config.engines, ['chromium']);
  assert.equal(parsed.config.search?.strategy, 'latest');
  assert.equal(parsed.config.headed, false);
});

test('quick requires a URL', () => {
  assert.throws(() => parseCli(['quick']), /URL/);
});

test('quick is Chromium-only and rejects other engines', () => {
  assert.throws(() => parseCli(['quick', 'http://example.com/', '--engines', 'firefox']), /chromium/i);
});

test('quick cannot be combined with --versions or --strategy', () => {
  assert.throws(() => parseCli(['quick', 'http://example.com/', '--versions', '120']), /quick/i);
  assert.throws(() => parseCli(['quick', 'http://example.com/', '--strategy', 'binary']), /quick/i);
});

test('quick accepts only one URL and rejects --pages', () => {
  assert.throws(() => parseCli(['quick', 'http://example.com/', '--pages', '/about']), /quick/i);
});

test('help documents the quick command', () => {
  assert.match(HELP, /quick <url>/);
});

test('quick output is labeled as a current-browser proof, not boundary discovery', () => {
  const source = readFileSync(new URL('../../src/cli/index.ts', import.meta.url), 'utf8');
  assert.ok(source.includes('QUICK_LABEL'));
  assert.ok(source.includes('quickNextActions('));
  assert.match(QUICK_LABEL, /CURRENT-BROWSER PROOF — not historical boundary discovery/);
});

test('quick prints next actions for exact historical verification and full discovery', () => {
  const url = 'http://example.com/';
  const actions = quickNextActions(url);
  assert.equal(actions.length, 2);
  assert.match(actions[0], /--versions/);
  assert.match(actions[0], new RegExp(url.replace(/\//g, '\\/')));
  assert.match(actions[1], /browser-boundary/);
  assert.doesNotMatch(actions[1], /--versions/);
  // The next actions must never call the quick result a boundary (ignore the
  // literal command name, which contains the package name).
  const prose = actions.join(' ').replace(/browser-boundary/g, '');
  assert.ok(!prose.toLowerCase().includes('boundary'));
});

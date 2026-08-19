import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCli } from '../../src/cli/options.js';
import { ConfigError } from '../../src/config/resolve.js';

const URL = 'https://example.com';

test('--versions accepts one exact major and selects explicit search', () => {
  const parsed = parseCli([URL, '--engines', 'chromium', '--versions', '120'], {});
  assert.equal(parsed.config.search?.strategy, 'explicit');
  assert.deepEqual(parsed.config.search?.explicitVersions, { chromium: ['120'] });
});

test('--versions supports the singular --exact-version alias', () => {
  const parsed = parseCli([URL, '--engines', 'chromium', '--exact-version', '120'], {});
  assert.deepEqual(parsed.config.search?.explicitVersions, { chromium: ['120'] });
});

test('--versions accepts a comma-separated list and removes duplicates', () => {
  const parsed = parseCli([URL, '--engines', 'firefox', '--versions', '120,115,120'], {});
  assert.deepEqual(parsed.config.search?.explicitVersions, { firefox: ['120', '115'] });
});

test('--versions requires an explicit --engines flag', () => {
  assert.throws(
    () => parseCli([URL, '--versions', '120'], {}),
    (err: unknown) => err instanceof ConfigError && /--versions requires --engines/.test(err.message),
  );
});

test('--versions allows exactly one engine', () => {
  assert.throws(
    () => parseCli([URL, '--engines', 'chromium,firefox', '--versions', '120'], {}),
    (err: unknown) => err instanceof ConfigError && /exactly one engine/.test(err.message),
  );
});

test('--versions rejects malformed majors with valid-range guidance', () => {
  assert.throws(
    () => parseCli([URL, '--engines', 'chromium', '--versions', '120.1,nope'], {}),
    (err: unknown) => err instanceof ConfigError && /whole major versions/.test(err.message) && /Chromium: 67/.test(err.message),
  );
});

test('--versions rejects unsupported engines with useful guidance', () => {
  assert.throws(
    () => parseCli([URL, '--engines', 'webkit', '--versions', '17'], {}),
    (err: unknown) => err instanceof ConfigError && /WebKit.*current build only/.test(err.message),
  );
});

test('--versions rejects versions below the engine floor', () => {
  assert.throws(
    () => parseCli([URL, '--engines', 'firefox', '--versions', '51'], {}),
    (err: unknown) => err instanceof ConfigError && /Firefox versions must be in the supported range 52/.test(err.message),
  );
});

test('--versions accepts Chromium 67 as the supported floor', () => {
  const parsed = parseCli(['https://www.whatsmybrowser.org/', '--engines', 'chromium', '--versions', '67'], {});
  assert.deepEqual(parsed.config.search?.explicitVersions, { chromium: ['67'] });
});

test('--versions cannot be combined with another strategy', () => {
  assert.throws(
    () => parseCli([URL, '--engines', 'chromium', '--versions', '120', '--strategy', 'binary'], {}),
    (err: unknown) => err instanceof ConfigError && /cannot be combined/.test(err.message),
  );
});

test('--engines rejects unknown engine names', () => {
  assert.throws(
    () => parseCli([URL, '--engines', 'chrome'], {}),
    (err: unknown) => err instanceof ConfigError && /Unknown engine "chrome"/.test(err.message),
  );
});

test('--chromium-controller selects the Chromium controller policy', () => {
  const parsed = parseCli([URL, '--engines', 'chromium', '--chromium-controller', 'webdriver'], {});
  assert.equal(parsed.config.chromiumController, 'webdriver');
});

test('MRZ_CHROMIUM_CONTROLLER configures the Chromium controller policy', () => {
  const parsed = parseCli([URL, '--engines', 'chromium'], { MRZ_CHROMIUM_CONTROLLER: 'playwright' });
  assert.equal(parsed.config.chromiumController, 'playwright');
});

test('--chromium-controller rejects unknown policies', () => {
  assert.throws(
    () => parseCli([URL, '--engines', 'chromium', '--chromium-controller', 'puppeteer'], {}),
    (err: unknown) => err instanceof ConfigError && /auto, playwright, webdriver/.test(err.message),
  );
});

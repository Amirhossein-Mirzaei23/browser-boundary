import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseCli } from '../../src/cli/options.js';
import { ConfigError } from '../../src/config/resolve.js';

const URL = 'https://example.com';

test('--config loads a JSON ScanConfig when no positional URL is provided', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'browser-boundary-config-'));
  const configPath = path.join(dir, 'scan.json');
  writeFileSync(configPath, JSON.stringify({
    urls: [URL],
    engines: ['firefox'],
    search: { strategy: 'latest' },
    headed: false,
    output: { directory: '/tmp/browser-boundary-config-report', format: ['json'] },
  }));

  const parsed = parseCli(['--config', configPath], {});
  assert.deepEqual(parsed.config.urls, [URL]);
  assert.deepEqual(parsed.config.engines, ['firefox']);
  assert.equal(parsed.config.search?.strategy, 'latest');
  assert.equal(parsed.config.headed, false);
  assert.deepEqual(parsed.config.output, {
    directory: '/tmp/browser-boundary-config-report',
    format: ['json'],
  });
});

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

test('--versions rejects an explicitly empty value', () => {
  assert.throws(
    () => parseCli([URL, '--engines', 'chromium', '--versions', ''], {}),
    (err: unknown) => err instanceof ConfigError && /whole major versions/.test(err.message),
  );
});

test('--exact-version rejects an explicitly empty value', () => {
  assert.throws(
    () => parseCli([URL, '--engines', 'chromium', '--exact-version', ''], {}),
    (err: unknown) => err instanceof ConfigError && /whole major versions/.test(err.message),
  );
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

for (const value of ['', ',', 'chromium,']) {
  test(`--engines rejects empty list items in ${JSON.stringify(value)}`, () => {
    assert.throws(
      () => parseCli([URL, '--engines', value], {}),
      (err: unknown) => err instanceof ConfigError && /must not contain empty values/.test(err.message),
    );
  });
}

for (const [flag, configPath] of [
  ['--timeout', 'timeout'],
  ['--step-size', 'search.stepSize'],
  ['--hold-open', 'holdOpenSec'],
] as const) {
  for (const value of ['0', 'nope', 'Infinity']) {
    test(`${flag} rejects ${value}`, () => {
      assert.throws(
        () => parseCli([URL, flag, value], {}),
        (err: unknown) =>
          err instanceof ConfigError && err.message.includes(flag) && /finite number greater than 0/.test(err.message),
      );
    });
  }

  test(`${flag} accepts a positive finite number`, () => {
    const parsed = parseCli([URL, flag, '12'], {});
    const actual = configPath === 'timeout'
      ? parsed.config.timeout
      : configPath === 'holdOpenSec'
        ? parsed.config.holdOpenSec
        : parsed.config.search?.stepSize;
    assert.equal(actual, 12);
  });
}

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

test('quick parses to Chromium-only, latest strategy, headless, one URL (cli-options contract)', () => {
  const parsed = parseCli(['quick', URL]);
  assert.equal(parsed.command, 'quick');
  assert.equal(parsed.url, URL);
  assert.deepEqual(parsed.config.urls, [URL]);
  assert.deepEqual(parsed.config.engines, ['chromium']);
  assert.equal(parsed.config.search?.strategy, 'latest');
  assert.equal(parsed.config.headed, false);
  assert.equal(parsed.config.quick, true);
});

test('--pages joins relative paths onto the positional base URL', () => {
  const parsed = parseCli([URL, '--pages', '/,/about']);
  assert.deepEqual(parsed.config.urls, [URL, `${URL}/`, `${URL}/about`]);
});

test('--pages requires a base URL', () => {
  assert.throws(
    () => parseCli(['--pages', '/about'], {}),
    (err: unknown) => err instanceof ConfigError && /--pages requires/.test(err.message),
  );
});

test('--pages uses the first config URL as its base and appends to configured URLs', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'browser-boundary-config-pages-'));
  const configPath = path.join(dir, 'scan.json');
  writeFileSync(configPath, JSON.stringify({ urls: [URL] }));

  const parsed = parseCli(['--config', configPath, '--pages', '/about'], {});
  assert.deepEqual(parsed.config.urls, [URL, `${URL}/about`]);
});

for (const [name, args] of [
  ['unknown --wait-until', [URL, '--wait-until', 'nope']],
  ['unknown --format', [URL, '--format', 'xml']],
  ['empty --format', [URL, '--format=']],
  ['unknown --readiness-mode', [URL, '--readiness-selector', 'body', '--readiness-mode', 'nope']],
  ['--readiness-mode without a selector', [URL, '--readiness-mode', 'all']],
  ['unknown --min-confidence', [URL, '--min-confidence', 'nope']],
  ['empty --pages', [URL, '--pages=']],
  ['extra positional', [URL, 'garbage']],
  ['second URL', [URL, 'https://example.org']],
  ['quick with a second URL', ['quick', URL, 'https://example.org']],
  ['install with an argument', ['install', 'garbage']],
  ['both version aliases', [URL, '--engines', 'chromium', '--versions', '120', '--exact-version', '119']],
] as const) {
  test(`rejects ${name}`, () => {
    assert.throws(() => parseCli([...args], {}), ConfigError);
  });
}

test('legacy BC_ aliases match their MRZ_ equivalents', () => {
  const parsed = parseCli([URL], {
    BC_STRATEGY: 'latest',
    BC_FORMAT: 'json',
    BC_MIN_CONFIDENCE: 'high',
    BC_WAIT_UNTIL: 'load',
    BC_HTTP_CACHE: '1',
    BC_HOLD_OPEN: '3',
  });
  assert.equal(parsed.config.search?.strategy, 'latest');
  assert.deepEqual(parsed.config.output?.format, ['json']);
  assert.equal(parsed.config.analysis?.minConfidence, 'high');
  assert.equal(parsed.config.waitUntil, 'load');
  assert.equal(parsed.config.disableHttpCache, false);
  assert.equal(parsed.config.holdOpenSec, 3);
});

test('--config reports unreadable or invalid JSON as a configuration error', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'browser-boundary-config-'));
  const bad = path.join(dir, 'bad.json');
  writeFileSync(bad, '{not json');
  assert.throws(
    () => parseCli(['--config', bad], {}),
    (err: unknown) => err instanceof ConfigError && /Could not load config file/.test(err.message),
  );
});

test('flags take precedence over MRZ_ env variables', () => {
  const parsed = parseCli(
    [URL, '--engines', 'chromium', '--timeout', '15000'],
    { MRZ_ENGINES: 'firefox', MRZ_TIMEOUT_MS: '9999' },
  );
  assert.deepEqual(parsed.config.engines, ['chromium']);
  assert.equal(parsed.config.timeout, 15000);
});

test('MRZ_ env variables fill in when flags are absent', () => {
  const parsed = parseCli([URL], { MRZ_ENGINES: 'firefox', MRZ_TIMEOUT_MS: '7777' });
  assert.deepEqual(parsed.config.engines, ['firefox']);
  assert.equal(parsed.config.timeout, 7777);
});

for (const [name, args] of [
  ['--timeout 0', [URL, '--timeout', '0']],
  ["--engines ''", [URL, '--engines', '']],
  ["--versions ''", [URL, '--engines', 'chromium', '--versions', '']],
] as const) {
  test(`CLI classifies ${name} as a configuration error`, () => {
    const result = spawnSync(
      process.execPath,
      ['--import', 'tsx', 'src/cli/index.ts', ...args],
      { cwd: process.cwd(), encoding: 'utf8', timeout: 15_000 },
    );

    assert.equal(result.status, 2, result.stdout + result.stderr);
    assert.match(result.stderr, /Configuration error:/);
  });
}

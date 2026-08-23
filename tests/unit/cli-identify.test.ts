import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { parseCli } from '../../src/cli/options.js';
import { ConfigError } from '../../src/config/resolve.js';

const WEBVIEW_UA = 'Mozilla/5.0 (Linux; Android 10; K; wv) AppleWebKit/537.36 Version/4.0 Chrome/140.0.0.0 Mobile Safari/537.36';

test('identify parses a required User-Agent and JSON format', () => {
  const parsed = parseCli(['identify', '--user-agent', WEBVIEW_UA, '--format', 'json'], {});
  assert.equal(parsed.command, 'identify');
  assert.equal(parsed.userAgent, WEBVIEW_UA);
  assert.equal(parsed.identifyFormat, 'json');
  assert.deepEqual(parsed.config, {});
});

test('identify requires a User-Agent', () => {
  assert.throws(
    () => parseCli(['identify'], {}),
    (error: unknown) => error instanceof ConfigError && /--user-agent is required/.test(error.message),
  );
});

test('identify rejects scan options that would otherwise be ignored', () => {
  assert.throws(
    () => parseCli(['identify', '--user-agent', WEBVIEW_UA, '--engines', 'chromium'], {}),
    (error: unknown) => error instanceof ConfigError && /cannot be combined.*--engines/i.test(error.message),
  );
});

for (const [flag, value] of [
  ['--step-size', '5'],
  ['--base-url', 'https://example.com'],
  ['--config', 'browser-boundary.json'],
  ['--timeout', '1000'],
  ['--output', './reports'],
] as const) {
  test(`identify rejects scan-only ${flag}`, () => {
    assert.throws(
      () => parseCli(['identify', '--user-agent', WEBVIEW_UA, flag, value], {}),
      (error: unknown) => error instanceof ConfigError && error.message.includes(flag),
    );
  });
}

test('identify rejects a scan URL that would otherwise be ignored', () => {
  assert.throws(
    () => parseCli(['identify', 'https://example.com', '--user-agent', WEBVIEW_UA], {}),
    (error: unknown) => error instanceof ConfigError && /cannot be combined.*URL/i.test(error.message),
  );
});

test('identify rejects extra positional arguments', () => {
  assert.throws(
    () => parseCli(['identify', 'extra', '--user-agent', WEBVIEW_UA], {}),
    (error: unknown) => error instanceof ConfigError && /unexpected positional/i.test(error.message),
  );
});

test('identify rejects unknown output formats', () => {
  assert.throws(
    () => parseCli(['identify', '--user-agent', WEBVIEW_UA, '--format', 'markdown'], {}),
    (error: unknown) => error instanceof ConfigError && /text or json/.test(error.message),
  );
});

test('identify prints a JSON Android WebView profile without launching a browser', () => {
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', 'src/cli/index.ts', 'identify', '--user-agent', WEBVIEW_UA, '--format', 'json'],
    { cwd: process.cwd(), encoding: 'utf8', timeout: 15_000 },
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const profile = JSON.parse(result.stdout) as { runtime: string; renderingEngine: string; runtimeVersion: { major: number } };
  assert.equal(profile.runtime, 'android-webview');
  assert.equal(profile.renderingEngine, 'blink');
  assert.equal(profile.runtimeVersion.major, 140);
});

test('identify text output explains evidence and compatibility limitations', () => {
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', 'src/cli/index.ts', 'identify', '--user-agent', WEBVIEW_UA],
    { cwd: process.cwd(), encoding: 'utf8', timeout: 15_000 },
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /Runtime: android-webview/);
  assert.match(result.stdout, /Rendering engine: blink/);
  assert.match(result.stdout, /Evidence: .*wv-marker/);
  assert.match(result.stdout, /does not guarantee Android WebView runtime compatibility/i);
});

test('identify reports an unknown runtime for Android Chrome and exits successfully', () => {
  const chromeUa = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 Chrome/140.0.0.0 Mobile Safari/537.36';
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', 'src/cli/index.ts', 'identify', '--user-agent', chromeUa, '--format', 'json'],
    { cwd: process.cwd(), encoding: 'utf8', timeout: 15_000 },
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const detection = JSON.parse(result.stdout) as { runtime: string; isAndroidWebView: boolean };
  assert.equal(detection.runtime, 'unknown');
  assert.equal(detection.isAndroidWebView, false);
});

test('--engines android-webview explains that WebView is a runtime target', () => {
  assert.throws(
    () => parseCli(['https://example.com', '--engines', 'android-webview'], {}),
    (error: unknown) => error instanceof ConfigError && /runtime target.*not.*engine/i.test(error.message),
  );
});

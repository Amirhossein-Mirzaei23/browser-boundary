import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createAndroidWebViewProfile,
  detectAndroidWebView,
  evaluateAndroidWebViewCapability,
  evaluateAndroidWebViewFeature,
  normalizeRuntimeVersion,
  scan,
  WEBVIEW_CAPABILITIES,
} from '../../src/index.js';
import type {
  AndroidWebViewProfile,
  RenderingEngineName,
  RuntimeTargetName,
  ScanConfig,
} from '../../src/index.js';

test('package root exports the additive Android WebView API', () => {
  const target: RuntimeTargetName = 'android-webview';
  const engine: RenderingEngineName = 'blink';
  const detection = detectAndroidWebView(
    'Mozilla/5.0 (Linux; Android 10; K; wv) AppleWebKit/537.36 Version/4.0 Chrome/140.0.0.0 Mobile Safari/537.36',
  );
  const profile: AndroidWebViewProfile = createAndroidWebViewProfile({ explicitVersion: '140' });
  assert.equal(target, 'android-webview');
  assert.equal(engine, 'blink');
  assert.equal(detection.isAndroidWebView, true);
  assert.equal(normalizeRuntimeVersion('140', 'explicit').major, 140);
  assert.equal(evaluateAndroidWebViewFeature(profile, 'Optional chaining (?.)').status, 'engine-compatible');
  assert.equal(evaluateAndroidWebViewCapability(profile, 'chrome-sync').status, 'unsupported');
  assert.ok(WEBVIEW_CAPABILITIES.length > 0);
});

test('existing scan API still accepts the legacy Chromium engine selector', () => {
  const config: ScanConfig = { urls: ['https://example.com'], engines: ['chromium'] };
  assert.deepEqual(config.engines, ['chromium']);
  assert.equal(typeof scan, 'function');
});

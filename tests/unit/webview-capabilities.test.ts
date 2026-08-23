import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAndroidWebViewProfile } from '../../src/runtimes/android-webview.js';
import { evaluateAndroidWebViewCapability } from '../../src/runtimes/compatibility.js';
import {
  WEBVIEW_CAPABILITIES,
  webViewCapabilityFor,
  type WebViewCapabilityEntry,
} from '../../src/runtimes/webview-capabilities.js';

const profile = createAndroidWebViewProfile({ explicitVersion: '140' });

test('WebView capability entries carry category, source, and applicability notes', () => {
  assert.ok(WEBVIEW_CAPABILITIES.length > 0);
  for (const entry of WEBVIEW_CAPABILITIES) {
    assert.match(entry.source, /^https:\/\//);
    assert.ok(entry.notes.length > 0);
    assert.ok(entry.category.length > 0);
  }
});

test('host-controlled JavaScript enablement is conditional, not guaranteed by Blink', () => {
  const result = evaluateAndroidWebViewCapability(profile, 'javascript-execution');
  assert.equal(result.status, 'conditional');
  assert.equal(result.provenance, 'webview-override');
  assert.ok(result.conditions?.some((condition) => /WebSettings/i.test(condition)));
  assert.match(result.source ?? '', /developer\.android\.com/);
});

test('Chrome Sync is explicitly unavailable as a WebView product capability', () => {
  const result = evaluateAndroidWebViewCapability(profile, 'chrome-sync');
  assert.equal(result.status, 'unsupported');
  assert.equal(result.provenance, 'webview-override');
});

test('an unknown WebView capability remains unknown', () => {
  const result = evaluateAndroidWebViewCapability(profile, 'imaginary-capability');
  assert.equal(result.status, 'unknown');
  assert.equal(result.provenance, 'unknown');
});

test('conflicting major-version evidence suppresses WebView capability claims', () => {
  const conflictingProfile = createAndroidWebViewProfile({
    nativePackageVersion: '141.0.7390.12',
    userAgent: 'Mozilla/5.0 (Linux; Android 10; K; wv) AppleWebKit/537.36 Version/4.0 Chrome/140.0.0.0 Mobile Safari/537.36',
  });
  const result = evaluateAndroidWebViewCapability(conflictingProfile, 'chrome-sync');
  assert.equal(result.status, 'unknown');
  assert.equal(result.provenance, 'unknown');
});

test('capability registry respects reviewed version ranges', () => {
  const ranged: WebViewCapabilityEntry = {
    id: 'test-ranged-capability',
    category: 'native-api',
    status: 'supported',
    minMajor: 100,
    maxMajor: 120,
    source: 'https://example.invalid/test-fixture-only',
    notes: 'Synthetic entry used only to verify registry range mechanics.',
  };
  assert.equal(webViewCapabilityFor(ranged.id, 99, [ranged]), null);
  assert.equal(webViewCapabilityFor(ranged.id, 100, [ranged]), ranged);
  assert.equal(webViewCapabilityFor(ranged.id, 120, [ranged]), ranged);
  assert.equal(webViewCapabilityFor(ranged.id, 121, [ranged]), null);
  assert.equal(webViewCapabilityFor(ranged.id, null, [ranged]), null);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAndroidWebViewProfile } from '../../src/runtimes/android-webview.js';

const WEBVIEW_140 = 'Mozilla/5.0 (Linux; Android 10; K; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/140.0.0.0 Mobile Safari/537.36';

test('creates separate Android WebView, Chromium, and Blink version fields from UA evidence', () => {
  const profile = createAndroidWebViewProfile({ userAgent: WEBVIEW_140 });
  assert.equal(profile.runtime, 'android-webview');
  assert.equal(profile.renderingEngine, 'blink');
  assert.equal(profile.runtimeVersion.major, 140);
  assert.equal(profile.chromiumVersion.major, 140);
  assert.equal(profile.engineVersion.major, 140);
  assert.notEqual(profile.runtimeVersion, profile.chromiumVersion);
});

test('native package version overrides a conflicting UA version and preserves the conflict', () => {
  const profile = createAndroidWebViewProfile({
    userAgent: WEBVIEW_140,
    nativePackageVersion: '141.0.7390.12',
  });
  assert.equal(profile.runtimeVersion.source, 'native-package');
  assert.equal(profile.runtimeVersion.major, 141);
  assert.equal(profile.chromiumVersion.major, 141);
  assert.ok(profile.warnings.some((warning) => /conflicts with user-agent/i.test(warning)));
});

test('an explicit version can create a profile without a UA', () => {
  const profile = createAndroidWebViewProfile({ explicitVersion: '116' });
  assert.equal(profile.detectionConfidence, 'unknown');
  assert.equal(profile.runtimeVersion.source, 'explicit');
  assert.equal(profile.engineVersion.major, 116);
  assert.ok(profile.warnings.some((warning) => /not identified from a user-agent/i.test(warning)));
});

test('a detected WebView with no exposed version remains unknown', () => {
  const profile = createAndroidWebViewProfile({
    userAgent: 'Mozilla/5.0 (Linux; Android 13; wv) AppleWebKit/537.36 Version/4.0 Mobile Safari/537.36',
  });
  assert.equal(profile.runtimeVersion.major, null);
  assert.equal(profile.chromiumVersion.major, null);
  assert.equal(profile.engineVersion.major, null);
});

test('rejects a UA-only profile when the UA is not identifiable as WebView', () => {
  assert.throws(
    () => createAndroidWebViewProfile({
      userAgent: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 Chrome/140.0.0.0 Mobile Safari/537.36',
    }),
    /not identifiable as Android WebView/i,
  );
});

test('models Android 4.4 WebView release and Chromium/Blink milestone separately', () => {
  const profile = createAndroidWebViewProfile({
    userAgent: 'Mozilla/5.0 (Linux; Android 4.4.4; Nexus 5 Build/KTU84P; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/33.0.0.0 Mobile Safari/537.36',
  });
  assert.equal(profile.runtimeVersion.raw, '4.4');
  assert.equal(profile.runtimeVersion.major, null);
  assert.equal(profile.chromiumVersion.major, 33);
  assert.equal(profile.engineVersion.major, 33);
  assert.match(profile.warnings.join(' '), /legacy Android 4\.4/i);
});

test('an explicit legacy 4.4 release does not invent Chromium or Blink milestone 4', () => {
  const profile = createAndroidWebViewProfile({ explicitVersion: '4.4' });
  assert.equal(profile.runtimeVersion.raw, '4.4');
  assert.equal(profile.runtimeVersion.major, null);
  assert.equal(profile.chromiumVersion.major, null);
  assert.equal(profile.engineVersion.major, null);
  assert.match(profile.warnings.join(' '), /legacy Android 4\.4/i);
});

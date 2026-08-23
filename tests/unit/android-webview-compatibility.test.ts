import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAndroidWebViewProfile } from '../../src/runtimes/android-webview.js';
import { evaluateAndroidWebViewFeature } from '../../src/runtimes/compatibility.js';

test('a WebView below a Chromium feature threshold is engine-incompatible', () => {
  const result = evaluateAndroidWebViewFeature(
    createAndroidWebViewProfile({ explicitVersion: '79' }),
    'Optional chaining (?.)',
  );
  assert.equal(result.status, 'engine-incompatible');
  assert.equal(result.provenance, 'chromium-baseline');
  assert.match(result.caveat, /Blink|Chromium/i);
});

test('meeting a Chromium threshold proves only engine compatibility', () => {
  const result = evaluateAndroidWebViewFeature(
    createAndroidWebViewProfile({ explicitVersion: '80' }),
    'Optional chaining (?.)',
  );
  assert.equal(result.status, 'engine-compatible');
  assert.notEqual(result.status, 'supported');
  assert.match(result.caveat, /does not guarantee Android WebView runtime compatibility/i);
});

test('an unknown WebView version yields unknown compatibility', () => {
  const result = evaluateAndroidWebViewFeature(
    createAndroidWebViewProfile({
      userAgent: 'Mozilla/5.0 (Linux; Android 13; wv) AppleWebKit/537.36 Version/4.0 Mobile Safari/537.36',
    }),
    'Optional chaining (?.)',
  );
  assert.equal(result.status, 'unknown');
  assert.equal(result.provenance, 'unknown');
});

test('an unknown feature yields unknown compatibility', () => {
  const result = evaluateAndroidWebViewFeature(
    createAndroidWebViewProfile({ explicitVersion: '140' }),
    'Imaginary API',
  );
  assert.equal(result.status, 'unknown');
});

test('conflicting major-version evidence yields no compatibility claim', () => {
  const result = evaluateAndroidWebViewFeature(
    createAndroidWebViewProfile({
      nativePackageVersion: '141.0.7390.12',
      userAgent: 'Mozilla/5.0 (Linux; Android 10; K; wv) AppleWebKit/537.36 Version/4.0 Chrome/140.0.0.0 Mobile Safari/537.36',
    }),
    'Optional chaining (?.)',
  );
  assert.equal(result.status, 'unknown');
  assert.equal(result.provenance, 'unknown');
});

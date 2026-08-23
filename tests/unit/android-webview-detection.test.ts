import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectAndroidWebView } from '../../src/runtimes/android-webview.js';
import type { RuntimeDetectionConfidence } from '../../src/runtimes/types.js';

type UaFixture = {
  name: string;
  source: string;
  userAgent: string;
  expected: {
    isAndroidWebView: boolean;
    confidence: RuntimeDetectionConfidence;
    rawVersion: string | null;
    major: number | null;
  };
};

function fixtures(name: string): UaFixture[] {
  return JSON.parse(readFileSync(new URL(`../fixtures/user-agents/${name}`, import.meta.url), 'utf8')) as UaFixture[];
}

for (const fixture of [...fixtures('android-webview.json'), ...fixtures('non-webview-chrome.json')]) {
  test(`detectAndroidWebView: ${fixture.name}`, () => {
    const result = detectAndroidWebView(fixture.userAgent);
    assert.equal(result.isAndroidWebView, fixture.expected.isAndroidWebView, fixture.source);
    assert.equal(result.confidence, fixture.expected.confidence);
    assert.equal(result.version.raw, fixture.expected.rawVersion);
    assert.equal(result.version.major, fixture.expected.major);
    if (result.isAndroidWebView) {
      assert.ok(result.evidence.includes('android-platform'));
      assert.ok(result.evidence.length >= 2);
    }
  });
}

test('Version/4.0 is evidence and never the exposed WebView version', () => {
  const result = detectAndroidWebView(
    'Mozilla/5.0 (Linux; Android 4.4.4) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/37.0.0.0 Mobile Safari/537.36',
  );
  assert.equal(result.version.major, 37);
  assert.notEqual(result.version.major, 4);
  assert.ok(result.evidence.includes('version-4-marker'));
});

test('a reduced WebView UA exposes only major-version precision', () => {
  const result = detectAndroidWebView(
    'Mozilla/5.0 (Linux; Android 10; K; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/140.0.0.0 Mobile Safari/537.36',
  );
  assert.equal(result.version.major, 140);
  assert.equal(result.version.precision, 'major');
});

test('an app-specific suffix is preserved in the raw user agent', () => {
  const ua = 'Mozilla/5.0 (Linux; Android 12; wv) AppleWebKit/537.36 Version/4.0 Chrome/100.0.4896.127 Mobile Safari/537.36 ExampleApp/2.4';
  assert.equal(detectAndroidWebView(ua).userAgent, ua);
});

test('an oversized major is retained as raw evidence but not normalized', () => {
  const result = detectAndroidWebView(
    'Mozilla/5.0 (Linux; Android 13; wv) AppleWebKit/537.36 Version/4.0 Chrome/999999999999999999999.0.0.0 Mobile Safari/537.36',
  );
  assert.equal(result.isAndroidWebView, true);
  assert.equal(result.version.raw, '999999999999999999999.0.0.0');
  assert.equal(result.version.major, null);
  assert.equal(result.version.precision, 'unknown');
});

test('Version/4.0 after Chrome does not make Android Chrome a WebView', () => {
  const result = detectAndroidWebView(
    'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 Chrome/140.0.0.0 Mobile Safari/537.36 Version/4.0',
  );
  assert.equal(result.isAndroidWebView, false);
});

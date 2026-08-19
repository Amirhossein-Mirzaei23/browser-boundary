import { test } from 'node:test';
import assert from 'node:assert/strict';
import { legacyChromeDriverUrls, resolveLegacyChromeDriver } from '../../src/browsers/chromedriver-matrix.js';

test('legacy ChromeDriver matrix covers Chromium 62 through 74', () => {
  const expected = new Map<number, string>([
    [62, '2.35'], [64, '2.35'],
    [65, '2.38'], [67, '2.38'],
    [68, '2.41'], [69, '2.42'], [70, '2.42'],
    [71, '2.46'], [73, '2.46'],
    [74, '74.0.3729.6'],
  ]);
  for (const [major, version] of expected) {
    assert.equal(resolveLegacyChromeDriver(major)?.version, version);
  }
});

test('legacy ChromeDriver matrix does not claim unsupported majors', () => {
  for (const major of [60, 61, 75, 76, 151]) {
    assert.equal(resolveLegacyChromeDriver(major), null);
  }
});

test('legacy ChromeDriver compatibility range is explicit', () => {
  assert.deepEqual(resolveLegacyChromeDriver(70), {
    version: '2.42',
    minChromium: 69,
    maxChromium: 70,
  });
});

test('early Chromium 68 uses ChromeDriver 2.41, not 2.42', () => {
  assert.equal(resolveLegacyChromeDriver(68)?.version, '2.41');
});

test('legacy driver acquisition tries the official archive before the mirror', () => {
  assert.deepEqual(legacyChromeDriverUrls('2.42'), [
    'https://chromedriver.storage.googleapis.com/2.42/chromedriver_linux64.zip',
    'https://registry.npmmirror.com/-/binary/chromedriver/2.42/chromedriver_linux64.zip',
  ]);
});

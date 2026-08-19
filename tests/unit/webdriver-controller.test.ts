import { test } from 'node:test';
import assert from 'node:assert/strict';
import { driverServerArgs, isLegacyChromeDriverVersion, legacyFontconfigXml, legacySessionPayload, normalizeWebDriverLogLevel } from '../../src/controllers/webdriver.js';

test('ChromeDriver receives the equals-form port argument it accepts', () => {
  assert.deepEqual(driverServerArgs('chromium', 49190), ['--port=49190']);
});

test('geckodriver receives its separate port arguments', () => {
  assert.deepEqual(driverServerArgs('firefox', 49190), ['--port', '49190']);
});

test('numeric WebDriver log levels do not crash normalization', () => {
  assert.equal(normalizeWebDriverLogLevel({ value: 1000, name: 'SEVERE' }), 'severe');
  assert.equal(normalizeWebDriverLogLevel({ value: 'WARNING', name: 'WARNING' }), 'warning');
});

test('legacy ChromeDriver session uses desiredCapabilities and chromeOptions', () => {
  assert.deepEqual(legacySessionPayload('/opt/chromium', true), {
    desiredCapabilities: {
      browserName: 'chrome',
      chromeOptions: {
        binary: '/opt/chromium',
        args: ['--no-sandbox', '--disable-dev-shm-usage', '--headless'],
      },
      loggingPrefs: { browser: 'ALL' },
    },
  });
});

test('ChromeDriver protocol detection treats pre-75 releases as legacy', () => {
  assert.equal(isLegacyChromeDriverVersion('ChromeDriver 2.42.591071'), true);
  assert.equal(isLegacyChromeDriverVersion('ChromeDriver 74.0.3723.0'), true);
  assert.equal(isLegacyChromeDriverVersion('ChromeDriver 75.0.3770.8'), false);
  assert.equal(isLegacyChromeDriverVersion('ChromeDriver 89.0.4389.0'), false);
});

test('legacy Fontconfig avoids modern include files and points at installed font directories', () => {
  const xml = legacyFontconfigXml(['/usr/share/fonts/truetype/dejavu', '/usr/share/fonts/truetype/liberation2']);
  assert.match(xml, /<dir>\/usr\/share\/fonts\/truetype\/dejavu<\/dir>/);
  assert.doesNotMatch(xml, /fonts\.conf|conf\.d|description/);
});

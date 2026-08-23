import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { driverServerArgs, firefoxDriverEnv, isLegacyChromeDriverVersion, legacyFontconfigXml, legacySessionPayload, normalizeWebDriverLogLevel } from '../../src/controllers/webdriver.js';

test('WebDriver ESM subpath imports include the runtime .js extension', () => {
  const source = readFileSync(new URL('../../src/controllers/webdriver.ts', import.meta.url), 'utf8');

  for (const subpath of ['chrome', 'firefox', 'http/index', 'lib/session', 'lib/capabilities']) {
    assert.ok(source.includes(`import('selenium-webdriver/${subpath}.js')`), `${subpath} import must end in .js`);
    assert.ok(!source.includes(`import('selenium-webdriver/${subpath}')`), `${subpath} import must not be extensionless`);
  }
});

test('Selenium HTTP module exposes constructible client and executor classes', async () => {
  const http = await import('selenium-webdriver/http/index.js');

  const client = new http.HttpClient('http://127.0.0.1:4444');
  const executor = new http.Executor(client);

  assert.equal(client.constructor.name, 'HttpClient');
  assert.equal(executor.constructor.name, 'Executor');
});

test('ChromeDriver receives the equals-form port argument it accepts', () => {
  assert.deepEqual(driverServerArgs('chromium', 49190), ['--port=49190']);
});

test('geckodriver receives its separate port arguments', () => {
  assert.deepEqual(driverServerArgs('firefox', 49190), ['--port', '49190']);
});

test('historical Firefox disables incompatible Linux content sandboxes', () => {
  const env = firefoxDriverEnv({ EXISTING: 'preserved' });

  assert.equal(env.EXISTING, 'preserved');
  assert.equal(env.MOZ_DISABLE_CONTENT_SANDBOX, '1');
  assert.equal(env.MOZ_DISABLE_GMP_SANDBOX, '1');
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

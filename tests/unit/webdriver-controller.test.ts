import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { driverServerArgs, firefoxDriverEnv, identityFromCapabilities, isLegacyChromeDriverVersion, legacyFontconfigXml, legacySessionPayload, normalizeWebDriverLogLevel, WebDriverSession } from '../../src/controllers/webdriver.js';

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

test('WebDriverSession.getIdentity reads live W3C session capabilities', async () => {
  const caps = new Map<string, unknown>([
    ['browserName', 'firefox'],
    ['browserVersion', '115.0.3'],
  ]);
  let capabilityReads = 0;
  const driver = {
    async getCapabilities() {
      capabilityReads += 1;
      return { get: (key: string) => caps.get(key) };
    },
  };
  const session = new WebDriverSession(
    driver as never,
    {} as never,
    4444,
    'firefox',
  );

  const identity = await session.getIdentity();

  assert.equal(capabilityReads, 1);
  assert.equal(identity.engine, 'firefox');
  assert.equal(identity.version, '115.0.3');
  assert.equal(identity.method, 'webdriver:session-capabilities');
});

test('getIdentity accepts plain capability records and falls back to legacy version', () => {
  // Legacy (JSON Wire) sessions report `version` instead of `browserVersion`.
  const identity = identityFromCapabilities({ browserName: 'chrome', version: '74.0.3729.6' });

  assert.equal(identity.engine, 'chrome');
  assert.equal(identity.version, '74.0.3729.6');
});

test('getIdentity prefers W3C browserVersion over the legacy version field', () => {
  const identity = identityFromCapabilities({
    browserName: 'chrome',
    browserVersion: '121.0.6167.85',
    version: 'legacy-value-ignored',
  });

  assert.equal(identity.version, '121.0.6167.85');
});

test('getIdentity reports null engine/version when capabilities are missing or empty', () => {
  assert.deepEqual(identityFromCapabilities(null), {
    engine: null,
    version: null,
    method: 'webdriver:session-capabilities',
  });
  assert.deepEqual(identityFromCapabilities(undefined), {
    engine: null,
    version: null,
    method: 'webdriver:session-capabilities',
  });
  assert.deepEqual(identityFromCapabilities({}), {
    engine: null,
    version: null,
    method: 'webdriver:session-capabilities',
  });
});

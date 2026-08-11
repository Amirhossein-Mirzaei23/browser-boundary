import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isPackageInstalled,
  requiredPackagesFor,
  checkEngineDeps,
} from '../../src/core/dependencies.js';
import { resolveConfig } from '../../src/config/resolve.js';

const cfg = (strategy: 'binary' | 'latest' | 'explicit' = 'binary') =>
  resolveConfig({ urls: ['https://x.com'], search: { strategy } });

test('isPackageInstalled returns true for a builtin-like resolvable and false for nonsense', () => {
  // 'playwright' is a peer dep and present in this repo.
  assert.equal(isPackageInstalled('playwright'), true);
  assert.equal(isPackageInstalled('this-package-does-not-exist-xyz'), false);
});

test('requiredPackagesFor: latest strategy needs no optional packages', () => {
  assert.deepEqual(requiredPackagesFor('chromium', cfg('latest')), []);
  assert.deepEqual(requiredPackagesFor('firefox', cfg('latest')), []);
  assert.deepEqual(requiredPackagesFor('webkit', cfg('latest')), []);
});

test('requiredPackagesFor: webkit never needs optional packages (no historical)', () => {
  assert.deepEqual(requiredPackagesFor('webkit', cfg('binary')), []);
});

test('requiredPackagesFor: chromium historical needs @puppeteer/browsers', () => {
  const req = requiredPackagesFor('chromium', cfg('binary'));
  assert.equal(req.length, 1);
  assert.equal(req[0].name, '@puppeteer/browsers');
  assert.match(req[0].installCommand, /npm install @puppeteer\/browsers/);
});

test('requiredPackagesFor: firefox historical needs selenium-webdriver', () => {
  const req = requiredPackagesFor('firefox', cfg('binary'));
  assert.equal(req.length, 1);
  assert.equal(req[0].name, 'selenium-webdriver');
  assert.match(req[0].installCommand, /npm install selenium-webdriver/);
});

test('checkEngineDeps: ok when the required package is installed (chromium/@puppeteer/browsers)', () => {
  // @puppeteer/browsers is an optional dep present in this repo.
  const r = checkEngineDeps('chromium', cfg('binary'));
  assert.equal(r.ok, true);
  assert.equal(r.missing.length, 0);
});

test('checkEngineDeps: not ok when the required package is missing (firefox/selenium-webdriver)', () => {
  // selenium-webdriver is NOT installed in this repo by default.
  const r = checkEngineDeps('firefox', cfg('binary'));
  // Only assert the missing path if selenium-webdriver is genuinely absent.
  if (!isPackageInstalled('selenium-webdriver')) {
    assert.equal(r.ok, false);
    assert.equal(r.missing.length, 1);
    assert.equal(r.missing[0].name, 'selenium-webdriver');
    assert.match(r.message, /selenium-webdriver/);
    assert.match(r.message, /npm install selenium-webdriver/);
    assert.match(r.message, /historical scan skipped/);
  }
});

test('checkEngineDeps: latest strategy is always ok (no optional deps)', () => {
  const r = checkEngineDeps('firefox', cfg('latest'));
  assert.equal(r.ok, true);
  assert.equal(r.missing.length, 0);
});

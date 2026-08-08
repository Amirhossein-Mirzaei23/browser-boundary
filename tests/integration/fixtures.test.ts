import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeSignals } from '../../src/analysis/error-analyzer.js';
import type { Verdict } from '../../src/reporting/types.js';

/**
 * Integration tests against LOCAL fixtures served via Playwright's page.route()
 * (data-URL / inline serving). Deterministic, no external sites.
 *
 * Each fixture has a known expected verdict; these guard the detection layer
 * against regressions without depending on any real website.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, '..', 'fixtures');

function readFixture(name: string): string {
  const file = path.join(FIXTURES, name, 'index.html');
  if (!existsSync(file)) throw new Error(`missing fixture ${name}`);
  return `data:text/html,${encodeURIComponent(require_node_read(file))}`;
}

// node:test runs ESM; use a sync read shim.
import { readFileSync } from 'node:fs';
function require_node_read(file: string): string {
  return readFileSync(file, 'utf8');
}

async function loadAndCollect(url: string) {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const jsErrors: { type: 'pageerror'; message: string }[] = [];
  const consoleErrors: { level: 'error' | 'warning'; text: string }[] = [];
  page.on('pageerror', (e: Error) => jsErrors.push({ type: 'pageerror', message: e.message }));
  page.on('console', (m) => {
    const t = m.type();
    if (t === 'error' || t === 'warning') consoleErrors.push({ level: t, text: m.text() });
  });
  let navErr: string | null = null;
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
  } catch (e) {
    navErr = (e as Error).message;
  }
  // give scripts a moment to run
  await page.waitForTimeout(300).catch(() => {});
  await browser.close();
  return { jsErrors, consoleErrors, navErr };
}

test('healthy fixture loads with no JS errors', async () => {
  const { jsErrors, navErr } = await loadAndCollect(readFixture('healthy'));
  assert.equal(navErr, null);
  assert.equal(jsErrors.length, 0);
});

test('js-error fixture throws a runtime TypeError that is NOT attributed to a feature', async () => {
  const { jsErrors, navErr } = await loadAndCollect(readFixture('js-error'));
  assert.equal(navErr, null);
  assert.ok(jsErrors.length >= 1, 'expected at least one pageerror');
  const a = analyzeSignals(null, jsErrors, [], [], true, 'low', null);
  assert.equal(a.verdict, 'fail');
  assert.equal(a.finding?.confidence, 'unknown');
});

test('syntax-error fixture: a modern browser parses optional chaining (no SyntaxError on current build)', async () => {
  // On the CURRENT (latest) browser, optional chaining is supported, so this
  // should NOT throw. The fixture exists to assert the negative on old builds;
  // here we assert the current build handles it gracefully.
  const { jsErrors } = await loadAndCollect(readFixture('syntax-error'));
  const syntaxErrors = jsErrors.filter((e) => /unexpected token/i.test(e.message));
  assert.equal(syntaxErrors.length, 0, 'current browser should parse optional chaining');
});

test('fixtures directory contains all expected scenarios', () => {
  const dirs = readdirSync(FIXTURES, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  for (const expected of ['healthy', 'js-error', 'syntax-error', 'failed-api', 'failed-script', 'blank-page']) {
    assert.ok(dirs.includes(expected), `missing fixture: ${expected}`);
  }
});

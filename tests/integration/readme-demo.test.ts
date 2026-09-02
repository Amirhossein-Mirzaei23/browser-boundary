import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startDemoServer } from '../../examples/readme-demo/server.js';

test('readme demo serves a deterministic page that passes in current Chromium', async (t) => {
  const server = await startDemoServer(0);
  t.after(() => server.close());
  const url = `http://127.0.0.1:${server.port}/`;

  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'load' });

  // The demo must render its pass UI and show a Chromium runtime identity.
  await page.waitForSelector('[data-demo-status="pass"]', { timeout: 10_000 });
  assert.match((await page.textContent('[data-runtime-identity]')) ?? '', /Chrom/i);

  // Localhost-only, zero external requests: nothing besides the page itself loads.
  const requested: string[] = [];
  page.on('request', (r) => requested.push(r.url()));
  await page.reload({ waitUntil: 'load' });
  assert.ok(requested.every((u) => u.startsWith(`http://127.0.0.1:${server.port}`)));

  await page.close();
});

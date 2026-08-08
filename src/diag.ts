/**
 * Standalone diagnostic: launches each engine, tries a simple page then
 * tabdeal, and prints rich timing/response info. Run with:
 *   npx tsx src/diag.ts
 */
import { chromium, firefox, webkit } from 'playwright';

const TARGETS = ['https://example.com', 'https://tabdeal.org'];

async function diag(name: string, launch: () => Promise<{ browser: import('playwright').Browser }>) {
  console.log(`\n===== ${name} =====`);
  let browser;
  try {
    const t0 = Date.now();
    browser = await launch().then((r) => r.browser);
    console.log(`launched in ${Date.now() - t0}ms  version=${browser.version()}`);
  } catch (e) {
    console.log(`LAUNCH FAILED: ${e instanceof Error ? e.message : e}`);
    return;
  }

  for (const url of TARGETS) {
    const page = await browser.newPage();
    const events: string[] = [];
    page.on('request', (r) => events.push(`+req ${r.method()} ${r.url().slice(0, 70)}`));
    page.on('response', (r) => events.push(`=res ${r.status()} ${r.url().slice(0, 70)}`));
    page.on('requestfailed', (r) =>
      events.push(`!fail ${r.failure()?.errorText ?? 'unknown'} ${r.url().slice(0, 70)}`),
    );
    const t0 = Date.now();
    try {
      const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      const ms = Date.now() - t0;
      console.log(`\n${url}  → ${resp?.status() ?? 'no-resp'} in ${ms}ms  title="${(await page.title()).slice(0, 60)}"`);
      console.log(`  ${events.length} request events (showing first 12):`);
      for (const e of events.slice(0, 12)) console.log(`    ${e}`);
    } catch (e) {
      console.log(`\n${url}  → FAILED in ${Date.now() - t0}ms: ${e instanceof Error ? e.message : e}`);
      console.log(`  ${events.length} request events before failure:`);
      for (const e of events.slice(0, 12)) console.log(`    ${e}`);
    } finally {
      await page.close().catch(() => {});
    }
  }
  await browser.close().catch(() => {});
}

await diag('chromium', async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  return { browser };
});
await diag('firefox', async () => {
  const browser = await firefox.launch({ headless: true });
  return { browser };
});
await diag('webkit', async () => {
  const browser = await webkit.launch({ headless: true });
  return { browser };
});

/**
 * Focused WAF-bypass diagnostic: tries several strategies to load tabdeal.org
 * in Playwright and reports which (if any) get a response.
 *   npx tsx src/diag-waf.ts
 */
import { chromium, firefox } from 'playwright';

const URL = 'https://tabdeal.org';

async function tryStrategy(name: string, fn: (page: import('playwright').Page) => Promise<{ status: number | null; ms: number; responses: number }>) {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  try {
    const page = await browser.newPage();
    let responses = 0;
    page.on('response', () => responses++);
    const t0 = Date.now();
    let status: number | null = null;
    try {
      const res = await fn(page);
      status = res.status;
      responses = Math.max(responses, res.responses);
      console.log(`[${name}] PASS status=${status} in ${Date.now() - t0}ms responses=${responses}`);
    } catch (e) {
      console.log(`[${name}] FAIL in ${Date.now() - t0}ms responses=${responses}: ${(e as Error).message.slice(0, 100)}`);
    }
    await page.close().catch(() => {});
  } finally {
    await browser.close().catch(() => {});
  }
}

// Strategy 0: baseline (cold)
await tryStrategy('baseline cold', async (page) => {
  const res = await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  return { status: res?.status() ?? null, ms: 0, responses: 0 };
});

// Strategy 1: warm-up fetch for cookie, then navigate
await tryStrategy('warmup fetch + nav', async (page) => {
  await page.evaluate(async (u) => {
    try { await fetch(u, { mode: 'no-cors', credentials: 'include' }); } catch {}
  }, URL);
  const res = await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  return { status: res?.status() ?? null, ms: 0, responses: 0 };
});

// Strategy 2: realistic locale/extra-http + two retries
await tryStrategy('realistic ctx + retry', async (page) => {
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const res = await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  return { status: res?.status() ?? null, ms: 0, responses: 0 };
});

// Strategy 3: go via a non-root path (some WAFs only interstitial on root)
await tryStrategy('buy-btc path', async (page) => {
  const res = await page.goto('https://tabdeal.org/buy-btc', { waitUntil: 'domcontentloaded', timeout: 30000 });
  return { status: res?.status() ?? null, ms: 0, responses: 0 };
});

console.log('\n--- Firefox baseline ---');
{
  const browser = await firefox.launch({ headless: true });
  try {
    const page = await browser.newPage();
    let responses = 0;
    page.on('response', () => responses++);
    const t0 = Date.now();
    try {
      const res = await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
      console.log(`[firefox baseline] PASS status=${res?.status() ?? null} in ${Date.now() - t0}ms responses=${responses}`);
    } catch (e) {
      console.log(`[firefox baseline] FAIL in ${Date.now() - t0}ms responses=${responses}: ${(e as Error).message.slice(0, 100)}`);
    }
  } finally {
    await browser.close().catch(() => {});
  }
}

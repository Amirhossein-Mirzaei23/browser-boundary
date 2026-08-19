/**
 * Tabdeal example — preserves the behavior of the original Tabdeal-specific
 * prototype, now expressed as CONFIGURATION on top of the generic engine.
 *
 * All Tabdeal-specific knowledge (URLs, selectors, analytics hosts, and the
 * ArvanCloud anti-bot warm-up) lives HERE, not in the package core. Run:
 *
 *   npx tsx examples/tabdeal.ts
 *
 *   # or via the CLI (selectors supplied as flags):
 *   npx browser-boundary https://tabdeal.org \
 *     --pages /buy-btc --base-url https://tabdeal.org \
 *     --readiness-selector 'a[href="/buy-cryptocurrency"]' \
 *     --readiness-selector 'a[href="/swap"]' \
 *     --latest-only
 */
import { scan } from '../src/index.js';
import { writeJson, writeMarkdown } from '../src/reporting/index.js';

// Selectors were discovered from the live site (a Persian RTL SSR app).
const HOME_SELECTORS = ['a[href="/"]', 'a[href="/buy-cryptocurrency"]', 'a[href="/swap"]'];
const BUY_BTC_SELECTORS = [
  'a[href="/buy-btc"]',
  'a[href="/panel/trade/BTC_IRT"]',
  'a[href="/swap?to-symbol=btc"]',
];

// Analytics/tracking hosts that should NOT fail the test when they 404 in old
// browsers. The core ships with NONE — this list is site-specific config.
const IGNORED = [
  /google-analytics\.com/i,
  /googletagmanager\.com/i,
  /doubleclick\.net/i,
  /hotjar/i,
  /clarity\.ms/i,
  /sentry\.io/i,
];

const result = await scan(
  {
    siteName: 'tabdeal.org',
    urls: [
      { url: 'https://tabdeal.org', label: 'home', readiness: { selectors: HOME_SELECTORS, mode: 'any' } },
      { url: 'https://tabdeal.org/buy-btc', label: 'buy-btc', readiness: { selectors: BUY_BTC_SELECTORS, mode: 'any' } },
    ],
    engines: ['chromium', 'firefox', 'webkit'],
    search: { strategy: 'binary', stepSize: 10, floor: { chromium: 67, firefox: 60, webkit: 13 } },
    network: { ignoredPatterns: IGNORED, criticalResourceTypes: ['script', 'stylesheet', 'xhr', 'fetch', 'font'] },
    timeout: 45_000,
    retries: 3,
    // Tabdeal sits behind ArvanCloud, which issues a session cookie (TS01*) on
    // first contact and intermittently stalls automated browsers. This warm-up
    // uses the browser's REAL TLS fingerprint (no User-Agent spoofing) to obtain
    // the cookie before navigating — an opt-in hook, never in the core.
    hooks: {
      beforeGoto: async ({ page, url }) => {
        const origin = new URL(url).origin;
        await page
          .evaluate(async (o) => {
            try {
              await fetch(o, { mode: 'no-cors', credentials: 'include' });
            } catch {
              /* warm-up is best-effort */
            }
          }, origin)
          .catch(() => {});
      },
    },
    output: { format: ['json', 'markdown'], directory: './reports-tabdeal' },
  },
  { onProgress: (m) => console.log(m) },
);

writeJson(result, './reports-tabdeal');
writeMarkdown(result, './reports-tabdeal');

console.log('\nTabdeal summary:');
for (const s of result.summaries) {
  console.log(`  ${s.engine.padEnd(8)} ${s.resultLine}`);
  if (s.limitationNote) console.log(`           note: ${s.limitationNote}`);
}

/**
 * Custom-readiness example: a SPA that needs a client-side predicate.
 *
 * Readiness here is a function (not selectors) that waits for the app's root
 * element to be hydrated. The core has no knowledge of your selectors.
 *
 *   npx tsx examples/custom-readiness.ts
 */
import { scan } from '../src/index.js';

const result = await scan({
  urls: [
    {
      url: 'https://your-app.test',
      label: 'home',
      readiness: async ({ page }) => {
        // Wait for the app's root + a data attribute set after hydration.
        try {
          await page.waitForSelector('#app', { timeout: 15_000 });
          return await page.locator('#app[data-hydrated]').count() > 0;
        } catch {
          return false;
        }
      },
    },
  ],
  engines: ['chromium'],
  search: { strategy: 'latest' },
});

for (const s of result.summaries) console.log(`${s.engine}: ${s.resultLine}`);

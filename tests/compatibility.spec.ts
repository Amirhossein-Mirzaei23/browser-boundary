import { expect, test } from '@playwright/test';

test('current browser can execute a basic compatibility probe', async ({ page, browserName }) => {
  await page.setContent('<main data-browser-boundary-ready>ready</main>');
  await expect(page.locator('[data-browser-boundary-ready]')).toHaveText('ready');
  await expect.poll(() => page.evaluate(() => typeof Promise.allSettled)).toBe('function');
  expect(['chromium', 'firefox', 'webkit']).toContain(browserName);
});
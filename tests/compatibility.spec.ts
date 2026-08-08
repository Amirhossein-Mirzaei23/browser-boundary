import { test, expect, type Page } from '@playwright/test';
import { PAGES } from '../src/config.js';

/**
 * Optional thin Playwright-Test wrapper around the same compatibility checks.
 *
 * Use this when you want the standard `playwright test` UX: per-engine
 * projects (see playwright.config.ts), headed mode, HTML reporters, traces.
 *
 * For the full multi-version historical scan use `npm run scan` instead.
 */

const PROBE = PAGES;

async function assertCompatible(page: Page, url: string, selectors: string[], label: string) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  await page.goto(url, { waitUntil: 'load' });
  await page.waitForLoadState('networkidle').catch(() => {});

  for (const sel of selectors) {
    await expect(page.locator(sel).first()).toBeVisible({ timeout: 30_000 });
  }

  // No uncaught JS errors allowed.
  expect(errors, `uncaught JS errors on ${label}`).toEqual([]);
}

for (const probe of PROBE) {
  test(`${probe.label} (${probe.url}) loads and renders`, async ({ page }) => {
    await assertCompatible(page, probe.url, probe.readinessSelectors, probe.label);
  });
}

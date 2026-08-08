import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config used by the optional `tests/compatibility.spec.ts` wrapper.
 *
 * The heavy lifting (real historical binaries, step-down search, report
 * generation) lives in `src/run.ts` and is invoked via `npm run scan`.
 * This config exists so the 3 engine projects can also be exercised through
 * the standard `playwright test` runner with headed mode, traces and
 * screenshots on failure.
 */
export default defineConfig({
  testDir: './tests',
  timeout: 120_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    headless: process.env.HEADED ? false : true,
    viewport: { width: 1366, height: 768 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'off',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});

import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/cli/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  // Don't bundle peers/optionals; keep them external so they're resolved at
  // runtime. selenium-webdriver is dynamically imported only for historical
  // Firefox probes and must NOT be required at bundle time.
  external: ['playwright', '@playwright/test', '@puppeteer/browsers', 'selenium-webdriver', 'selenium-webdriver/firefox'],
});

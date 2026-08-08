import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/cli/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  // Don't bundle Playwright/@puppeteer/browsers (peers/optionals); keep them external.
  external: ['playwright', '@playwright/test', '@puppeteer/browsers'],
});

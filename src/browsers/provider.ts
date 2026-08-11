import type { EngineName } from '../reporting/types.js';
import type { BrowserBinary, BrowserVersion } from './types.js';
import type { BrowserProvider } from './types.js';
import type { FetchProgressHandler } from './progress.js';
import { ChromiumProvider } from './chromium-provider.js';
import { FirefoxProvider } from './firefox-provider.js';
import { PlaywrightProvider } from './playwright-provider.js';
import { WebKitProvider } from './webkit-provider.js';

/**
 * Composite provider that routes each engine to the most capable provider that
 * can serve it:
 *   chromium → ChromiumProvider (real historical via Chrome-for-Testing, driven by Playwright/CDP)
 *   firefox  → FirefoxProvider  (real historical via archive.mozilla.org, driven by geckodriver/WebDriver)
 *   webkit   → WebKitProvider   (Playwright-revision-only, honestly — Safari is macOS-locked)
 *
 * The scanner only ever talks to this composite; it is provider-agnostic.
 */
export class DefaultBrowserProvider implements BrowserProvider {
  private readonly chromium = new ChromiumProvider();
  private readonly firefox = new FirefoxProvider();
  private readonly webkit = new WebKitProvider();
  private readonly playwright = new PlaywrightProvider();

  private for(engine: EngineName): Pick<BrowserProvider, 'install' | 'getLatest' | 'supportsHistoricalVersions'> {
    switch (engine) {
      case 'chromium':
        return this.chromium;
      case 'firefox':
        return this.firefox;
      case 'webkit':
        return this.webkit;
    }
  }

  async install(
    engine: EngineName,
    version: string,
    cacheDir: string,
    onProgress?: FetchProgressHandler,
  ): Promise<BrowserBinary> {
    return this.for(engine).install(engine, version, cacheDir, onProgress);
  }

  async getLatest(engine: EngineName): Promise<BrowserVersion> {
    return this.for(engine).getLatest(engine);
  }

  supportsHistoricalVersions(engine: EngineName): boolean {
    return this.for(engine).supportsHistoricalVersions(engine);
  }

  /** Exposed for the `install` CLI subcommand. */
  get playwrightProvider(): PlaywrightProvider {
    return this.playwright;
  }
}

/** Default singleton used by the scanner when no custom provider is supplied. */
export const defaultBrowserProvider = new DefaultBrowserProvider();

export type { BrowserProvider };

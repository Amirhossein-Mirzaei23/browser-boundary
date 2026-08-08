import type { EngineName } from '../reporting/types.js';
import type { BrowserBinary, BrowserVersion } from './types.js';
import { PlaywrightProvider } from './playwright-provider.js';

/**
 * WebKit provider — HONEST about its limitation.
 *
 * Only Playwright's own patched WebKit build is CDP-drivable. Apple does not
 * publish standalone, drivable historical Safari/WebKit binaries, and
 * Playwright does not pin historical WebKit builds. Therefore WebKit results
 * are always the current Playwright revision, reported with
 * versionType 'playwright-revision' — NEVER as a specific Safari version we
 * cannot prove equivalent to.
 */
export class WebKitProvider {
  private playwright = new PlaywrightProvider();

  async getLatest(engine: EngineName): Promise<BrowserVersion> {
    return this.playwright.getLatest(engine);
  }

  async install(engine: EngineName, version: string, cacheDir: string): Promise<BrowserBinary> {
    const latest = await this.getLatest(engine);
    return {
      executablePath: latest.executablePath,
      buildLabel: latest.buildLabel,
      versionType: 'playwright-revision',
      isPlaywrightBuild: true,
      limitationNote:
        'Historical WebKit binaries are not installable/drivable via Playwright. ' +
        'Only the current Playwright WebKit build is available; WebKit versions are ' +
        'proxied by Playwright build revisions. Treat WebKit results as "current-only" ' +
        'and do not equate the revision to a specific Safari version.',
    };
  }

  supportsHistoricalVersions(_engine: EngineName): boolean {
    return false;
  }
}

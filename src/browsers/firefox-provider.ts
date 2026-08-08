import type { EngineName } from '../reporting/types.js';
import type { BrowserBinary, BrowserVersion } from './types.js';
import { PlaywrightProvider } from './playwright-provider.js';

/**
 * Firefox provider — HONEST about its limitation.
 *
 * Unlike Chromium (where the CDP protocol is native to every Chrome build,
 * so Chrome-for-Testing binaries are directly drivable by Playwright), Firefox
 * requires Playwright's own JUGGLER instrumentation patch to be driven. Vanilla
 * Firefox release builds from archive.mozilla.org do NOT contain Juggler, so
 * they launch and immediately exit (exitCode=0) without responding to any
 * Playwright command. We confirmed this empirically.
 *
 * Therefore Firefox historical testing is NOT possible via Playwright — the
 * same limitation as WebKit. Firefox results are always the current Playwright
 * (patched) Firefox build, reported with versionType 'playwright-revision'.
 *
 * (The historical download code that used to live here was removed because it
 * produced builds that could not be driven, giving misleading ERROR verdicts.)
 */
export class FirefoxProvider {
  private playwright = new PlaywrightProvider();

  async getLatest(engine: EngineName): Promise<BrowserVersion> {
    return this.playwright.getLatest(engine);
  }

  async install(engine: EngineName, version: string, _cacheDir: string): Promise<BrowserBinary> {
    const latest = await this.getLatest(engine);
    return {
      executablePath: latest.executablePath,
      buildLabel: latest.buildLabel,
      versionType: 'real-major', // the Playwright Firefox build IS a real Firefox major
      isPlaywrightBuild: true,
      limitationNote:
        'Historical Firefox binaries from archive.mozilla.org cannot be driven by Playwright ' +
        '(they lack the Juggler instrumentation patch and exit immediately). Only the current ' +
        'Playwright Firefox build is available. Treat Firefox results as "current-only".',
    };
  }

  supportsHistoricalVersions(_engine: EngineName): boolean {
    return false;
  }
}

import { existsSync } from 'node:fs';
import path from 'node:path';
import type { EngineName } from '../reporting/types.js';
import type { BrowserBinary, BrowserVersion } from './types.js';
import { HistoricalUnavailableError } from './types.js';
import { PlaywrightProvider } from './playwright-provider.js';
import { ensureDir, readManifest, writeManifest } from './util.js';

/**
 * Chromium historical provider.
 *
 * Downloads REAL historical Chrome builds from Chrome-for-Testing (the same
 * source Playwright/Puppeteer use) via @puppeteer/browsers, then hands the path
 * to Playwright via executablePath. @puppeteer/browsers is an OPTIONAL
 * dependency and is dynamically imported so consumers who only need
 * Playwright-managed builds never require it.
 *
 * Honesty contract: if a real Chrome-for-Testing binary for the requested
 * version cannot be obtained, `install()` throws `HistoricalUnavailableError`.
 * The scanner turns that into an INCONCLUSIVE result for that version — it
 * NEVER substitutes the current Chrome build under the requested version's name,
 * because a verdict from a different version would attribute e.g. a Chrome 151
 * test to Chrome 80.
 */
const INSTALLED_FLAG = 'mrz-installed.json';

export class ChromiumProvider {
  private playwright = new PlaywrightProvider();

  async getLatest(engine: EngineName): Promise<BrowserVersion> {
    return this.playwright.getLatest(engine);
  }

  async install(engine: EngineName, version: string, cacheDir: string): Promise<BrowserBinary> {
    if (engine !== 'chromium') {
      return this.playwright.install(engine, version, cacheDir);
    }
    const latest = await this.getLatest(engine);
    const requestedMajor = Number(version);
    const latestMajor = Number(latest.version);
    if (!Number.isNaN(latestMajor) && requestedMajor >= latestMajor) {
      return {
        executablePath: latest.executablePath,
        buildLabel: latest.buildLabel,
        versionType: 'real-major',
        isPlaywrightBuild: true,
        controller: 'playwright',
        limitationNote: null,
      };
    }

    try {
      const historical = await this.downloadChromiumForTesting(requestedMajor, cacheDir);
      return {
        executablePath: historical.executablePath,
        buildLabel: historical.buildLabel,
        versionType: 'real-major',
        isPlaywrightBuild: false,
        controller: 'playwright',
        limitationNote: null,
      };
    } catch (err) {
      throw new HistoricalUnavailableError(
        `Could not obtain real Chromium v${requestedMajor} binary: ` +
          `${err instanceof Error ? err.message : String(err)}. This version was not tested.`,
        'download-failed',
      );
    }
  }

  supportsHistoricalVersions(engine: EngineName): boolean {
    return engine === 'chromium';
  }

  private async downloadChromiumForTesting(
    major: number,
    cacheDir: string,
  ): Promise<{ executablePath: string; buildLabel: string }> {
    // Optional dependency — dynamic import so it isn't required at module load.
    const { install, computeExecutablePath, Browser, resolveBuildId, detectBrowserPlatform } =
      await import('@puppeteer/browsers');

    const platform = detectBrowserPlatform();
    if (!platform) throw new Error('Unsupported platform for Chrome-for-Testing download');

    const buildId = await resolveBuildId(Browser.CHROME, platform, `${major}`);
    // resolveBuildId returns the bare input major (e.g. "111") unchanged when it
    // cannot find a matching Chrome-for-Testing build — instead of throwing. A
    // real CFT build id is always a full MAJOR.MINOR.BUILD.PATCH (≥3 dots). If we
    // got a bare number back, no CFT build exists for this major: fail honestly
    // up front rather than downloading a 404'ing URL.
    // (Chrome-for-Testing publishes Linux builds from major 113 onward.)
    if (!/^\d+\.\d+\.\d+\.\d+$/.test(buildId)) {
      throw new HistoricalUnavailableError(
        `Chrome-for-Testing has no build for Chrome ${major}. ` +
          `CFT publishes builds from major 113 onward; this version was not tested.`,
        'download-failed',
      );
    }
    const cache = path.join(cacheDir, 'cft');
    ensureDir(cache);
    const exe = computeExecutablePath({ browser: Browser.CHROME, buildId, platform, cacheDir: cache });
    const fullExe = path.isAbsolute(exe) ? exe : path.join(cache, exe);

    const tag = `chromium-${major}`;
    const recordPath = path.join(cacheDir, `${tag}-${INSTALLED_FLAG}`);
    const cached = await readManifest(recordPath);
    if (cached) return cached;

    if (!existsSync(fullExe)) {
      await install({ browser: Browser.CHROME, buildId, cacheDir: cache, platform });
    }

    const buildLabel = `Chrome for Testing ${buildId}`;
    await writeManifest(recordPath, { executablePath: fullExe, buildLabel });
    return { executablePath: fullExe, buildLabel };
  }
}

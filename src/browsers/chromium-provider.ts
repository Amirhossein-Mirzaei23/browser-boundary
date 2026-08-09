import { existsSync } from 'node:fs';
import path from 'node:path';
import type { EngineName } from '../reporting/types.js';
import type { BrowserBinary, BrowserVersion } from './types.js';
import { HistoricalUnavailableError } from './types.js';
import { PlaywrightProvider } from './playwright-provider.js';
import { ensureDir, readManifest, writeManifest } from './util.js';
import { snapshotRevisionFor, SNAPSHOT_MILESTONE_MAX } from './chromium-snapshots.js';

/**
 * Chromium historical provider — REAL binaries for Chrome 60 through current.
 *
 * Two-tier source strategy:
 *  - Chrome-for-Testing (CFT) for major ≥113. CFT is the official, stable,
 *    non-geo-blocked source Puppeteer/Playwright use. Resolved via
 *    @puppeteer/browsers `Browser.CHROME`.
 *  - Chromium continuous snapshots for major 60–112. CFT does not publish these
 *    older majors; the real binaries live on the `chromium-browser-snapshots`
 *    bucket keyed by commit-position revision. Resolved via
 *    @puppeteer/browsers `Browser.CHROMIUM` + a vendored milestone→revision
 *    table (see chromium-snapshots.ts).
 *
 * @puppeteer/browsers is an OPTIONAL dependency, dynamically imported so
 * consumers who only need Playwright-managed builds never require it.
 *
 * Honesty contract: if a real binary for the requested version cannot be
 * obtained (no CFT build, no curated revision, or download fails — including the
 * snapshot bucket being geo-blocked in some locations), `install()` throws
 * `HistoricalUnavailableError`. The scanner turns that into an INCONCLUSIVE
 * result for that version — it NEVER substitutes another Chrome build under the
 * requested version's name.
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
      const historical =
        requestedMajor >= SNAPSHOT_MILESTONE_MAX + 1
          ? await this.downloadChromiumForTesting(requestedMajor, cacheDir)
          : await this.downloadChromiumSnapshot(requestedMajor, cacheDir);
      return {
        executablePath: historical.executablePath,
        buildLabel: historical.buildLabel,
        versionType: 'real-major',
        isPlaywrightBuild: false,
        controller: 'playwright',
        limitationNote: null,
      };
    } catch (err) {
      // If a deeper layer already threw the typed error, propagate it as-is so
      // the code/message survive; otherwise wrap the generic failure.
      if (err instanceof HistoricalUnavailableError) throw err;
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

  /** Download a real Chrome-for-Testing build (major ≥113). */
  private async downloadChromiumForTesting(
    major: number,
    cacheDir: string,
  ): Promise<{ executablePath: string; buildLabel: string }> {
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
    if (!/^\d+\.\d+\.\d+\.\d+$/.test(buildId)) {
      throw new HistoricalUnavailableError(
        `Chrome-for-Testing has no build for Chrome ${major}. ` +
          `CFT publishes builds from major ${SNAPSHOT_MILESTONE_MAX + 1} onward; ` +
          `this version was not tested.`,
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

  /**
   * Download a real Chromium continuous-snapshot build (major 60–112). CFT does
   * not publish these older majors; the real binaries live on the snapshot
   * bucket keyed by commit-position revision. @puppeteer/browsers resolves the
   * URL from a numeric revision via `Browser.CHROMIUM`.
   */
  private async downloadChromiumSnapshot(
    major: number,
    cacheDir: string,
  ): Promise<{ executablePath: string; buildLabel: string }> {
    const revision = snapshotRevisionFor(major);
    if (!revision) {
      throw new HistoricalUnavailableError(
        `No curated Chromium snapshot revision for Chrome ${major}. ` +
          `Snapshots are supported for majors 60–${SNAPSHOT_MILESTONE_MAX}; this version was not tested.`,
        'download-failed',
      );
    }

    const { install, computeExecutablePath, Browser, detectBrowserPlatform } =
      await import('@puppeteer/browsers');
    const platform = detectBrowserPlatform();
    if (!platform) throw new Error('Unsupported platform for Chromium snapshot download');

    const cache = path.join(cacheDir, 'snapshots');
    ensureDir(cache);
    const exe = computeExecutablePath({
      browser: Browser.CHROMIUM,
      buildId: `${revision}`,
      platform,
      cacheDir: cache,
    });
    const fullExe = path.isAbsolute(exe) ? exe : path.join(cache, exe);

    const tag = `chromium-${major}`;
    const recordPath = path.join(cacheDir, `${tag}-${INSTALLED_FLAG}`);
    const cached = await readManifest(recordPath);
    if (cached) return cached;

    if (!existsSync(fullExe)) {
      // This downloads from chromium-browser-snapshots/{Platform}/{revision}/.
      // In geo-blocked locations this 403s — caught by the caller and surfaced
      // as HistoricalUnavailableError → INCONCLUSIVE. Never a substitution.
      await install({ browser: Browser.CHROMIUM, buildId: `${revision}`, cacheDir: cache, platform });
    }

    const buildLabel = `Chromium ${major} (snapshot r${revision})`;
    await writeManifest(recordPath, { executablePath: fullExe, buildLabel });
    return { executablePath: fullExe, buildLabel };
  }
}

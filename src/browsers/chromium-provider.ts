import { existsSync } from 'node:fs';
import path from 'node:path';
import type { EngineName } from '../reporting/types.js';
import type { BrowserBinary, BrowserVersion } from './types.js';
import { HistoricalUnavailableError } from './types.js';
import { PlaywrightProvider } from './playwright-provider.js';
import { cleanDir, downloadFile, ensureDir, extractZip, readManifest, writeManifest } from './util.js';
import {
  snapshotRevisionFor,
  probeSnapshotRevision,
  findNearestAvailableSnapshotRevision,
  SNAPSHOT_LINUX_FOLDER,
  SNAPSHOT_MILESTONE_MAX,
} from './chromium-snapshots.js';

/**
 * Chromium historical provider — REAL binaries for Chrome 60 through current.
 *
 * Two-tier source strategy:
 *  - Chrome-for-Testing (CFT) for major ≥113. CFT is the official, stable,
 *    non-geo-blocked source Puppeteer/Playwright use. Resolved via
 *    @puppeteer/browsers `Browser.CHROME`.
 *  - Chromium continuous snapshots for major 60–112. CFT does not publish these
 *    older majors; the real binaries live on the `chromium-browser-snapshots`
 *    bucket keyed by commit-position revision. Resolved via a vendored
 *    milestone→revision table (see chromium-snapshots.ts) PLUS a fallback that
 *    discovers the nearest still-available revision when the curated one has
 *    been pruned from the bucket (see `findNearestAvailableSnapshotRevision`).
 *
 * @puppeteer/browsers is an OPTIONAL dependency, dynamically imported so
 * consumers who only need Playwright-managed builds never require it.
 *
 * Honesty contract: if a real binary for the requested version cannot be
 * obtained (no CFT build, no curated revision, no nearby revision available, or
 * download fails — including the snapshot bucket being geo-blocked in some
 * locations), `install()` throws `HistoricalUnavailableError`. The scanner turns
 * that into an INCONCLUSIVE result for that version — it NEVER substitutes
 * another Chrome build under the requested version's name. The fallback NEVER
 * crosses a milestone boundary: it only picks a revision within the same
 * ~6-week release window as the curated one.
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
   * bucket keyed by commit-position revision.
   *
   * The snapshot bucket continuously prunes old builds, so a curated revision
   * may 404 even though nearby revisions in the same milestone window are still
   * present. This method:
   *   1. Probes the curated revision (HEAD). If it exists, use it.
   *   2. If it was pruned (404), discover the nearest still-available revision
   *      in the same milestone window via outward HEAD probing
   *      (`findNearestAvailableSnapshotRevision`).
   *   3. If the bucket is unreachable (401/403 geo-block, network), fail
   *      immediately without probing further — every nearby revision would be
   *      unreachable too.
   *   4. Downloads + extracts the `chrome-linux.zip` directly (so we control
   *      the exact revision, not just what @puppeteer/browsers would accept).
   *
   * If neither the curated revision nor any nearby one is available, throws
   * `HistoricalUnavailableError` → INCONCLUSIVE. Never substitutes a build from
   * a DIFFERENT milestone (the outward probe stays in-window).
   */
  private async downloadChromiumSnapshot(
    major: number,
    cacheDir: string,
  ): Promise<{ executablePath: string; buildLabel: string }> {
    const curated = snapshotRevisionFor(major);
    if (!curated) {
      throw new HistoricalUnavailableError(
        `No curated Chromium snapshot revision for Chrome ${major}. ` +
          `Snapshots are supported for majors 60–${SNAPSHOT_MILESTONE_MAX}; this version was not tested.`,
        'download-failed',
      );
    }

    // Resolve the actual revision to download: the curated one if it still
    // exists, otherwise the nearest available one in the same milestone window.
    let revision = curated;
    const curatedProbe = await probeSnapshotRevision(curated);
    if (curatedProbe !== 'ok') {
      if (curatedProbe === 'unreachable') {
        // Geo-block / network failure: the whole bucket is unreachable from
        // here. No point probing nearby revisions — they'll fail identically.
        throw new HistoricalUnavailableError(
          `Chromium snapshot bucket is unreachable (geo-blocked or network error) for Chrome ${major}; ` +
            `this version was not tested.`,
          'download-failed',
        );
      }
      // 'pruned' (404) — a nearby revision may still exist; fall back.
      const nearby = await findNearestAvailableSnapshotRevision(curated);
      if (!nearby) {
        throw new HistoricalUnavailableError(
          `Chromium snapshot r${curated} for Chrome ${major} is no longer on the bucket and ` +
            `no nearby revision in the same milestone window is available. This version was not tested.`,
          'download-failed',
        );
      }
      revision = nearby;
    }

    const cache = path.join(cacheDir, 'snapshots');
    ensureDir(cache);
    const extractDir = path.join(cache, `chromium-${major}-${revision}`);
    const fullExe = path.join(extractDir, 'chrome-linux', 'chrome');

    const tag = `chromium-${major}`;
    const recordPath = path.join(cacheDir, `${tag}-${INSTALLED_FLAG}`);
    const cached = await readManifest(recordPath);
    if (cached) return cached;

    if (!existsSync(fullExe)) {
      const zipUrl =
        `https://storage.googleapis.com/chromium-browser-snapshots/` +
        `${SNAPSHOT_LINUX_FOLDER}/${revision}/chrome-linux.zip`;
      const archive = path.join(cache, `chrome-linux-${revision}.zip`);
      try {
        if (!existsSync(archive)) await downloadFile(zipUrl, archive);
        await cleanDir(extractDir);
        extractZip(archive, extractDir);
      } catch (err) {
        // Partial download/extraction must not leave a fake cache hit.
        throw err instanceof Error ? err : new Error(String(err));
      }
    }

    const buildLabel =
      revision === curated
        ? `Chromium ${major} (snapshot r${revision})`
        : `Chromium ${major} (snapshot r${revision}, nearest to curated r${curated})`;
    await writeManifest(recordPath, { executablePath: fullExe, buildLabel });
    return { executablePath: fullExe, buildLabel };
  }
}

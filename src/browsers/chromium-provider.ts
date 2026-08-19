import { existsSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import type { EngineName } from '../reporting/types.js';
import type { BrowserBinary, BrowserInstallOptions, BrowserVersion } from './types.js';
import { HistoricalUnavailableError } from './types.js';
import { PlaywrightProvider } from './playwright-provider.js';
import { cleanDir, downloadFile, ensureDir, extractZip, readManifest, writeManifest } from './util.js';
import type { FetchProgressHandler } from './progress.js';
import { legacyChromeDriverUrls, resolveLegacyChromeDriver } from './chromedriver-matrix.js';
import {
  snapshotRevisionFor,
  probeSnapshotRevision,
  probeSnapshotDriverRevision,
  findNearestAvailableSnapshotRevision,
  SNAPSHOT_LINUX_FOLDER,
  SNAPSHOT_MILESTONE_MAX,
  SNAPSHOT_MILESTONE_MIN,
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

  async install(
    engine: EngineName,
    version: string,
    cacheDir: string,
    onProgress?: FetchProgressHandler,
    options?: BrowserInstallOptions,
  ): Promise<BrowserBinary> {
    if (engine !== 'chromium') {
      return this.playwright.install(engine, version, cacheDir);
    }
    const latest = await this.getLatest(engine);
    const requestedMajor = Number(version);
    const latestMajor = Number(latest.version);
    const controllerPolicy = options?.chromiumController ?? 'auto';
    if (!Number.isNaN(latestMajor) && requestedMajor > latestMajor) {
      throw new HistoricalUnavailableError(
        `Requested Chromium ${requestedMajor} is newer than available Chromium ${latestMajor}; this version was not tested.`,
        'unsupported-version',
      );
    }
    if (controllerPolicy === 'webdriver' && requestedMajor >= SNAPSHOT_MILESTONE_MAX + 1) {
      throw new HistoricalUnavailableError(
        `The WebDriver controller is only supported for snapshot-era Chromium ${SNAPSHOT_MILESTONE_MIN}–${SNAPSHOT_MILESTONE_MAX}; ` +
          `Chromium ${requestedMajor} was not tested.`,
        'no-driver',
      );
    }
    if (!Number.isNaN(latestMajor) && requestedMajor === latestMajor) {
      return {
        engine: 'chromium',
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
          ? await this.downloadChromiumForTesting(requestedMajor, cacheDir, onProgress)
          : await this.downloadChromiumSnapshot(
              requestedMajor,
              cacheDir,
              onProgress,
              (options?.chromiumController ?? 'auto') !== 'playwright',
            );
      const useWebDriver = controllerPolicy === 'webdriver' ||
        (controllerPolicy === 'auto' && requestedMajor <= SNAPSHOT_MILESTONE_MAX);
      if (useWebDriver && !historical.driverPath) {
        throw new HistoricalUnavailableError(
          `No matching ChromeDriver was obtained for Chromium ${requestedMajor}; this version was not tested.`,
          'no-driver',
        );
      }
      return {
        engine: 'chromium',
        executablePath: historical.executablePath,
        buildLabel: historical.buildLabel,
        versionType: 'real-major',
        isPlaywrightBuild: false,
        controller: useWebDriver ? 'webdriver' : 'playwright',
        driverPath: useWebDriver ? historical.driverPath : undefined,
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
    onProgress?: FetchProgressHandler,
  ): Promise<{ executablePath: string; buildLabel: string; driverPath?: string }> {
    const tag = `chromium-${major}`;
    const recordPath = path.join(cacheDir, `${tag}-${INSTALLED_FLAG}`);
    const cached = await readManifest(recordPath);
    if (cached) {
      try {
        verifyChromiumMajor(cached.executablePath, major);
        return cached;
      } catch (err) {
        if (!(err instanceof HistoricalUnavailableError)) throw err;
        // Invalid CFT manifests are cache misses; resolve and reacquire the exact major.
      }
    }

    const { install, computeExecutablePath, Browser, resolveBuildId, detectBrowserPlatform } =
      await import('@puppeteer/browsers');

    const platform = detectBrowserPlatform();
    if (!platform) throw new Error('Unsupported platform for Chrome-for-Testing download');

    const buildId = await resolveBuildId(Browser.CHROME, platform, `${major}`);
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

    if (!existsSync(fullExe)) {
      onProgress?.({ type: 'status', label: `Downloading Chrome for Testing ${buildId}…`, indeterminate: true });
      await install({ browser: Browser.CHROME, buildId, cacheDir: cache, platform });
    }

    const buildLabel = `Chrome for Testing ${buildId}`;
    verifyChromiumMajor(fullExe, major);
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
    onProgress?: FetchProgressHandler,
    requireDriver = false,
  ): Promise<{ executablePath: string; buildLabel: string; driverPath?: string }> {
    const tag = `chromium-${major}`;
    const recordPath = path.join(cacheDir, `${tag}-${INSTALLED_FLAG}`);
    const cached = await readManifest(recordPath);
    if (cached) {
      try {
        verifyChromiumMajor(cached.executablePath, major);
        if (!requireDriver) return cached;
        if (cached.driverPath && existsSync(cached.driverPath)) {
          verifyChromeDriverForMajor(cached.driverPath, major);
          return cached;
        }
      } catch (err) {
        if (!(err instanceof HistoricalUnavailableError)) throw err;
        // Stale manifests from the old milestone table are cache misses. Continue
        // to the corrected revision instead of stopping on the mislabeled binary.
      }
    }

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
          `(Use a VPN only for first time download to be able cache this version) Chromium snapshot downloads are unavailable in your location for Chrome ${major}; ` +
            `this version was not tested.`,
          'download-failed',
        );
      }
      // 'pruned' (404) — the exact curated revision is gone. Surface that to
      // the user, then search for a nearby one that still exists.
      onProgress?.({
        type: 'status',
        label: `Chromium ${major} (r${curated}) is no longer on the bucket — finding a nearby revision…`,
        indeterminate: true,
      });
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

    if (!existsSync(fullExe)) {
      const zipUrl =
        `https://storage.googleapis.com/chromium-browser-snapshots/` +
        `${SNAPSHOT_LINUX_FOLDER}/${revision}/chrome-linux.zip`;
      const archive = path.join(cache, `chrome-linux-${revision}.zip`);
      try {
        if (!existsSync(archive)) {
          onProgress?.({
            type: 'status',
            label: `Downloading Chromium ${major} (r${revision})…`,
          });
          await downloadFile(zipUrl, archive, onProgress);
        }
        onProgress?.({ type: 'status', label: `Extracting Chromium ${major}…`, indeterminate: true });
        await cleanDir(extractDir);
        extractZip(archive, extractDir);
      } catch (err) {
        // Partial download/extraction must not leave a fake cache hit.
        rmSync(archive, { force: true });
        rmSync(extractDir, { recursive: true, force: true });
        throw err instanceof Error ? err : new Error(String(err));
      }
    }

    const buildLabel =
      revision === curated
        ? `Chromium ${major} (snapshot r${revision})`
        : `Chromium ${major} (snapshot r${revision}, nearest to curated r${curated})`;
    verifyChromiumMajor(fullExe, major);
    const driverPath = requireDriver
      ? await this.downloadSnapshotDriver(major, revision, extractDir, cache, onProgress)
      : undefined;
    await writeManifest(recordPath, { executablePath: fullExe, buildLabel, driverPath });
    return { executablePath: fullExe, buildLabel, driverPath };
  }

  private async downloadSnapshotDriver(
    major: number,
    revision: number,
    extractDir: string,
    cacheDir: string,
    onProgress?: FetchProgressHandler,
  ): Promise<string> {
    const driverDir = path.join(extractDir, 'chromedriver');
    const driverCandidates = [
      path.join(driverDir, 'chromedriver'),
      path.join(driverDir, 'chromedriver_linux64', 'chromedriver'),
    ];
    const cachedDriver = driverCandidates.find((candidate) => existsSync(candidate));
    if (cachedDriver) {
      try {
        verifyChromeDriverForMajor(cachedDriver, major);
        return cachedDriver;
      } catch (err) {
        if (!(err instanceof HistoricalUnavailableError)) throw err;
        rmSync(driverDir, { recursive: true, force: true });
      }
    }

    const probe = await probeSnapshotDriverRevision(revision);
    if (probe !== 'ok') {
      const legacy = resolveLegacyChromeDriver(major);
      if (legacy) {
        return this.downloadLegacyChromeDriver(major, legacy.version, driverDir, cacheDir, onProgress);
      }
      throw new HistoricalUnavailableError(
        `No matching ChromeDriver snapshot is available for Chromium ${major} (r${revision}). ` +
          `This version was not tested.`,
        'no-driver',
      );
    }
    const archive = path.join(cacheDir, `chromedriver-linux-${revision}.zip`);
    const url = `https://storage.googleapis.com/chromium-browser-snapshots/` +
      `${SNAPSHOT_LINUX_FOLDER}/${revision}/chromedriver_linux64.zip`;
    try {
      if (!existsSync(archive)) {
        onProgress?.({ type: 'status', label: `Downloading matching ChromeDriver r${revision}…` });
        await downloadFile(url, archive, onProgress);
      }
      await cleanDir(driverDir);
      extractZip(archive, driverDir);
    } catch (err) {
      rmSync(archive, { force: true });
      rmSync(driverDir, { recursive: true, force: true });
      throw err instanceof Error ? err : new Error(String(err));
    }
    const driverPath = driverCandidates.find((candidate) => existsSync(candidate));
    if (!driverPath) {
      throw new HistoricalUnavailableError(
        `Matching ChromeDriver archive r${revision} did not contain an executable. This version was not tested.`,
        'no-driver',
      );
    }
    verifyChromeDriver(driverPath, major);
    return driverPath;
  }

  private async downloadLegacyChromeDriver(
    major: number,
    driverVersion: string,
    driverDir: string,
    cacheDir: string,
    onProgress?: FetchProgressHandler,
  ): Promise<string> {
    const archive = path.join(cacheDir, `chromedriver-linux-${driverVersion}.zip`);
    const driverPath = path.join(driverDir, 'chromedriver');
    let lastError: unknown;
    for (const url of legacyChromeDriverUrls(driverVersion)) {
      try {
        if (!existsSync(archive)) {
          onProgress?.({ type: 'status', label: `Downloading ChromeDriver ${driverVersion} for Chromium ${major}…` });
          await downloadFile(url, archive, onProgress);
        }
        await cleanDir(driverDir);
        extractZip(archive, driverDir);
        verifyLegacyChromeDriver(driverPath, major, driverVersion);
        return driverPath;
      } catch (err) {
        lastError = err;
        rmSync(archive, { force: true });
        rmSync(driverDir, { recursive: true, force: true });
      }
    }
    throw new HistoricalUnavailableError(
      `Could not obtain ChromeDriver ${driverVersion} for Chromium ${major}: ` +
        `${lastError instanceof Error ? lastError.message : String(lastError)}. This version was not tested.`,
      'no-driver',
    );
  }
}

function verifyChromiumMajor(executablePath: string, requestedMajor: number): void {
  const result = spawnSync(executablePath, ['--version'], { encoding: 'utf8', timeout: 10_000 });
  if (result.error || result.status !== 0) {
    const detail = result.error?.message ?? (result.stderr.trim() || `exit status ${result.status}`);
    throw new HistoricalUnavailableError(
      `Could not verify requested Chromium ${requestedMajor} binary at ${executablePath}: ${detail}. ` +
        `This version was not tested.`,
      'download-failed',
    );
  }
  const output = `${result.stdout} ${result.stderr}`.trim();
  const match = output.match(/(?:Chromium|Chrome(?: for Testing)?)\s+(\d+)\./i);
  const actualMajor = match ? Number(match[1]) : null;
  if (actualMajor !== requestedMajor) {
    const actual = actualMajor === null
      ? `an unparseable version (${output || 'no output'})`
      : `Chromium ${actualMajor}`;
    throw new HistoricalUnavailableError(
      `Requested Chromium ${requestedMajor}, but the resolved binary reports ${actual}. ` +
        `This version was not tested.`,
      'download-failed',
    );
  }
}

function verifyChromeDriver(executablePath: string, requestedMajor: number): void {
  const result = spawnSync(executablePath, ['--version'], { encoding: 'utf8', timeout: 10_000 });
  const output = `${result.stdout ?? ''} ${result.stderr ?? ''}`.trim();
  const match = output.match(/ChromeDriver\s+(\d+)\./i);
  if (result.error || result.status !== 0 || Number(match?.[1]) !== requestedMajor) {
    const detail = result.error?.message ?? (output || `exit status ${result.status}`);
    throw new HistoricalUnavailableError(
      `Matching ChromeDriver validation failed for Chromium ${requestedMajor}: ${detail}. ` +
        `This version was not tested.`,
      'no-driver',
    );
  }
}

function verifyChromeDriverForMajor(executablePath: string, requestedMajor: number): void {
  const result = spawnSync(executablePath, ['--version'], { encoding: 'utf8', timeout: 10_000 });
  const output = `${result.stdout ?? ''} ${result.stderr ?? ''}`.trim();
  const majorMatch = output.match(/ChromeDriver\s+(\d+)\./i);
  if (!result.error && result.status === 0 && Number(majorMatch?.[1]) === requestedMajor) return;

  const legacy = resolveLegacyChromeDriver(requestedMajor);
  if (legacy) {
    verifyLegacyChromeDriver(executablePath, requestedMajor, legacy.version);
    return;
  }
  verifyChromeDriver(executablePath, requestedMajor);
}

function verifyLegacyChromeDriver(executablePath: string, requestedMajor: number, expectedVersion: string): void {
  const result = spawnSync(executablePath, ['--version'], { encoding: 'utf8', timeout: 10_000 });
  const output = `${result.stdout ?? ''} ${result.stderr ?? ''}`.trim();
  const valid = !result.error && result.status === 0 && output.includes(`ChromeDriver ${expectedVersion}`);
  if (!valid) {
    const detail = result.error?.message ?? (output || `exit status ${result.status}`);
    throw new HistoricalUnavailableError(
      `ChromeDriver ${expectedVersion} validation failed for Chromium ${requestedMajor}: ${detail}. ` +
        `This version was not tested.`,
      'no-driver',
    );
  }
}

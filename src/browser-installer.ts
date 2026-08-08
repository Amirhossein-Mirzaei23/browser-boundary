import { createWriteStream, existsSync, mkdirSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium, firefox, webkit } from 'playwright';
import type { EngineName } from './types.js';

/**
 * browser-installer.ts
 *
 * Resolves a REAL browser binary for a given (engine, version).
 *
 * This is the crux of the task's hard requirement:
 *   "Do not fake browser versions by changing the User-Agent."
 *
 * Reality of Playwright + historical versions:
 *   - Playwright ships exactly ONE build per engine, pinned to the installed
 *     Playwright release. You cannot `npx playwright install chromium@100`.
 *   - To test genuinely OLD Chrome/Firefox we download the real historical
 *     binary from the official Chromium-for-Testing / Firefox release archives
 *     via @puppeteer/browsers (Chrome) and the Firefox build harness (Firefox),
 *     then hand the path to Playwright via `executablePath`.
 *   - WebKit cannot be sourced historically this way: only Playwright's own
 *     patched WebKit build is CDP-drivable. So for WebKit we can only report
 *     against the current Playwright build (and step across Playwright build
 *     revisions if multiple are installed). This asymmetry is surfaced
 *     explicitly in the report, never hidden.
 */

const INSTALLED_FLAG = 'bc-installed.json';

export interface ResolvedBinary {
  executablePath: string;
  buildLabel: string;
  /** True when this is the current Playwright-managed build (no historical path). */
  isPlaywrightBuild: boolean;
  /** Populated when we could not obtain a true historical binary. */
  limitationNote: string | null;
}

export interface LatestBuildInfo {
  version: string;
  executablePath: string;
  buildLabel: string;
}

/**
 * Resolve the *current* Playwright-managed build for an engine. This is what
 * `npx playwright install <engine>` downloads. Used for the "latest" probe and
 * as the fallback for WebKit historical requests.
 */
export async function getLatestBuild(engine: EngineName): Promise<LatestBuildInfo> {
  const browserType = browserTypeFor(engine);
  // executablePath() resolves the Playwright-managed binary and throws with a
  // helpful message if the build isn't installed yet.
  let executablePath: string;
  try {
    executablePath = browserType.executablePath();
  } catch {
    throw new Error(
      `Playwright ${engine} build not installed. Run: npx playwright install ${engine}`,
    );
  }
  // Launch briefly to read the real version the build reports.
  const browser = await browserType.launch({ headless: true });
  let version: string;
  try {
    version = browser.version();
  } finally {
    await browser.close();
  }
  // browser.version() for Playwright Chromium returns "HeadlessChrome/x.y.z.w";
  // normalise to a readable build label.
  const buildLabel = normaliseBuildLabel(engine, version);
  const major = extractMajor(version);
  return { version: major ?? 'latest', executablePath, buildLabel };
}

/**
 * Resolve a binary for a specific (engine, majorVersion). Returns the real
 * historical binary where possible, or the current Playwright build with a
 * limitation note where not.
 */
export async function resolveBinary(
  engine: EngineName,
  majorVersion: string,
  cacheDir: string,
): Promise<ResolvedBinary> {
  const latest = await getLatestBuild(engine);
  const requestedMajor = Number(majorVersion);

  if (engine === 'webkit') {
    // No historical WebKit binaries are installable/drivable. Be honest.
    return {
      executablePath: latest.executablePath,
      buildLabel: latest.buildLabel,
      isPlaywrightBuild: true,
      limitationNote:
        'Historical WebKit binaries are not installable/drivable via Playwright. ' +
        'Only the current Playwright WebKit build is available; WebKit versions are ' +
        'proxied by Playwright build revisions. Treat WebKit results as "current-only".',
    };
  }

  const latestMajor = Number(latest.version);
  const isLatest = !Number.isNaN(latestMajor) && requestedMajor >= latestMajor;

  if (isLatest) {
    return {
      executablePath: latest.executablePath,
      buildLabel: latest.buildLabel,
      isPlaywrightBuild: true,
      limitationNote: null,
    };
  }

  // Try to obtain a true historical binary.
  try {
    const historical = await downloadHistorical(engine, requestedMajor, cacheDir);
    return {
      executablePath: historical.executablePath,
      buildLabel: historical.buildLabel,
      isPlaywrightBuild: false,
      limitationNote: null,
    };
  } catch (err) {
    // Could not fetch a historical binary (offline, 404, unsupported version).
    // Fall back to latest but mark INCONCLUSIVE so the caller doesn't lie.
    return {
      executablePath: latest.executablePath,
      buildLabel: latest.buildLabel,
      isPlaywrightBuild: true,
      limitationNote:
        `Could not obtain real ${engine} v${requestedMajor} binary: ` +
        `${err instanceof Error ? err.message : String(err)}. ` +
        `Falling back to current build; mark this version INCONCLUSIVE.`,
    };
  }
}

async function downloadHistorical(
  engine: EngineName,
  major: number,
  cacheDir: string,
): Promise<{ executablePath: string; buildLabel: string }> {
  const absCache = path.resolve(cacheDir);
  if (!existsSync(absCache)) mkdirSync(absCache, { recursive: true });

  const tag = `${engine}-${major}`;
  const recordPath = path.join(absCache, `${tag}-${INSTALLED_FLAG}`);

  // Fast path: we already resolved this version before.
  if (existsSync(recordPath)) {
    const rec = JSON.parse(await readFile(recordPath, 'utf8')) as {
      executablePath: string;
      buildLabel: string;
    };
    if (existsSync(rec.executablePath)) {
      return rec;
    }
  }

  if (engine === 'chromium') {
    return downloadChromiumForTesting(major, absCache, recordPath);
  }
  if (engine === 'firefox') {
    return downloadFirefox(major, absCache, recordPath);
  }
  throw new Error(`No historical downloader for engine ${engine}`);
}

/**
 * Use Chrome for Testing (CfT) — the same source Playwright/Puppeteer use —
 * to fetch a real Chrome build for the requested major version.
 */
async function downloadChromiumForTesting(
  major: number,
  cacheDir: string,
  recordPath: string,
): Promise<{ executablePath: string; buildLabel: string }> {
  // @puppeteer/browsers exposes the CfT registry tooling. install() downloads
  // the real matching build for a given `chrome` major version.
  const { install, computeExecutablePath, Browser, resolveBuildId, detectBrowserPlatform } =
    await import('@puppeteer/browsers');

  const platform = detectBrowserPlatform();
  if (!platform) throw new Error('Unsupported platform for Chrome-for-Testing download');

  const buildId = await resolveBuildId(Browser.CHROME, platform, `${major}`);
  const cache = path.join(cacheDir, 'cft');
  const exe = computeExecutablePath({ browser: Browser.CHROME, buildId, platform, cacheDir: cache });
  const fullExe = path.isAbsolute(exe) ? exe : path.join(cache, exe);

  if (!existsSync(fullExe)) {
    await install({
      browser: Browser.CHROME,
      buildId,
      cacheDir: cache,
      platform,
    });
  }

  const buildLabel = `Chrome for Testing ${buildId}`;
  await writeFile(
    recordPath,
    JSON.stringify({ executablePath: fullExe, buildLabel }, null, 2),
  );
  return { executablePath: fullExe, buildLabel };
}

/**
 * Firefox historical binaries: there is no first-party "Firefox for Testing"
 * registry with a stable API. We download the official release archive from
 * archive.mozilla.org for the requested major version and extract it.
 */
async function downloadFirefox(
  major: number,
  cacheDir: string,
  recordPath: string,
): Promise<{ executablePath: string; buildLabel: string }> {
  const dir = path.join(cacheDir, `firefox-${major}`);
  let exe = path.join(dir, 'firefox', 'firefox');
  if (!existsSync(exe)) exe = path.join(dir, 'firefox'); // some layouts

  if (!existsSync(dir)) {
    const url = `https://archive.mozilla.org/pub/firefox/releases/${major}.0/linux-x86_64/en-US/firefox-${major}.0.tar.bz2`;
    if (existsSync(dir)) {
      // partial state; remove by re-creating
    }
    mkdirSync(dir, { recursive: true });
    const archive = path.join(dir, 'firefox.tar.bz2');
    await downloadFile(url, archive);

    // Extract with system tar (bzip2). Available on Ubuntu by default.
    const { execFileSync } = await import('node:child_process');
    execFileSync('tar', ['-xjf', archive, '-C', dir], { stdio: 'inherit' });

    // Re-resolve executable location after extraction.
    exe = existsSync(path.join(dir, 'firefox', 'firefox'))
      ? path.join(dir, 'firefox', 'firefox')
      : path.join(dir, 'firefox');
    if (!existsSync(exe)) {
      throw new Error(`Firefox binary not found after extraction at ${dir}`);
    }
  }

  const buildLabel = `Firefox ${major}.0`;
  await writeFile(recordPath, JSON.stringify({ executablePath: exe, buildLabel }, null, 2));
  return { executablePath: exe, buildLabel };
}

async function downloadFile(url: string, dest: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok || !res.body) {
    throw new Error(`Download failed (${res.status}) for ${url}`);
  }
  const stream = createWriteStream(dest);
  const reader = res.body.getReader();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    stream.write(value);
  }
  await new Promise<void>((resolve, reject) => {
    stream.on('finish', () => resolve());
    stream.on('error', reject);
    stream.end();
  });
}

function browserTypeFor(engine: EngineName) {
  switch (engine) {
    case 'chromium':
      return chromium;
    case 'firefox':
      return firefox;
    case 'webkit':
      return webkit;
  }
}

function extractMajor(version: string): string | null {
  const m = version.match(/(\d+)\./);
  return m ? m[1] : null;
}

function normaliseBuildLabel(engine: EngineName, version: string): string {
  if (engine === 'webkit') {
    // Playwright returns the WebKit/Safari-ish version string directly.
    return `Playwright WebKit (${version})`;
  }
  // Chromium: "HeadlessChrome/124.0.6367.91" → keep build.
  const m = version.match(/Chrome\/([\d.]+)/);
  if (m) return `Chrome ${m[1]}`;
  return version;
}

/** Re-export for tests that want to know the on-disk registry location. */
export function puppeteerRegistryDir(): string {
  return 'browser-cache'; // local cache dir used by this tool
}

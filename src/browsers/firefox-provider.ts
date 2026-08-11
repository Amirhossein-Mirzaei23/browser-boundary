import { existsSync } from 'node:fs';
import path from 'node:path';
import type { EngineName } from '../reporting/types.js';
import type { BrowserBinary, BrowserVersion } from './types.js';
import { HistoricalUnavailableError } from './types.js';
import { PlaywrightProvider } from './playwright-provider.js';
import {
  cleanDir,
  downloadFile,
  ensureDir,
  extractTarBz2,
  extractZip,
  extractTarGz,
  extractTarXz,
  readManifest,
  writeManifest,
} from './util.js';
import {
  GECKODRIVER_ABSOLUTE_FLOOR,
  resolveGeckodriver,
  type GeckodriverCompat,
} from './geckodriver-matrix.js';

const INSTALLED_FLAG = 'mrz-installed.json';

/**
 * Firefox provider — REAL historical binaries via archive.mozilla.org, driven by
 * geckodriver (W3C WebDriver), NOT Playwright.
 *
 * Why not Playwright: Playwright can only drive its OWN patched Firefox build
 * (which contains the Juggler instrumentation protocol). Vanilla release builds
 * from archive.mozilla.org lack Juggler — they launch and exit immediately
 * without responding to any Playwright command (confirmed empirically; see the
 * reverted attempt in commit 142c618). geckodriver speaks Marionette, which IS
 * built into every Firefox ≥48, so it drives the genuine historical binary.
 *
 * Honesty contract: if a real historical binary for the requested version cannot
 * be obtained (below geckodriver's floor, no compatible driver in the matrix,
 * download failure), `install()` throws `HistoricalUnavailableError`. The scanner
 * turns that into an INCONCLUSIVE result for that version — it NEVER substitutes
 * another Firefox version, because a verdict from a different version would be a
 * credibility-breaking lie (testing FF153 and reporting "FF52: PASS").
 */
export class FirefoxProvider {
  private playwright = new PlaywrightProvider();

  async getLatest(engine: EngineName): Promise<BrowserVersion> {
    return this.playwright.getLatest(engine);
  }

  async install(engine: EngineName, version: string, cacheDir: string): Promise<BrowserBinary> {
    if (engine !== 'firefox') {
      return this.playwright.install(engine, version, cacheDir);
    }
    const latest = await this.getLatest(engine);
    const requestedMajor = Number(version);
    const latestMajor = Number(latest.version);
    // Requesting current-or-newer: use the Playwright (Juggler) build directly.
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

    // 1. Below geckodriver's absolute floor — cannot be driven at all.
    if (requestedMajor < GECKODRIVER_ABSOLUTE_FLOOR) {
      throw new HistoricalUnavailableError(
        `Firefox ${requestedMajor} is below geckodriver's supported floor (${GECKODRIVER_ABSOLUTE_FLOOR}); ` +
          `no compatible driver exists. This version was not tested.`,
        'below-floor',
      );
    }

    // 2. Resolve a compatible geckodriver from the matrix. Pure data → resolver.
    const compat = resolveGeckodriver(requestedMajor);
    if (!compat) {
      throw new HistoricalUnavailableError(
        `No geckodriver in the compatibility matrix supports Firefox ${requestedMajor}. ` +
          `This version was not tested.`,
        'no-driver',
      );
    }

    try {
      const firefox = await this.downloadFirefox(requestedMajor, cacheDir);
      const driver = await this.downloadGeckodriver(compat, cacheDir);
      return {
        executablePath: firefox.executablePath,
        buildLabel: `Firefox ${requestedMajor}.0 (archive.mozilla.org)`,
        versionType: 'real-major',
        isPlaywrightBuild: false,
        controller: 'webdriver',
        driverPath: driver.executablePath,
        limitationNote: null,
      };
    } catch (err) {
      throw new HistoricalUnavailableError(
        `Could not obtain real Firefox ${requestedMajor} binary/driver: ` +
          `${err instanceof Error ? err.message : String(err)}. This version was not tested.`,
        'download-failed',
      );
    }
  }

  supportsHistoricalVersions(engine: EngineName): boolean {
    return engine === 'firefox';
  }

  /** Download + extract a historical Firefox release from archive.mozilla.org. */
  private async downloadFirefox(
    major: number,
    cacheDir: string,
  ): Promise<{ executablePath: string; buildLabel: string }> {
    const cache = path.join(cacheDir, 'firefox');
    ensureDir(cache);
    const recordPath = path.join(cacheDir, `firefox-${major}-${INSTALLED_FLAG}`);
    const cached = await readManifest(recordPath);
    if (cached) return cached;

    const candidates = firefoxArchiveUrls(major);
    const extractDir = path.join(cache, `firefox-${major}`);

    // Mozilla switched Linux archives from .tar.bz2 to .tar.xz at some release.
    // Try bz2 first (older), then xz (newer). Whichever exists wins; a 404 is
    // not an error here — it just means that format wasn't published for this
    // version. Only if BOTH fail do we surface the download error.
    let archive = '';
    let ext: 'tar.bz2' | 'tar.xz' = 'tar.bz2';
    let lastErr: unknown = null;
    for (const candidate of candidates) {
      const candidateArchive = path.join(cache, `firefox-${major}.0.${candidate.ext}`);
      try {
        if (!existsSync(candidateArchive)) await downloadFile(candidate.archiveUrl, candidateArchive);
        archive = candidateArchive;
        ext = candidate.ext;
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err;
        // 404 → try the next format; other errors (network, 5xx) → keep trying
        // the next candidate too, but remember the last real failure.
      }
    }
    if (!archive) {
      throw lastErr instanceof Error
        ? lastErr
        : new Error(`No Firefox archive available at archive.mozilla.org for ${major}.0`);
    }

    try {
      await cleanDir(extractDir);
      if (ext === 'tar.bz2') {
        extractTarBz2(archive, extractDir);
      } else {
        extractTarXz(archive, extractDir);
      }
    } catch (err) {
      throw err instanceof Error ? err : new Error(String(err));
    }

    const exe = findFirefoxBinary(extractDir);
    if (!exe || !existsSync(exe)) {
      throw new Error(`Firefox binary not found after extracting ${archive}`);
    }
    const buildLabel = `Firefox ${major}.0 (archive.mozilla.org)`;
    await writeManifest(recordPath, { executablePath: exe, buildLabel });
    return { executablePath: exe, buildLabel };
  }

  /** Download + extract the resolved geckodriver release from GitHub. */
  private async downloadGeckodriver(
    compat: GeckodriverCompat,
    cacheDir: string,
  ): Promise<{ executablePath: string; buildLabel: string }> {
    const cache = path.join(cacheDir, 'geckodriver', compat.geckodriver);
    ensureDir(cache);
    const recordPath = path.join(cache, `geckodriver-${compat.geckodriver}-${INSTALLED_FLAG}`);
    const cached = await readManifest(recordPath);
    if (cached) return cached;

    const { url, ext } = geckodriverAssetUrl(compat.geckodriver);
    const archive = path.join(cache, `geckodriver-${compat.geckodriver}.${ext}`);

    try {
      if (!existsSync(archive)) await downloadFile(url, archive);
      // Extract into the same dir; archives contain one geckodriver binary.
      if (ext === 'zip') extractZip(archive, cache);
      else if (ext === 'tar.gz') extractTarGz(archive, cache);
      else throw new Error(`Unsupported geckodriver archive type: .${ext}`);
    } catch (err) {
      throw err instanceof Error ? err : new Error(String(err));
    }

    const exe = findGeckodriverBinary(cache);
    if (!exe || !existsSync(exe)) {
      throw new Error(`geckodriver binary not found after extracting ${url}`);
    }
    const buildLabel = `geckodriver ${compat.geckodriver}`;
    await writeManifest(recordPath, { executablePath: exe, buildLabel });
    return { executablePath: exe, buildLabel };
  }
}

/**
 * Build candidate archive.mozilla.org URLs for a historical Firefox major.
 *
 * Mozilla switched the Linux archive format from `.tar.bz2` to `.tar.xz` at a
 * certain release. Rather than hardcode a boundary (fragile, shifts over time),
 * we return BOTH candidates and the downloader tries bz2 first, then xz. This
 * works for every release regardless of where the switch fell.
 *
 * Windows/macOS archives are intentionally not supported in v1 — historical
 * Firefox testing targets Linux CI containers. Exported for unit testing (pure).
 */
export function firefoxArchiveUrls(major: number): { archiveUrl: string; ext: 'tar.bz2' | 'tar.xz' }[] {
  const platformDir = 'linux-x86_64';
  const locale = 'en-US';
  const base = `https://archive.mozilla.org/pub/firefox/releases/${major}.0/${platformDir}/${locale}`;
  return [
    { archiveUrl: `${base}/firefox-${major}.0.tar.bz2`, ext: 'tar.bz2' },
    { archiveUrl: `${base}/firefox-${major}.0.tar.xz`, ext: 'tar.xz' },
  ];
}

/**
 * @deprecated kept for backward-compat with earlier tests; delegates to the new
 * multi-format builder's first candidate (tar.bz2).
 */
export function firefoxArchiveUrl(major: number): { archiveUrl: string; ext: string } {
  const first = firefoxArchiveUrls(major)[0];
  return { archiveUrl: first.archiveUrl, ext: first.ext };
}

/** Build the GitHub geckodriver release asset URL for the host platform. Exported (pure). */
export function geckodriverAssetUrl(version: string): { url: string; ext: string } {
  const { token, ext } = geckodriverPlatformAsset();
  const file = `geckodriver-v${version}-${token}.${ext}`;
  return {
    url: `https://github.com/mozilla/geckodriver/releases/download/v${version}/${file}`,
    ext,
  };
}

/**
 * Resolve the geckodriver release asset token + archive extension for the host.
 * Asset naming (verified against the GitHub releases API):
 *   linux x64 → linux64       (NOT linux-linux64)
 *   linux arm64 → linux-aarch64
 *   macos x64 → macos
 *   macos arm64 → macos-aarch64
 *   win x64 → win64 / win arm64 → win-aarch64 / win x86 → win32
 */
function geckodriverPlatformAsset(): { token: string; ext: string } {
  const platform = process.platform;
  const arch = process.arch;
  if (platform === 'linux') {
    if (arch === 'arm64') return { token: 'linux-aarch64', ext: 'tar.gz' };
    if (arch === 'x64') return { token: 'linux64', ext: 'tar.gz' };
    if (arch === 'ia32') return { token: 'linux32', ext: 'tar.gz' };
  }
  if (platform === 'darwin') {
    return { token: arch === 'arm64' ? 'macos-aarch64' : 'macos', ext: 'tar.gz' };
  }
  if (platform === 'win32') {
    if (arch === 'arm64') return { token: 'win-aarch64', ext: 'zip' };
    return { token: arch === 'x64' ? 'win64' : 'win32', ext: 'zip' };
  }
  throw new Error(`Unsupported platform for geckodriver: ${platform}/${arch}`);
}

/** Locate the `firefox` executable inside an extracted archive dir. */
function findFirefoxBinary(root: string): string | null {
  // Archive extracts to a single `firefox/` directory on Linux.
  const candidates = [
    path.join(root, 'firefox', 'firefox'),
    path.join(root, 'firefox'),
  ];
  return candidates.find((p) => existsSync(p)) ?? null;
}

/** Locate the `geckodriver` executable inside an extracted archive dir. */
function findGeckodriverBinary(root: string): string | null {
  const names =
    process.platform === 'win32' ? ['geckodriver.exe'] : ['geckodriver'];
  for (const name of names) {
    const p = path.join(root, name);
    if (existsSync(p)) return p;
  }
  return null;
}

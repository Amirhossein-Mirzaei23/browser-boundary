import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import type { EngineName } from '../reporting/types.js';
import type { BrowserBinary, BrowserVersion } from './types.js';
import { PlaywrightProvider } from './playwright-provider.js';
import { cleanDir, downloadFile, ensureDir, readManifest, writeManifest } from './util.js';

/**
 * Firefox historical provider.
 *
 * Downloads REAL historical Firefox release builds from archive.mozilla.org
 * (official Mozilla release archives), extracts the tarball, and hands the path
 * to Playwright via executablePath. Linux-x86_64/en-US only; requires system
 * `tar`/`bzip2`.
 */
const INSTALLED_FLAG = 'mrz-installed.json';

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
    if (!Number.isNaN(latestMajor) && requestedMajor >= latestMajor) {
      return {
        executablePath: latest.executablePath,
        buildLabel: latest.buildLabel,
        versionType: 'real-major',
        isPlaywrightBuild: true,
        limitationNote: null,
      };
    }

    try {
      const historical = await this.downloadFirefox(requestedMajor, cacheDir);
      return {
        executablePath: historical.executablePath,
        buildLabel: historical.buildLabel,
        versionType: 'real-major',
        isPlaywrightBuild: false,
        limitationNote: null,
      };
    } catch (err) {
      return {
        executablePath: latest.executablePath,
        buildLabel: latest.buildLabel,
        versionType: 'real-major',
        isPlaywrightBuild: true,
        limitationNote:
          `Could not obtain real Firefox v${requestedMajor} binary: ` +
          `${err instanceof Error ? err.message : String(err)}. ` +
          `Falling back to current Playwright build; this version should be marked inconclusive.`,
      };
    }
  }

  supportsHistoricalVersions(engine: EngineName): boolean {
    return engine === 'firefox';
  }

  private async downloadFirefox(
    major: number,
    cacheDir: string,
  ): Promise<{ executablePath: string; buildLabel: string }> {
    const dir = path.join(cacheDir, `firefox-${major}`);
    const tag = `firefox-${major}`;
    const recordPath = path.join(cacheDir, `${tag}-${INSTALLED_FLAG}`);
    const cached = await readManifest(recordPath);
    if (cached) return cached;

    await cleanDir(dir);
    const url = `https://archive.mozilla.org/pub/firefox/releases/${major}.0/linux-x86_64/en-US/firefox-${major}.0.tar.bz2`;
    const archive = path.join(dir, 'firefox.tar.bz2');
    await downloadFile(url, archive);

    // Extract with system tar (bzip2). Available on Ubuntu by default.
    execFileSync('tar', ['-xjf', archive, '-C', dir], { stdio: 'inherit' });

    const exe = existsSync(path.join(dir, 'firefox', 'firefox'))
      ? path.join(dir, 'firefox', 'firefox')
      : path.join(dir, 'firefox');
    if (!existsSync(exe)) {
      throw new Error(`Firefox binary not found after extraction at ${dir}`);
    }

    const buildLabel = `Firefox ${major}.0`;
    ensureDir(cacheDir);
    await writeManifest(recordPath, { executablePath: exe, buildLabel });
    return { executablePath: exe, buildLabel };
  }
}

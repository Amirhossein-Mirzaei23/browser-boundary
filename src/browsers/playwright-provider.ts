import { chromium, firefox, webkit, type BrowserType } from 'playwright';
import type { EngineName } from '../reporting/types.js';
import type { BrowserBinary, BrowserProvider, BrowserVersion } from './types.js';
import type { FetchProgressHandler } from './progress.js';
import { extractMajor, readBrowserVersion } from './util.js';

/**
 * Playwright-managed browser provider.
 *
 * Provides the CURRENT Playwright build for an engine via the standard
 * `npx playwright install <engine>` mechanism. This is the only provider that
 * can drive WebKit (Playwright's patched build), and it serves as the fallback
 * for Chromium/Firefox "latest".
 *
 * Each Playwright release pins exactly ONE build per engine — there is no
 * `playwright install chromium@N`. Historical versions come from the
 * ChromiumProvider / FirefoxProvider instead.
 */
export class PlaywrightProvider {
  /** Get the current Playwright build for an engine. */
  async getLatest(engine: EngineName): Promise<BrowserVersion> {
    const bt = browserTypeFor(engine);
    let executablePath: string;
    try {
      executablePath = bt.executablePath();
    } catch {
      throw new Error(
        `Playwright ${engine} build not installed. Run: npx playwright install ${engine}`,
      );
    }
    const version = await readBrowserVersion(() =>
      bt.launch({ headless: true }),
    );
    const buildLabel = normaliseBuildLabel(engine, version);
    const major = extractMajor(version);
    return {
      version: major ?? 'latest',
      executablePath,
      buildLabel,
      versionType: engine === 'webkit' ? 'playwright-revision' : 'real-major',
    };
  }

  async install(
    engine: EngineName,
    version: string,
    _cacheDir: string,
    _onProgress?: FetchProgressHandler,
  ): Promise<BrowserBinary> {
    // Playwright only has the current build; "install" == resolve latest and
    // compare versions. Used as a fallback when no historical provider applies.
    const latest = await this.getLatest(engine);
    const requestedMajor = Number(version);
    const latestMajor = Number(latest.version);
    const isLatest = Number.isNaN(latestMajor) || Number.isNaN(requestedMajor) || requestedMajor >= latestMajor;
    return {
      engine,
      executablePath: latest.executablePath,
      buildLabel: latest.buildLabel,
      versionType: latest.versionType,
      isPlaywrightBuild: true,
      limitationNote: isLatest
        ? null
        : `Playwright only ships the current ${engine} build (v${latest.version}); a real v${version} binary is not available from this provider.`,
    };
  }

  supportsHistoricalVersions(_engine: EngineName): boolean {
    return false;
  }
}

function browserTypeFor(engine: EngineName): BrowserType {
  switch (engine) {
    case 'chromium':
      return chromium;
    case 'firefox':
      return firefox;
    case 'webkit':
      return webkit;
  }
}

export function playwrightBrowserType(engine: EngineName): BrowserType {
  return browserTypeFor(engine);
}

function normaliseBuildLabel(engine: EngineName, version: string): string {
  if (engine === 'webkit') {
    return `Playwright WebKit (${version})`;
  }
  const m = version.match(/Chrome\/([\d.]+)/);
  if (m) return `Chrome ${m[1]}`;
  return version;
}

// Re-export the interface so consumers can type against it.
export type { BrowserProvider };

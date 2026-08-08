import type { EngineName, VersionType } from '../reporting/types.js';

/**
 * Browser provider abstraction.
 *
 * The scanner never knows HOW a binary was obtained — it asks a provider for a
 * binary for (engine, version) and gets back a path + metadata. This keeps the
 * acquisition details (Playwright-managed builds, Chrome-for-Testing, Firefox
 * archive tarballs) swappable and independently testable.
 */

/** A resolved, ready-to-launch browser binary. */
export interface BrowserBinary {
  executablePath: string;
  buildLabel: string;
  versionType: VersionType;
  /** True when this is the current Playwright-managed build (not a historical fetch). */
  isPlaywrightBuild: boolean;
  /** Populated when a true historical binary could not be obtained. */
  limitationNote: string | null;
}

/** Latest build info for an engine. */
export interface BrowserVersion {
  version: string;
  executablePath: string;
  buildLabel: string;
  versionType: VersionType;
}

export interface BrowserProvider {
  /** Resolve a binary for a specific (engine, version). */
  install(engine: EngineName, version: string, cacheDir: string): Promise<BrowserBinary>;
  /** Resolve the current latest build for an engine. */
  getLatest(engine: EngineName): Promise<BrowserVersion>;
  /** Whether this provider can obtain real historical versions for the engine. */
  supportsHistoricalVersions(engine: EngineName): boolean;
}

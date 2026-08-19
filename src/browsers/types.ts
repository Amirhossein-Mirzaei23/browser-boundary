import type { EngineName, VersionType } from '../reporting/types.js';
import type { FetchProgressHandler } from './progress.js';

/**
 * Browser provider abstraction.
 *
 * The scanner never knows HOW a binary was obtained — it asks a provider for a
 * binary for (engine, version) and gets back a path + metadata. This keeps the
 * acquisition details (Playwright-managed builds, Chrome-for-Testing, Firefox
 * archive tarballs) swappable and independently testable.
 */

/**
 * Which automation controller can drive this binary.
 *  - playwright: driven by Playwright (Chromium via CDP; current Firefox via
 *    Playwright's Juggler patch; current WebKit via Playwright's inspector patch).
 *  - webdriver:  driven by W3C WebDriver via a driver binary (historical Firefox
 *    via geckodriver, since vanilla Firefox builds lack Juggler).
 */
export type ControllerKind = 'playwright' | 'webdriver';
export type ChromiumControllerPolicy = 'auto' | 'playwright' | 'webdriver';

export interface BrowserInstallOptions {
  chromiumController?: ChromiumControllerPolicy;
}

/** A resolved, ready-to-launch browser binary. */
export interface BrowserBinary {
  /** Browser engine this binary belongs to; controllers must not infer it from labels. */
  engine?: EngineName;
  executablePath: string;
  buildLabel: string;
  versionType: VersionType;
  /** True when this is the current Playwright-managed build (not a historical fetch). */
  isPlaywrightBuild: boolean;
  /** Which controller can drive this binary. Defaults to 'playwright'. */
  controller?: ControllerKind;
  /** Path to the driver binary (e.g. geckodriver) when controller === 'webdriver'. */
  driverPath?: string;
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
  /**
   * Resolve a binary for a specific (engine, version). `onProgress` (optional)
   * receives acquisition progress events (status changes, byte counts) — used by
   * the CLI to draw a progress bar during multi-hundred-MB Chromium downloads.
   */
  install(
    engine: EngineName,
    version: string,
    cacheDir: string,
    onProgress?: FetchProgressHandler,
    options?: BrowserInstallOptions,
  ): Promise<BrowserBinary>;
  /** Resolve the current latest build for an engine. */
  getLatest(engine: EngineName): Promise<BrowserVersion>;
  /** Whether this provider can obtain real historical versions for the engine. */
  supportsHistoricalVersions(engine: EngineName): boolean;
}

/**
 * Thrown by a provider when a real historical binary for the requested version
 * genuinely cannot be obtained (below the driver floor, no compatible driver in
 * the matrix, download failed, etc.).
 *
 * CRITICAL honesty contract: the scanner MUST turn this into an INCONCLUSIVE
 * result for the requested version. It MUST NEVER substitute another browser
 * version (e.g. "current") and report a verdict under the requested version's
 * name — that would attribute a real test of e.g. Firefox 153 to Firefox 52.
 */
export class HistoricalUnavailableError extends Error {
  /** Stable machine-readable code for filtering in logs/tests. */
  readonly code: 'below-floor' | 'unsupported-version' | 'no-driver' | 'download-failed';
  constructor(
    message: string,
    code: HistoricalUnavailableError['code'] = 'download-failed',
  ) {
    super(message);
    this.name = 'HistoricalUnavailableError';
    this.code = code;
  }
}

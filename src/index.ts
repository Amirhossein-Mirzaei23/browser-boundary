/**
 * mrz-browser-compat
 *
 * Find the oldest real browser version your website can actually run on.
 * Detects compatibility boundaries across Chromium/Firefox/WebKit using REAL
 * historical browser binaries (Chrome-for-Testing, archive.mozilla.org) — never
 * User-Agent spoofing.
 *
 * @packageDocumentation
 */

// Public API — scanner + convenience
export { BrowserCompatibilityScanner, scan, type ScanProgress } from './core/scanner.js';

// Configuration
export type {
  ScanConfig,
  PageSpec,
  ReadinessSpec,
  SearchStrategy,
  ResourceType,
} from './config/schema.js';
export { DEFAULTS, ConfigError, resolveConfig, toRegExp } from './config/index.js';
export type { ResolvedConfig, ResolvedPage } from './config/resolve.js';

// Browser providers
export type { BrowserBinary, BrowserProvider, BrowserVersion, ControllerKind } from './browsers/types.js';
export { HistoricalUnavailableError } from './browsers/types.js';
export { DefaultBrowserProvider, defaultBrowserProvider } from './browsers/provider.js';
// geckodriver ↔ Firefox compatibility matrix (for advanced consumers / custom providers)
export {
  resolveGeckodriver,
  GECKODRIVER_MATRIX,
  GECKODRIVER_ABSOLUTE_FLOOR,
  type GeckodriverCompat,
} from './browsers/geckodriver-matrix.js';

// Results & reporting
export type {
  ScanResult,
  CheckResult,
  EngineSummary,
  EngineName,
  Verdict,
  Confidence,
  FeatureFinding,
  VersionType,
} from './reporting/types.js';
export { writeJson, writeMarkdown, renderMarkdown } from './reporting/index.js';

// Analysis (for advanced consumers)
export { FEATURE_TABLE, formatVersion, meetsThreshold } from './analysis/index.js';

// Low-level engine pieces
export { runCheck, runCheckWithRetry, type CheckInput } from './core/compatibility-checker.js';
export { searchBoundary, versionRange } from './core/version-search.js';

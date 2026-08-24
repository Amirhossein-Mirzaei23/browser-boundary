/**
 * browser-boundary
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
  ChromiumControllerPolicy,
  ResourceType,
} from './config/schema.js';
export { DEFAULTS, ConfigError, resolveConfig, toRegExp } from './config/index.js';
export type { ResolvedConfig, ResolvedPage } from './config/resolve.js';

// Browser providers
export type { BrowserBinary, BrowserInstallOptions, BrowserProvider, BrowserVersion, ControllerKind } from './browsers/types.js';
export { HistoricalUnavailableError } from './browsers/types.js';
export { DefaultBrowserProvider, defaultBrowserProvider } from './browsers/provider.js';
// geckodriver ↔ Firefox compatibility matrix (for advanced consumers / custom providers)
export {
  resolveGeckodriver,
  GECKODRIVER_MATRIX,
  GECKODRIVER_ABSOLUTE_FLOOR,
  type GeckodriverCompat,
} from './browsers/geckodriver-matrix.js';
export {
  resolveLegacyChromeDriver,
  LEGACY_CHROMEDRIVER_MATRIX,
  type LegacyChromeDriverCompat,
} from './browsers/chromedriver-matrix.js';

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
export type {
  ComparisonState,
  NormalizedReadiness,
  NormalizedRoute,
  NormalizedScanScope,
  BaselineIdentityEvidence,
  BaselineEngineEntry,
  BoundaryBaseline,
} from './baseline/types.js';
export { validateBaseline, BASELINE_SCHEMA_VERSION } from './baseline/schema.js';
export { normalizeScanScope, scopeFingerprint } from './baseline/normalize.js';
export { createBaseline, BaselineCreationError, type BaselineMetadata } from './baseline/create.js';
export { readBaseline, writeBaseline } from './baseline/io.js';
export { compareScanToBaseline, type EngineComparison, type ScanComparison, type ComparisonWarning, type ComparisonEvidenceRef } from './baseline/compare.js';

// Analysis (for advanced consumers)
export { FEATURE_TABLE, formatVersion, meetsThreshold } from './analysis/index.js';

// Low-level engine pieces
export { runCheck, runCheckWithRetry, type CheckInput } from './core/compatibility-checker.js';
export { searchBoundary, versionRange } from './core/version-search.js';

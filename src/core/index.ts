export { BrowserCompatibilityScanner, scan, type ScanProgress } from './scanner.js';
export { runCheck, runCheckWithRetry, type CheckInput } from './compatibility-checker.js';
export { searchBoundary, versionRange, type VersionSearchOptions, type SearchOutcome } from './version-search.js';
export { withRetry, isTransientReason } from './retry.js';

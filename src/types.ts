/**
 * Shared types for the Tabdeal browser-compatibility tester.
 */

/** The three browser engines Playwright can drive. */
export type EngineName = 'chromium' | 'firefox' | 'webkit';

export type Verdict = 'PASS' | 'FAIL' | 'INCONCLUSIVE';

/** A single captured JS error (uncaught / pageerror or critical console error). */
export interface JsError {
  type: 'pageerror' | 'console';
  message: string;
  stack?: string;
  url?: string;
}

export type ConsoleLevel = 'error' | 'warning' | 'info' | 'log';

export interface ConsoleMessage {
  level: ConsoleLevel;
  text: string;
  url?: string;
}

export interface FailedRequest {
  url: string;
  method: string;
  resourceType: string;
  failureText: string | null;
  /** How the analyzer classified this failure (non-fatal analytics vs. app-critical). */
  category: 'analytics' | 'app' | 'font' | 'image' | 'css' | 'js' | 'other';
  fatal: boolean;
}

/**
 * The result of running one (engine, version, page) compatibility check.
 * Every field is JSON-serialisable so the whole scan result can be dumped.
 */
export interface CheckResult {
  engine: EngineName;
  version: string;
  /** Browser build label reported by the launched browser (e.g. chrome version / playwright build). */
  buildLabel: string;
  executablePath: string;
  url: string;
  verdict: Verdict;
  /** Top-level human-readable reason (empty on PASS). */
  reason: string;
  readyMs: number;
  rendered: boolean;
  /** Selectors that were confirmed visible (for traceability). */
  renderedSelectors: string[];
  navigationError: string | null;
  jsErrors: JsError[];
  consoleErrors: ConsoleMessage[];
  failedRequests: FailedRequest[];
  screenshotPath: string | null;
  tracePath: string | null;
  /** Fatal classification produced by error-analyzer, if any. */
  failureFeature: FeatureRequirement | null;
  /** If a real binary could not be obtained/launched for this version. */
  limitationNote: string | null;
  durationMs: number;
}

export interface EngineSummary {
  engine: EngineName;
  latestTested: string | null;
  oldestPassing: string | null;
  firstFailing: string | null;
  /** Versions that could not be evaluated (binary unavailable, launch failed). */
  inconclusive: string[];
  /** Versions that were skipped by the search algorithm. */
  skipped: string[];
  resultLine: string;
  /** The failure reason associated with the first failing version. */
  failureReason: string | null;
  limitationNote: string | null;
}

export interface FeatureRequirement {
  feature: string;
  /** Minimum major version per engine that supports this feature. */
  minVersions: Partial<Record<EngineName, number>>;
  /** A representative error signature that triggered this requirement. */
  evidence: string;
}

export interface ScanResult {
  website: string;
  pages: string[];
  startedAt: string;
  finishedAt: string;
  config: ScanConfigSnapshot;
  results: CheckResult[];
  summaries: EngineSummary[];
  featureFindings: FeatureRequirement[];
}

export interface ScanConfigSnapshot {
  timeoutMs: number;
  headed: boolean;
  latestOnly: boolean;
  stepSize: number;
  versionFloor: Partial<Record<EngineName, number>>;
}

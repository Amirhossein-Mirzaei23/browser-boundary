/**
 * Public result & types model for browser-boundary.
 *
 * Design principle: HONESTY over false precision.
 *  - We report *verified* boundaries, never claim a whole supported/unsupported
 *    range for versions we did not actually test.
 *  - WebKit is never reported as a specific Safari version we cannot prove; it
 *    carries an explicit versionType of 'playwright-revision'.
 *  - Infrastructure failures (browser won't launch) are 'error', not 'fail'.
 */

/** Browser engines Playwright can drive. */
export type EngineName = 'chromium' | 'firefox' | 'webkit';

/**
 * Compatibility verdict for a single (engine, version, page) check.
 *  - pass:          page loaded and all enabled checks succeeded
 *  - fail:          a real compatibility failure (JS syntax/feature, app-critical
 *                    network failure, missing render) was detected
 *  - inconclusive:  we could not determine compatibility (e.g. anti-bot/WAF
 *                    stall, transient timeout, browser launch issue we retried)
 *  - error:         infrastructure error (binary unavailable, browser would not
 *                    launch, host missing libs) — distinct from 'fail' so CI can
 *                    separate infra problems from real compat failures
 *  - skipped:       not evaluated (e.g. outside the search range, or implied by
 *                    an established boundary)
 */
export type Verdict = 'pass' | 'fail' | 'inconclusive' | 'error' | 'skipped';

/**
 * Confidence in a feature attribution. Older-browser failures are not always
 * cleanly attributable to a single ES/Web feature; we never pretend certainty.
 */
export type Confidence = 'high' | 'medium' | 'low' | 'unknown';

/**
 * How a version string should be interpreted in reports.
 *  - real-major:           a genuine historical browser major (Chrome 114, Firefox 102)
 *  - playwright-revision:  a Playwright-managed build revision (WebKit), NOT a
 *                           Safari version. Never stringify as "Safari N".
 */
export type VersionType = 'real-major' | 'playwright-revision';

/** Captured uncaught / pageerror or critical console error. */
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

/** A network request that failed, with its classification + fatality. */
export interface FailedRequest {
  url: string;
  method: string;
  resourceType: string;
  failureText: string | null;
  category: 'analytics' | 'app' | 'font' | 'image' | 'css' | 'js' | 'other';
  fatal: boolean;
}

/** A feature attribution produced by the analyzer. */
export interface FeatureFinding {
  feature: string;
  confidence: Confidence;
  /** Minimum engine version (engine-specific string, e.g. "114") supporting the feature. */
  minVersions: Partial<Record<EngineName, string>>;
  /** The actual error text that triggered the attribution. */
  evidence: string;
}

/** The signals collected for one (engine, version, page) check. */
export interface CheckSignals {
  navigationError: string | null;
  jsErrors: JsError[];
  consoleErrors: ConsoleMessage[];
  failedRequests: FailedRequest[];
  rendered: boolean;
  renderedSelectors: string[];
  readyMs: number;
}

/** Artifact paths for one check (null when not produced). */
export interface CheckArtifacts {
  screenshotPath: string | null;
  tracePath: string | null;
}

/**
 * Verified identity evidence for one check: what was requested, what the
 * on-disk executable reports, and what the live session reports. A check is
 * only trustworthy when these agree (within the correct version domain).
 */
export interface BrowserIdentityEvidence {
  requestedVersion: string;
  requestedEngine: EngineName;
  executableVersion: string | null;
  executableEngine: string | null;
  runtimeVersion: string | null;
  runtimeEngine: string | null;
  executableMethod: string;
  runtimeMethod: string;
  verified: boolean;
  mismatchReason: string | null;
}

/** The full result of one (engine, version, page) check. */
export interface CheckResult {
  engine: EngineName;
  version: string;
  versionType: VersionType;
  buildLabel: string;
  executablePath: string;
  url: string;
  verdict: Verdict;
  reason: string;
  identity: BrowserIdentityEvidence;
  controller: 'playwright' | 'webdriver';
  signals: CheckSignals;
  artifacts: CheckArtifacts;
  /** Feature attribution, if any (may be present even on inconclusive results). */
  finding: FeatureFinding | null;
  limitationNote: string | null;
  durationMs: number;
}

/** Aggregated summary for one engine across the whole search. */
export interface EngineSummary {
  engine: EngineName;
  versionType: VersionType;
  /** Versions that were actually evaluated (verdict != skipped). */
  tested: string[];
  latestTested: string | null;
  /** Oldest version we actually observed passing. */
  oldestVerifiedPassing: string | null;
  /** Newest version we actually observed failing. */
  firstVerifiedFailing: string | null;
  /** How confident we are that the reported boundary is the true boundary. */
  boundaryConfidence: Confidence;
  /** Versions we could not evaluate (binary unavailable, would not launch, WAF stall). */
  inconclusive: string[];
  /** Versions not evaluated because the established boundary implies them. */
  skipped: string[];
  /** A one-line human summary, e.g. "verified PASS >= 111; verified FAIL at 110". */
  resultLine: string;
  /** Reason attached to the first verified failing version, if any. */
  failureReason: string | null;
  limitationNote: string | null;
}

/** Snapshot of the configuration that produced a scan (for reproducibility). */
export interface ScanConfigSnapshot {
  timeoutMs: number;
  headed: boolean;
  latestOnly: boolean;
  /** True when this scan is a quick current-browser proof, not boundary discovery. */
  quick: boolean;
  strategy: string;
  stepSize: number;
  versionFloor: Partial<Record<EngineName, number>>;
}

/** The complete output of one scan. */
export interface ScanResult {
  /** Best-effort site label (first URL's origin, or a provided siteName). */
  website: string;
  pages: string[];
  startedAt: string;
  finishedAt: string;
  config: ScanConfigSnapshot;
  results: CheckResult[];
  summaries: EngineSummary[];
  featureFindings: FeatureFinding[];
}

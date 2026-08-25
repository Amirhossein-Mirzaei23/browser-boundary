import type { EngineName, VersionType } from '../reporting/types.js';

/**
 * Versioned baseline domain model (schema version 1).
 *
 * A baseline is an ACCEPTED boundary: the verified evidence a later scan is
 * compared against. Conservative evidence semantics apply everywhere — an
 * engine entry may only record verified pass/fail evidence, and comparison
 * never treats inconclusive/error/missing evidence as a regression.
 */

/** Outcome of comparing a scan against a baseline, per engine. */
export type ComparisonState =
  | 'improved'
  | 'unchanged'
  | 'regressed'
  | 'inconclusive'
  | 'unbaselined'
  | 'not-compared';

/** Normalized readiness policy for one route (function readiness is non-portable). */
export type NormalizedReadiness =
  | { kind: 'selectors'; selectors: string[]; mode: 'any' | 'all' }
  | { kind: 'none' }
  | { kind: 'non-portable-function' };

export interface NormalizedRoute {
  /** Absolute URL of the route. */
  url: string;
  label: string;
  readiness: NormalizedReadiness;
}

/**
 * Canonical, machine-comparable description of what a scan measured —
 * everything that materially affects the boundary, nothing that does not
 * (no paths, timestamps, or artifacts). Task 10 defines canonicalization.
 */
export interface NormalizedScanScope {
  /** Sorted by (label, url). */
  routes: NormalizedRoute[];
  checks: {
    navigation: boolean;
    javascript: boolean;
    console: boolean;
    network: boolean;
    rendering: boolean;
    readiness: boolean;
  };
  /** Sorted. */
  engines: EngineName[];
  controllerPolicy: 'auto' | 'playwright' | 'webdriver';
  minConfidence: 'high' | 'medium' | 'low' | 'unknown';
  floors: Partial<Record<EngineName, number>>;
  /** Regex source strings, normalized deterministically. */
  ignoredPatterns: string[];
  criticalResourceTypes: string[];
  timeoutMs: number;
  waitUntil: 'domcontentloaded' | 'load';
  viewport: { width: number; height: number };
  /** Non-portable/unsupported scope properties for comparison diagnostics. */
  nonPortable: string[];
}

/** Identity evidence retained in a baseline entry (slimmed from the scan). */
export interface BaselineIdentityEvidence {
  requestedVersion: string;
  runtimeVersion: string | null;
  executableVersion: string | null;
  verified: boolean;
  mismatchReason: string | null;
}

/** One engine's ACCEPTED boundary evidence. */
export interface BaselineEngineEntry {
  engine: EngineName;
  versionType: VersionType;
  /** Oldest version actually observed passing; null when none was observed. */
  oldestVerifiedPassing: string | null;
  /** Newest version older than oldestVerifiedPassing actually observed failing. */
  firstVerifiedFailing: string | null;
  failureReason: string | null;
  testedVersions: string[];
  inconclusiveVersions: string[];
  /** Browser source/build label (e.g. "Chrome for Testing 121.0.6167.184"). */
  browserSource: string;
  controller: 'playwright' | 'webdriver';
  os: string;
  arch: string;
  identity: BaselineIdentityEvidence;
}

/** The accepted boundary artifact (schema version 1). */
export interface BoundaryBaseline {
  schemaVersion: 1;
  /** ISO-8601 UTC timestamp. */
  createdAt: string;
  application?: { id?: string; revision?: string };
  packageVersion: string;
  /** sha256 hex digest of the canonical NormalizedScanScope (Task 10). */
  configFingerprint: string;
  scope: NormalizedScanScope;
  engines: BaselineEngineEntry[];
}

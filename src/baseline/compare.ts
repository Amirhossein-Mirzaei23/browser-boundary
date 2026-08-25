import type {
  BaselineEngineEntry,
  BoundaryBaseline,
  ComparisonState,
} from './types.js';
import type { EngineName, EngineSummary, ScanResult, VersionType } from '../reporting/types.js';

/**
 * Conservative per-engine comparison of a scan against an ACCEPTED baseline
 * (Task 12). Pure: no filesystem, CLI, or reporter dependencies. The baseline
 * is never mutated.
 *
 * Honesty contract:
 *  - a REGRESSION requires both a newer current floor AND verified
 *    compatibility-failure evidence relevant to the accepted baseline — the
 *    absence of a pass is never enough;
 *  - inconclusive/error/missing/skipped/infrastructure-only evidence is never
 *    a verified regression;
 *  - real majors and Playwright WebKit revisions live in different version
 *    domains and are never compared.
 */

export interface ComparisonWarning {
  code: 'scope-drift' | 'version-domain-mismatch' | 'non-portable-scope';
  message: string;
}

/** Reference to the concrete evidence behind a comparison decision. */
export interface ComparisonEvidenceRef {
  kind: 'baseline' | 'current';
  engine: EngineName;
  version: string | null;
  verdict: 'pass' | 'fail';
  url?: string;
}

export interface EngineComparison {
  engine: EngineName;
  versionType: VersionType;
  state: ComparisonState;
  baselineBoundary: string | null;
  currentBoundary: string | null;
  reasonCode: string;
  message: string;
  comparable: boolean;
  warnings: ComparisonWarning[];
  evidence: ComparisonEvidenceRef[];
}

export interface ScanComparison {
  /** Display-only aggregate; per-engine states are authoritative. */
  overall: ComparisonState;
  scopeMatch: boolean;
  baselineFingerprint: string;
  currentFingerprint: string;
  engines: EngineComparison[];
}

const num = (v: string | null): number | null => (v === null ? null : Number(v));

export function compareScanToBaseline(baseline: BoundaryBaseline, scan: ScanResult): ScanComparison {
  const warnings = new Map<string, ComparisonWarning[]>();
  const scopeMatch = baseline.configFingerprint === scan.configFingerprint;
  if (!scopeMatch) {
    const routesDiffer =
      JSON.stringify(baseline.scope.routes.map((r) => r.url).sort()) !==
      JSON.stringify(scan.scope.routes.map((r) => r.url).sort());
    const severity = routesDiffer ? 'routes' : 'configuration';
    const w: ComparisonWarning = {
      code: 'scope-drift',
      message:
        routesDiffer
          ? `scope drift: scanned routes differ from the accepted baseline (${severity}); comparison is not reliable`
          : `scope drift: scan configuration differs from the accepted baseline (fingerprint mismatch); boundary comparison may not be reliable`,
    };
    for (const engine of allEngines(baseline, scan)) warnings.set(engine, [w]);
  }
  const nonPortable = scan.scope.nonPortable;
  if (nonPortable.length) {
    const w: ComparisonWarning = {
      code: 'non-portable-scope',
      message: `non-portable scope properties: ${nonPortable.join('; ')}`,
    };
    for (const engine of allEngines(baseline, scan)) {
      warnings.set(engine, [...(warnings.get(engine) ?? []), w]);
    }
  }

  const engines = allEngines(baseline, scan).map((engine) =>
    compareEngine(engine, baseline, scan, warnings.get(engine) ?? [], scopeMatch),
  );

  return {
    overall: aggregate(engines),
    scopeMatch,
    baselineFingerprint: baseline.configFingerprint,
    currentFingerprint: scan.configFingerprint,
    engines,
  };
}

function allEngines(baseline: BoundaryBaseline, scan: ScanResult): EngineName[] {
  const names = new Set<EngineName>([
    ...baseline.engines.map((e) => e.engine),
    ...scan.summaries.map((s) => s.engine),
  ]);
  return [...names];
}

function compareEngine(
  engine: EngineName,
  baseline: BoundaryBaseline,
  scan: ScanResult,
  warnings: ComparisonWarning[],
  scopeMatch: boolean,
): EngineComparison {
  const entry = baseline.engines.find((e) => e.engine === engine);
  const summary = scan.summaries.find((s) => s.engine === engine);
  const versionType = (summary?.versionType ?? entry?.versionType ?? 'real-major') as VersionType;

  const base: Omit<EngineComparison, 'state' | 'reasonCode' | 'message' | 'comparable'> = {
    engine,
    versionType,
    baselineBoundary: entry?.oldestVerifiedPassing ?? null,
    currentBoundary: summary?.oldestVerifiedPassing ?? null,
    warnings,
    evidence: [],
  };
  if (entry) {
    base.evidence.push({ kind: 'baseline', engine, version: entry.oldestVerifiedPassing, verdict: 'pass' });
    if (entry.firstVerifiedFailing) {
      base.evidence.push({ kind: 'baseline', engine, version: entry.firstVerifiedFailing, verdict: 'fail' });
    }
  }

  // Engine absent from the current scan.
  if (!summary) {
    return { ...base, state: 'not-compared', reasonCode: 'engine-not-in-scan', message: `engine ${engine} was not scanned`, comparable: false };
  }
  // Engine absent from the baseline.
  if (!entry) {
    const verified = summary.oldestVerifiedPassing !== null || summary.firstVerifiedFailing !== null;
    return verified
      ? { ...base, state: 'unbaselined', reasonCode: 'no-baseline-entry', message: `engine ${engine} has verified evidence but no accepted baseline entry`, comparable: false }
      : { ...base, state: 'inconclusive', reasonCode: 'infrastructure-only', message: `engine ${engine} produced no verified evidence and has no baseline entry`, comparable: false };
  }
  // Version-domain mismatch is never comparable (real majors ≠ revisions).
  if (entry.versionType !== summary.versionType) {
    return {
      ...base,
      state: 'not-compared',
      reasonCode: 'version-domain-mismatch',
      message: `baseline records ${entry.versionType} but scan reports ${summary.versionType}; version domains are never compared`,
      comparable: false,
      warnings: [...warnings, { code: 'version-domain-mismatch', message: `${engine}: mismatched version domains are never compared as numbers` }],
    };
  }

  // Current engine produced no verified evidence at all.
  if (summary.oldestVerifiedPassing === null) {
    return { ...base, state: 'inconclusive', reasonCode: 'infrastructure-only', message: `engine ${engine} produced only inconclusive/error evidence in the current scan`, comparable: false };
  }
  base.evidence.push({ kind: 'current', engine, version: summary.oldestVerifiedPassing, verdict: 'pass' });
  if (summary.firstVerifiedFailing) {
    base.evidence.push({ kind: 'current', engine, version: summary.firstVerifiedFailing, verdict: 'fail' });
  }

  // Material scope drift (route set changed) makes boundary states unreliable.
  if (!scopeMatch && warnings.some((w) => /routes differ/.test(w.message))) {
    return { ...base, state: 'inconclusive', reasonCode: 'scope-drift', message: `engine ${engine}: scanned routes differ from the accepted baseline; boundary comparison is inconclusive`, comparable: false };
  }

  const baselineFloor = num(entry.oldestVerifiedPassing);
  const currentFloor = num(summary.oldestVerifiedPassing);
  // Baseline accepted a fail-only entry: a current pass is an improvement.
  if (baselineFloor === null) {
    return { ...base, state: 'improved', reasonCode: 'boundary-improved', message: `current scan verified a passing ${engine} where the baseline had none`, comparable: true };
  }

  if (currentFloor! < baselineFloor) {
    return { ...base, state: 'improved', reasonCode: 'boundary-improved', message: `verified passing floor moved older: ${baselineFloor} -> ${currentFloor}`, comparable: true };
  }
  if (currentFloor === baselineFloor) {
    return { ...base, state: 'unchanged', reasonCode: 'boundary-unchanged', message: `verified passing floor unchanged at ${baselineFloor}`, comparable: true };
  }

  // Newer floor: a regression needs verified failure evidence at/above the baseline floor.
  const firstFail = num(summary.firstVerifiedFailing);
  if (summary.firstVerifiedFailing !== null && firstFail !== null && firstFail >= baselineFloor) {
    return {
      ...base,
      state: 'regressed',
      reasonCode: 'verified-regression',
      message: `verified passing floor moved newer (${baselineFloor} -> ${currentFloor}) with a verified failure at ${summary.firstVerifiedFailing}: ${summary.failureReason ?? 'no reason recorded'}`,
      comparable: true,
    };
  }
  return {
    ...base,
    state: 'inconclusive',
    reasonCode: 'newer-floor-without-verified-failure',
    message: `verified passing floor moved newer (${baselineFloor} -> ${currentFloor}) without a relevant verified failure; absence of a pass is never a regression`,
    comparable: false,
  };
}

/** Display-only aggregate; never hides per-engine detail (callers read `engines`). */
function aggregate(engines: EngineComparison[]): ComparisonState {
  if (engines.some((e) => e.state === 'regressed')) return 'regressed';
  if (engines.some((e) => e.state === 'improved')) return 'improved';
  const compared = engines.filter((e) => e.comparable);
  if (compared.length > 0 && compared.every((e) => e.state === 'unchanged')) return 'unchanged';
  if (engines.every((e) => e.state === 'not-compared')) return 'not-compared';
  return 'inconclusive';
}

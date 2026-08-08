import type {
  CheckResult,
  Confidence,
  ConsoleMessage,
  EngineName,
  FailedRequest,
  FeatureFinding,
  JsError,
  Verdict,
} from '../reporting/types.js';
import { FEATURE_TABLE, type FeatureRow, formatVersion } from './feature-database.js';
import { meetsThreshold } from './confidence.js';

/**
 * error-analyzer.ts
 *
 * Turns collected signals into a verdict + reason + optional FeatureFinding.
 *
 * Key correctness rules:
 *  1. An error is only attributed to an ES/Web feature if a table signature
 *     matches AND its confidence meets the configured threshold.
 *  2. A generic runtime error (e.g. "Cannot read properties of undefined") is
 *     NOT attributed to any feature — it is almost always an app bug. It still
 *     produces a FAIL verdict for a pageerror (the page threw), but with
 *     confidence 'unknown' so consumers know not to trust the attribution.
 *  3. Console warnings are NEVER fatal. Console errors are fatal only when the
 *     analyzer maps them to a known feature (otherwise they're recorded only).
 *  4. Failed analytics/image/other requests are NEVER fatal.
 */

export interface Analysis {
  verdict: Verdict;
  reason: string;
  finding: FeatureFinding | null;
}

export function matchFeature(
  text: string,
  kind: 'js' | 'net',
  threshold: Confidence,
): FeatureFinding | null {
  const lower = text.toLowerCase();
  for (const row of FEATURE_TABLE) {
    if (row.kind !== kind) continue;
    if (meetsThreshold(row.confidence, threshold) && row.signatures.some((re) => re.test(lower))) {
      return {
        feature: row.feature,
        confidence: row.confidence,
        minVersions: stringifyVersions(row),
        evidence: text,
      };
    }
  }
  return null;
}

function stringifyVersions(row: FeatureRow): Partial<Record<EngineName, string>> {
  const out: Partial<Record<EngineName, string>> = {};
  for (const eng of ['chromium', 'firefox', 'webkit'] as EngineName[]) {
    const v = row.minVersions[eng];
    if (v !== undefined) out[eng] = formatVersion(v);
  }
  return out;
}

/**
 * Analyse all collected signals and produce a verdict/reason/finding.
 *
 * Fatal priority: navigationError → JS errors → fatal network → rendering.
 */
export function analyzeSignals(
  navigationError: string | null,
  jsErrors: JsError[],
  consoleErrors: ConsoleMessage[],
  failedRequests: FailedRequest[],
  rendered: boolean,
  threshold: Confidence,
  renderError: string | null,
): Analysis {
  if (navigationError) {
    return { verdict: 'fail', reason: `Navigation error: ${navigationError}`, finding: null };
  }

  // pageerror: always fatal (the page threw). Attribute a feature only if we
  // can identify one above threshold; otherwise mark confidence 'unknown'.
  for (const err of jsErrors) {
    const finding = matchFeature(err.message, 'js', threshold);
    if (finding) {
      return {
        verdict: 'fail',
        reason: `JavaScript ${err.type} error: ${err.message}`,
        finding,
      };
    }
    if (err.type === 'pageerror') {
      return {
        verdict: 'fail',
        reason: `Uncaught JavaScript error (likely an app bug, not a compat issue): ${err.message}`,
        finding: { feature: 'unknown application error', confidence: 'unknown', minVersions: {}, evidence: err.message },
      };
    }
  }

  // Console errors: fatal only when a feature is identified.
  for (const msg of consoleErrors) {
    if (msg.level !== 'error') continue;
    const finding = matchFeature(msg.text, 'js', threshold);
    if (finding) {
      return { verdict: 'fail', reason: `Console error: ${msg.text}`, finding };
    }
  }

  const fatalReq = failedRequests.find((r) => r.fatal);
  if (fatalReq) {
    return {
      verdict: 'fail',
      reason: `Failed app request [${fatalReq.category}] ${fatalReq.url}: ${fatalReq.failureText ?? 'unknown'}`,
      finding: matchFeature(fatalReq.url, 'net', threshold),
    };
  }

  if (renderError) {
    return { verdict: 'fail', reason: `Readiness failure: ${renderError}`, finding: null };
  }
  if (!rendered) {
    return {
      verdict: 'fail',
      reason: 'Page did not render required application content (readiness gate not satisfied).',
      finding: null,
    };
  }

  return { verdict: 'pass', reason: '', finding: null };
}

/**
 * Collapse per-version feature findings into the report's findings table,
 * keeping the strictest min version per feature per engine.
 */
export function aggregateFeatureFindings(results: CheckResult[]): FeatureFinding[] {
  const byFeature = new Map<string, FeatureFinding>();
  for (const r of results) {
    const f = r.finding;
    if (!f || f.confidence === 'unknown') continue;
    const existing = byFeature.get(f.feature);
    if (!existing) {
      byFeature.set(f.feature, { ...f, minVersions: { ...f.minVersions } });
      continue;
    }
    for (const eng of ['chromium', 'firefox', 'webkit'] as EngineName[]) {
      const a = existing.minVersions[eng];
      const b = f.minVersions[eng];
      // keep the higher version requirement
      if (b && (!a || Number(b) > Number(a))) existing.minVersions[eng] = b;
    }
  }
  return [...byFeature.values()];
}

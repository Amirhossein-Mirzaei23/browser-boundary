import { readFileSync } from 'node:fs';
import { readBaseline } from '../baseline/index.js';
import { compareScanToBaseline, type ScanComparison } from '../baseline/compare.js';
import type { ScanResult } from '../reporting/types.js';
import { EXIT } from './exit-codes.js';

/**
 * `compare` command adapter (Task 14). Compares a current scan report with an
 * accepted baseline; with `--gate`, fails (exit 1) ONLY for verified
 * regressions. The baseline file is never written.
 */

export interface CompareOptions {
  baseline: string;
  current: string;
  gate: boolean;
  /** When set, comparison.json/comparison.md are written to this directory. */
  output?: string;
}

export async function runCompare(options: CompareOptions): Promise<number> {
  const baselineResult = readBaseline(options.baseline);
  if (!baselineResult.ok) {
    console.error(`Configuration error: invalid baseline ${options.baseline}:\n  ${baselineResult.errors.join('\n  ')}`);
    return EXIT.CONFIG_ERROR;
  }

  let scan: ScanResult;
  try {
    scan = JSON.parse(readFileSync(options.current, 'utf8')) as ScanResult;
  } catch (err) {
    console.error(`Configuration error: could not read current report ${options.current}: ${err instanceof Error ? err.message : String(err)}`);
    return EXIT.CONFIG_ERROR;
  }
  if (!scan || !Array.isArray(scan.summaries) || !scan.scope || !scan.configFingerprint) {
    console.error(`Configuration error: ${options.current} is not a browser-boundary scan report.`);
    return EXIT.CONFIG_ERROR;
  }

  const comparison = compareScanToBaseline(baselineResult.baseline, scan);
  printComparison(comparison, options.gate);

  if (options.output) {
    const { writeComparisonJson, writeComparisonMarkdown } = await import('../reporting/index.js');
    console.log('\nReports:');
    console.log(`  ${writeComparisonJson(comparison, options.output)}`);
    console.log(`  ${writeComparisonMarkdown(comparison, options.output)}`);
  }

  // GitHub-native summary: appended only when running under GitHub Actions
  // ($GITHUB_STEP_SUMMARY is set by the runner); never alters semantics.
  const { appendGithubStepSummary } = await import('../reporting/github-summary.js');
  appendGithubStepSummary(comparison);

  const regressed = comparison.engines.some((e) => e.state === 'regressed');
  if (regressed && options.gate) {
    console.error('\nRegression gate FAILED: verified regression against the accepted baseline.');
    return EXIT.COMPAT_FAIL;
  }
  if (regressed) {
    console.log('\nRegression gate not requested (--gate); verified regression reported without failing the command.');
  }
  return EXIT.OK;
}

function printComparison(comparison: ScanComparison, gate: boolean): void {
  console.log('browser-boundary compare');
  console.log('------------------------');
  console.log(`scope:    ${comparison.scopeMatch ? 'matches baseline' : 'DRIFTED (fingerprint differs)'}`);
  for (const e of comparison.engines) {
    console.log(
      `  ${e.engine.padEnd(8)} ${e.state.padEnd(13)} baseline=${e.baselineBoundary ?? '—'} current=${e.currentBoundary ?? '—'} (${e.reasonCode})`,
    );
    if (e.message) console.log(`           ${e.message}`);
    for (const w of e.warnings) console.log(`           warning[${w.code}]: ${w.message}`);
  }
  console.log(`overall:  ${comparison.overall}${gate ? ' (gate mode: verified regressions fail)' : ''}`);
}

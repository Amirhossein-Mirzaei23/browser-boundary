import { readFileSync } from 'node:fs';
import { createBaseline, BaselineCreationError, writeBaseline } from '../baseline/index.js';
import type { ScanResult } from '../reporting/types.js';

/**
 * `baseline create` command adapter (Task 13). Thin: loads and validates the
 * completed scan report, accepts it as a baseline explicitly, and never
 * overwrites an existing baseline without --force. Comparison commands never
 * rewrite the baseline file.
 */

export interface BaselineCreateOptions {
  from: string;
  output: string;
  force: boolean;
  application?: { id?: string; revision?: string };
}

/** Exit codes mirror the main CLI: 0 ok, 2 configuration/invalid-input error. */
export async function runBaselineCreate(options: BaselineCreateOptions): Promise<number> {
  let scan: ScanResult;
  try {
    scan = JSON.parse(readFileSync(options.from, 'utf8')) as ScanResult;
  } catch (err) {
    console.error(`Configuration error: could not read scan report ${options.from}: ${err instanceof Error ? err.message : String(err)}`);
    return 2;
  }
  if (!scan || !Array.isArray(scan.summaries) || !Array.isArray(scan.results) || !scan.scope || !scan.configFingerprint) {
    console.error(`Configuration error: ${options.from} is not a browser-boundary scan report (missing summaries/results/scope/configFingerprint).`);
    return 2;
  }

  let baseline;
  try {
    baseline = createBaseline(scan, options.application ? { application: options.application } : undefined);
  } catch (err) {
    if (err instanceof BaselineCreationError) {
      console.error(`Configuration error: ${err.message}`);
      return 2;
    }
    throw err;
  }

  try {
    writeBaseline(options.output, baseline, { force: options.force });
  } catch (err) {
    console.error(`Configuration error: ${err instanceof Error ? err.message : String(err)}`);
    return 2;
  }

  console.log('baseline accepted');
  console.log('------------------');
  console.log(`destination: ${options.output}`);
  for (const e of baseline.engines) {
    const boundary = e.oldestVerifiedPassing
      ? `oldestVerifiedPassing=${e.oldestVerifiedPassing}${e.firstVerifiedFailing ? `, firstVerifiedFailing=${e.firstVerifiedFailing}` : ''}`
      : 'no verified passing version';
    console.log(`  ${e.engine.padEnd(8)} ${boundary} (${e.versionType}, identity ${e.identity.verified ? 'verified' : 'UNVERIFIED'})`);
  }
  console.log(`fingerprint: ${baseline.configFingerprint.slice(0, 16)}…`);
  console.log('Review the file, commit it, and compare future scans against it. Baselines are never rewritten by comparison.');
  return 0;
}

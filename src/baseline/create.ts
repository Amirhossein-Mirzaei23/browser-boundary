import type { BaselineEngineEntry, BoundaryBaseline } from './types.js';
import type { CheckResult, ScanResult } from '../reporting/types.js';
import { validateBaseline } from './schema.js';

/**
 * Explicit baseline creation from a verified scan (Task 11). Pure: no
 * filesystem, no CLI. A baseline records only ACCEPTED verified evidence —
 * engines without a verified boundary are excluded, never invented, and a
 * scan with no acceptable evidence is rejected outright.
 */

export interface BaselineMetadata {
  application?: { id?: string; revision?: string };
}

export class BaselineCreationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BaselineCreationError';
  }
}

export function createBaseline(scan: ScanResult, metadata?: BaselineMetadata): BoundaryBaseline {
  const engines: BaselineEngineEntry[] = [];
  for (const summary of scan.summaries) {
    const hasVerifiedEvidence = summary.oldestVerifiedPassing !== null || summary.firstVerifiedFailing !== null;
    if (!hasVerifiedEvidence) continue; // excluded, never invented

    const engineChecks = scan.results.filter((r) => r.engine === summary.engine);
    // Evidence-carrying check: the oldest verified pass if present, else the
    // first verified fail — its identity evidence and build label are retained.
    const anchor =
      engineChecks.find((r) => r.version === summary.oldestVerifiedPassing && r.verdict === 'pass') ??
      engineChecks.find((r) => r.version === summary.firstVerifiedFailing && r.verdict === 'fail');
    if (!anchor) continue;

    engines.push({
      engine: summary.engine,
      versionType: summary.versionType,
      oldestVerifiedPassing: summary.oldestVerifiedPassing,
      firstVerifiedFailing: summary.firstVerifiedFailing,
      failureReason: summary.failureReason,
      testedVersions: [...summary.tested],
      inconclusiveVersions: [...summary.inconclusive],
      browserSource: anchor.buildLabel,
      controller: anchor.controller,
      os: scan.provenance.os,
      arch: scan.provenance.arch,
      identity: {
        requestedVersion: anchor.identity.requestedVersion,
        runtimeVersion: anchor.identity.runtimeVersion,
        executableVersion: anchor.identity.executableVersion,
        verified: anchor.identity.verified,
        mismatchReason: anchor.identity.mismatchReason,
      },
    });
  }

  if (engines.length === 0) {
    throw new BaselineCreationError(
      'Scan has no acceptable verified engine evidence (only inconclusive/error/skipped results); refusing to create an empty or invented baseline.',
    );
  }

  const baseline: BoundaryBaseline = {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    ...(metadata?.application ? { application: metadata.application } : {}),
    packageVersion: scan.provenance.packageVersion,
    configFingerprint: scan.configFingerprint,
    scope: scan.scope,
    engines,
  };
  const validation = validateBaseline(baseline);
  if (!validation.ok) {
    throw new BaselineCreationError(`Created baseline failed schema validation: ${validation.errors.join('; ')}`);
  }
  return baseline;
}

import { spawnSync } from 'node:child_process';
import type { BrowserIdentityEvidence, EngineName, VersionType } from '../reporting/types.js';

/**
 * Browser identity verification.
 *
 * Before a compatibility verdict under a requested (engine, version) label can
 * be trusted, we independently confirm:
 *  1. the on-disk executable's own `--version` output (who the binary says it is), and
 *  2. the live session's reported identity (who actually launched).
 *
 * If these disagree with the request — or cannot be determined — the check is
 * reported as inconclusive. We never execute compatibility checks under a
 * mismatched requested label.
 */

/** Raw engine/version identity as reported by one source. */
export interface RawControllerIdentity {
  engine: string | null;
  version: string | null;
  /** How this identity was obtained (e.g. 'playwright:browser.version()'). */
  method: string;
}

export interface IdentityEvidenceInput {
  requestedVersion: string;
  requestedEngine: EngineName;
  versionType: VersionType;
  /** On-disk executable identity (null when not queried, e.g. revision builds). */
  executable: RawControllerIdentity | null;
  /** Live session identity (null when the session could not report one). */
  runtime: RawControllerIdentity | null;
}

/** Extract engine and full version from trusted browser version output. */
export function parseVersionIdentity(output: string): { engine: string | null; version: string | null } {
  const engineMatch = output.match(/chromium|chrome|firefox|webkit|safari/i);
  const versionMatch = output.match(/\d+(?:\.\d+)*/);
  return {
    engine: engineMatch ? engineMatch[0].toLowerCase() : null,
    version: versionMatch ? versionMatch[0] : null,
  };
}

/** Leading numeric major of a version string, or null when absent. */
export function majorOf(version: string | null): string | null {
  if (!version) return null;
  const match = version.match(/\d+/);
  return match ? match[0] : null;
}

/** Normalize engine labels that share a version domain (chrome ≡ chromium). */
function sameEngineDomain(a: string | null, b: string): boolean {
  if (!a) return false;
  const norm = (e: string) => (e.toLowerCase() === 'chrome' ? 'chromium' : e.toLowerCase());
  return norm(a) === norm(b);
}

export function buildIdentityEvidence(input: IdentityEvidenceInput): BrowserIdentityEvidence {
  const { requestedVersion, requestedEngine, versionType, executable, runtime } = input;
  const requestedMajor = majorOf(requestedVersion);

  const base: BrowserIdentityEvidence = {
    requestedVersion,
    requestedEngine,
    executableVersion: executable?.version ?? null,
    executableEngine: executable?.engine ?? null,
    runtimeVersion: runtime?.version ?? null,
    runtimeEngine: runtime?.engine ?? null,
    executableMethod: executable?.method ?? 'unavailable',
    runtimeMethod: runtime?.method ?? 'unavailable',
    verified: false,
    mismatchReason: null,
  };

  // WebKit revision domain: the requested version is a Playwright build
  // revision, NOT a Safari major. It must never be compared against a real
  // browser major; only the live engine has to be WebKit.
  if (versionType === 'playwright-revision') {
    if (!runtime) return { ...base, mismatchReason: 'runtime-identity-unavailable' };
    if (!runtime.engine || !sameEngineDomain(runtime.engine, requestedEngine)) {
      return { ...base, mismatchReason: 'runtime-engine-mismatch' };
    }
    return { ...base, verified: true };
  }

  // Real-major domain: both on-disk and live identity must confirm the request.
  if (!executable || !executable.engine || !executable.version) {
    return { ...base, mismatchReason: 'executable-identity-unparseable' };
  }
  if (!sameEngineDomain(executable.engine, requestedEngine)) {
    return { ...base, mismatchReason: 'executable-engine-mismatch' };
  }
  if (majorOf(executable.version) === null || majorOf(executable.version) !== requestedMajor) {
    return { ...base, mismatchReason: 'executable-version-mismatch' };
  }
  if (!runtime || !runtime.engine || !runtime.version) {
    return { ...base, mismatchReason: 'runtime-identity-unavailable' };
  }
  if (!sameEngineDomain(runtime.engine, requestedEngine)) {
    return { ...base, mismatchReason: 'runtime-engine-mismatch' };
  }
  if (majorOf(runtime.version) === null || majorOf(runtime.version) !== requestedMajor) {
    return { ...base, mismatchReason: 'runtime-version-mismatch' };
  }
  return { ...base, verified: true };
}

/**
 * Ask the resolved executable itself for its version. Synchronous and
 * timeout-bounded; returns null rather than throwing when the binary cannot or
 * will not answer (the resulting evidence then marks the check inconclusive).
 */
export function readExecutableIdentity(executablePath: string): RawControllerIdentity | null {
  let stdout = '';
  try {
    const result = spawnSync(executablePath, ['--version'], { encoding: 'utf8', timeout: 10_000 });
    if (result.error || result.status !== 0) return null;
    stdout = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
  } catch {
    return null;
  }
  if (!stdout) return null;
  const parsed = parseVersionIdentity(stdout);
  if (!parsed.engine || !parsed.version) return null;
  return { ...parsed, method: 'executable:--version' };
}

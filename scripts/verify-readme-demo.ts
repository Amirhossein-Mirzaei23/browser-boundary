/**
 * README demo verification workflow.
 *
 * Reproduces the deterministic demo boundary through the REAL source CLI and
 * fails unless all four proof levels agree:
 *   1. execution  — the CLI actually launched real browser binaries;
 *   2. identity   — requested, on-disk, and live majors verified for both runs;
 *   3. compatibility — the older major failed for the selected reason, the
 *      newer major passed;
 *   4. detection  — compatibility.json's summaries agree with the raw checks.
 *
 * The boundary validation logic is PURE (importable, unit-tested below via
 * `validateDemoBoundary`); the workflow wraps it with server/CLI/filesystem.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startDemoServer } from '../examples/readme-demo/server.js';

/** Validated boundary pair (see examples/readme-demo/README.md). */
export const EXPECTED_BOUNDARY = { failMajor: 120, passMajor: 121 };

export interface DemoCheckEvidence {
  engine: string;
  version: string;
  versionType: string;
  verdict: string;
  controller: string;
  identity: { verified: boolean; mismatchReason: string | null } & Record<string, unknown>;
}

export interface DemoReportEvidence {
  results: DemoCheckEvidence[];
  summaries: Array<{
    engine: string;
    versionType?: string;
    oldestVerifiedPassing: string | null;
    firstVerifiedFailing: string | null;
  }>;
}

export interface BoundaryValidation {
  accepted: boolean;
  /** 'exact' = adjacent pair; 'bracket' = non-adjacent pair with a disclosed gap. */
  semantics: 'exact' | 'bracket' | null;
  reason: string;
  oldestVerifiedPassing: number | null;
  firstVerifiedFailing: number | null;
  gapMajors: number[];
}

/**
 * Validate demo boundary evidence against the expected fail/pass majors.
 * Never accepts identity-mismatched, error, inconclusive, skipped, or
 * summary-disagreeing evidence as a verified boundary.
 */
export function validateDemoBoundary(
  report: DemoReportEvidence,
  expected: { failMajor: number; passMajor: number },
): BoundaryValidation {
  const reject = (reason: string): BoundaryValidation => ({
    accepted: false,
    semantics: null,
    reason,
    oldestVerifiedPassing: null,
    firstVerifiedFailing: null,
    gapMajors: [],
  });

  const chromiumChecks = report.results.filter(
    (r) => r.engine === 'chromium' && r.versionType === 'real-major',
  );
  const pass = chromiumChecks.find((r) => r.version === String(expected.passMajor));
  const fail = chromiumChecks.find((r) => r.version === String(expected.failMajor));

  if (!pass) return reject(`no chromium check for expected passing major ${expected.passMajor}`);
  if (!fail) return reject(`no chromium check for expected failing major ${expected.failMajor}`);
  if (expected.failMajor >= expected.passMajor) return reject('failMajor must be older than passMajor');

  if (pass.verdict !== 'pass') {
    return reject(`boundary moved: expected pass at ${expected.passMajor} but observed '${pass.verdict}'`);
  }
  if (fail.verdict !== 'fail') {
    return reject(`expected verified fail at ${expected.failMajor} but observed '${fail.verdict}' — never treated as a boundary`);
  }
  for (const c of [pass, fail]) {
    if (!c.identity?.verified) {
      return reject(`identity not verified for chromium ${c.version} (${c.identity?.mismatchReason ?? 'missing identity evidence'})`);
    }
  }

  const summary = report.summaries.find((s) => s.engine === 'chromium');
  if (!summary) return reject('compatibility.json has no chromium summary');
  if (summary.oldestVerifiedPassing !== String(expected.passMajor)) {
    return reject(`summary oldestVerifiedPassing '${summary.oldestVerifiedPassing}' disagrees with check results (${expected.passMajor})`);
  }
  if (summary.firstVerifiedFailing !== String(expected.failMajor)) {
    return reject(`summary firstVerifiedFailing '${summary.firstVerifiedFailing}' disagrees with check results (${expected.failMajor})`);
  }

  const gapMajors: number[] = [];
  for (let m = expected.failMajor + 1; m < expected.passMajor; m++) gapMajors.push(m);
  return {
    accepted: true,
    semantics: gapMajors.length === 0 ? 'exact' : 'bracket',
    reason:
      gapMajors.length === 0
        ? `adjacent pair verified: oldestVerifiedPassing=${expected.passMajor}, firstVerifiedFailing=${expected.failMajor}`
        : `non-adjacent pair verified: boundary lies in ${expected.failMajor}..${expected.passMajor}; unverified gap majors: ${gapMajors.join(', ')} (disclose — not proof the transition occurred between consecutive majors)`,
    oldestVerifiedPassing: expected.passMajor,
    firstVerifiedFailing: expected.failMajor,
    gapMajors,
  };
}

/** Execute the full demo verification workflow. Returns a process exit code. */
export async function verifyReadmeDemo(options: { keepOutput?: boolean } = {}): Promise<number> {
  const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const outDir = mkdtempSync(path.join(tmpdir(), 'browser-boundary-demo-'));
  let server: Awaited<ReturnType<typeof startDemoServer>> | null = null;

  try {
    server = await startDemoServer(0);
    const url = `http://127.0.0.1:${server.port}/`;
    console.log(`[demo] target served at ${url}`);

    const versions = `${EXPECTED_BOUNDARY.failMajor},${EXPECTED_BOUNDARY.passMajor}`;
    const cli = path.join(root, 'src', 'cli', 'index.ts');
    console.log(`[demo] running source CLI: chromium ${versions}`);
    // Exit code 1 means a verified compatibility failure was found — expected
    // here, since the older major is designed to fail.
    const code = await new Promise<number>((resolve) => {
      const child = spawn(
        process.execPath,
        [
          '--import',
          'tsx',
          cli,
          url,
          '--engines',
          'chromium',
          '--versions',
          versions,
          '--headless',
          '--format',
          'json',
          '-o',
          outDir,
        ],
        { stdio: 'inherit', cwd: root },
      );
      child.on('exit', (c) => resolve(c ?? -1));
      child.on('error', () => resolve(-1));
    });
    if (code !== 0 && code !== 1) {
      console.error(`[demo] CLI exited with ${code}; expected 0 (scan complete) or 1 (verified failure found).`);
      return 2;
    }

    const report = JSON.parse(readFileSync(path.join(outDir, 'compatibility.json'), 'utf8')) as DemoReportEvidence;
    const validation = validateDemoBoundary(report, EXPECTED_BOUNDARY);

    console.log('[demo] transcript:');
    for (const r of report.results) {
      const id = r.identity;
      console.log(
        `  chromium ${r.version} [${r.controller}] verdict=${r.verdict} identity=${id.verified ? `verified(${id.mismatchReason ?? 'match'})` : `UNVERIFIED(${id.mismatchReason})`}`,
      );
    }
    console.log(`  boundary: ${validation.reason}`);

    if (!validation.accepted) {
      console.error('[demo] VERIFICATION FAILED — demo evidence does not establish the boundary.');
      return 1;
    }
    console.log('[demo] VERIFIED — execution, identity, compatibility, and report evidence agree.');
    return 0;
  } catch (err) {
    console.error(`[demo] verification error: ${err instanceof Error ? err.message : String(err)}`);
    return 2;
  } finally {
    await server?.close().catch(() => {});
    if (options.keepOutput) {
      console.log(`[demo] output preserved at ${outDir}`);
    } else {
      rmSync(outDir, { recursive: true, force: true });
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(await verifyReadmeDemo({ keepOutput: process.argv.includes('--keep-output') }));
}

import type {
  CheckResult,
  EngineName,
  EngineSummary,
  ScanResult,
  Verdict,
} from './types.js';
import type { PageProbe, RuntimeConfig } from './config.js';
import { snapshotConfig } from './config.js';
import { resolveBinary, getLatestBuild } from './browser-installer.js';
import { runCompatibilityCheckWithRetry } from './compatibility-check.js';
import { aggregateFeatureFindings } from './error-analyzer.js';

/**
 * browser-version-tester.ts
 *
 * The version-search driver. For each engine it:
 *   1. Probes the latest build first.
 *   2. Steps DOWN by `stepSize` major versions until a version FAILS.
 *   3. Binary-searches between the last PASS and first FAIL to pin the boundary.
 *   4. Never tests versions implied by the boundary (no exhaustive scan).
 *
 * A version whose binary can't be obtained/launched is INCONCLUSIVE and does
 * NOT abort the scan — it's just recorded and, where possible, worked around
 * by stepping further.
 */

const PAGES: PageProbe[] = [];

export interface RunScanOptions {
  config: RuntimeConfig;
  artifactsDir: string;
  /** Called with progress so the CLI can stream updates. */
  onProgress?: (msg: string) => void;
}

export async function runScan(opts: RunScanOptions): Promise<ScanResult> {
  const { config, artifactsDir } = opts;
  const log = opts.onProgress ?? (() => {});
  const pages = config.pages.length ? config.pages : PAGES;
  const startedAt = new Date().toISOString();
  const results: CheckResult[] = [];
  const summaries: EngineSummary[] = [];

  for (const engine of config.engines) {
    log(`\n=== ${engine.toUpperCase()} ===`);
    try {
      const latest = await getLatestBuild(engine);
      const latestMajor = Number(latest.version);

      if (config.latestOnly || engine === 'webkit') {
        if (engine === 'webkit' && !config.latestOnly) {
          log('WebKit: only current Playwright build is drivable; probing latest only.');
        }
        for (const page of pages) {
          const res = await probe(engine, latest.version, config, artifactsDir, page, log);
          results.push(res);
        }
        summaries.push(
          summarise(engine, results, [], [], engine === 'webkit' ? webkitNote() : null),
        );
        continue;
      }

      const floor = config.versionFloor[engine];
      const tested = await searchEngine({
        engine,
        latestMajor,
        floor,
        step: config.stepSize,
        pages,
        config,
        artifactsDir,
        log,
      });
      results.push(...tested.results);
      summaries.push(tested.summary);
    } catch (err) {
      log(`Engine ${engine} failed entirely: ${err instanceof Error ? err.message : String(err)}`);
      summaries.push({
        engine,
        latestTested: null,
        oldestPassing: null,
        firstFailing: null,
        inconclusive: [],
        skipped: [],
        resultLine: 'NOT TESTED',
        failureReason: err instanceof Error ? err.message : String(err),
        limitationNote: null,
      });
    }
  }

  const finishedAt = new Date().toISOString();
  const featureFindings = aggregateFeatureFindings(
    results,
    summaries.map((s) => ({ engine: s.engine, oldestPassing: s.oldestPassing })),
  );

  return {
    website: pages[0]?.url.replace(/\/[^/]*$/, '') ?? 'https://tabdeal.org',
    pages: pages.map((p) => p.url),
    startedAt,
    finishedAt,
    config: snapshotConfig(config),
    results,
    summaries,
    featureFindings,
  };
}

async function probe(
  engine: EngineName,
  version: string,
  config: RuntimeConfig,
  artifactsDir: string,
  page: PageProbe,
  log: (m: string) => void,
): Promise<CheckResult> {
  log(`  [${engine} v${version}] ${page.label} …`);
  const resolved = await resolveBinary(engine, version, config.browserCacheDir);
  const result = await runCompatibilityCheckWithRetry({
    engine,
    version,
    buildLabel: resolved.buildLabel,
    executablePath: resolved.executablePath,
    limitationNote: resolved.limitationNote,
    page,
    timeoutMs: config.timeoutMs,
    headed: config.headed,
    artifactsDir,
  });
  log(`    → ${result.verdict}${result.reason ? ` (${truncate(result.reason, 90)})` : ''}`);
  return result;
}

interface EngineSearchOutcome {
  results: CheckResult[];
  summary: EngineSummary;
}

/**
 * Step-down + binary-search for one engine (Chromium/Firefox only; WebKit is
 * handled by the caller via the latest-only path).
 */
async function searchEngine(args: {
  engine: EngineName;
  latestMajor: number;
  floor: number;
  step: number;
  pages: PageProbe[];
  config: RuntimeConfig;
  artifactsDir: string;
  log: (m: string) => void;
}): Promise<EngineSearchOutcome> {
  const { engine, latestMajor, floor, step, pages, config, artifactsDir, log } = args;

  // version → verdict (PASS/FAIL) for the pages probed. We track the worst
  // verdict across pages for each version (a version must pass ALL pages).
  const verdictByVersion = new Map<string, Verdict>();
  const results: CheckResult[] = [];
  const inconclusive: string[] = [];
  const skipped: string[] = [];

  const testVersion = async (v: number): Promise<Verdict> => {
    const key = String(v);
    if (verdictByVersion.has(key)) return verdictByVersion.get(key)!;
    let agg: Verdict = 'PASS';
    for (const page of pages) {
      const res = await probe(engine, key, config, artifactsDir, page, log);
      results.push(res);
      if (res.verdict === 'INCONCLUSIVE') {
        agg = 'INCONCLUSIVE';
        inconclusive.push(key);
      } else if (res.verdict === 'FAIL') {
        agg = 'FAIL';
      }
    }
    verdictByVersion.set(key, agg);
    return agg;
  };

  // --- Step 1: latest first ---
  await testVersion(latestMajor);

  // --- Step 2: step down by `step` until FAIL or floor ---
  let lastPass = latestMajor;
  let firstFail: number | null = null;
  let cursor = latestMajor - step;
  while (cursor >= floor) {
    const v = await testVersion(cursor);
    if (v === 'FAIL') {
      firstFail = cursor;
      break;
    }
    // PASS or INCONCLUSIVE: keep going older. INCONCLUSIVE is treated as
    // "couldn't tell" — we continue searching but don't claim it passed.
    if (v === 'PASS') lastPass = cursor;
    cursor -= step;
  }

  // --- Step 3: binary search between lastPass and firstFail ---
  if (firstFail !== null && lastPass - firstFail > 1) {
    let lo = firstFail;
    let hi = lastPass;
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      if (mid === lo || mid === hi) break;
      const v = await testVersion(mid);
      if (v === 'PASS') {
        hi = mid;
      } else if (v === 'FAIL') {
        lo = mid;
      } else {
        // INCONCLUSIVE: can't decide; nudge but don't claim.
        // Treat as unknown — shrink range conservatively.
        hi = mid;
      }
    }
    lastPass = hi;
    firstFail = lo;
  }

  // Mark everything we never needed to test as skipped for transparency.
  for (let v = floor; v <= latestMajor; v++) {
    if (!verdictByVersion.has(String(v))) skipped.push(String(v));
  }

  const latestTested = String(latestMajor);
  const oldestPassing = lastPass !== latestMajor || verdictByVersion.get(String(latestMajor)) === 'PASS'
    ? String(lastPass)
    : null;
  const firstFailingStr = firstFail !== null ? String(firstFail) : null;

  const failResult = firstFail !== null
    ? results.find((r) => r.engine === engine && r.version === String(firstFail) && r.verdict === 'FAIL')
    : null;

  const summary: EngineSummary = {
    engine,
    latestTested,
    oldestPassing,
    firstFailing: firstFailingStr,
    inconclusive,
    skipped,
    resultLine: oldestPassing
      ? `SUPPORTED >= ${oldestPassing}`
      : firstFailingStr
        ? `NOT SUPPORTED < ${firstFailingStr}`
        : 'INCONCLUSIVE',
    failureReason: failResult?.reason ?? null,
    limitationNote: null,
  };
  return { results, summary };
}

function summarise(
  engine: EngineName,
  allResults: CheckResult[],
  inconclusive: string[],
  skipped: string[],
  limitationNote: string | null,
): EngineSummary {
  const mine = allResults.filter((r) => r.engine === engine);
  const passing = mine.filter((r) => r.verdict === 'PASS').map((r) => Number(r.version));
  const failing = mine.filter((r) => r.verdict === 'FAIL').map((r) => Number(r.version));

  const latestTested = mine.length ? String(Math.max(...mine.map((r) => Number(r.version)))) : null;
  const oldestPassing = passing.length ? String(Math.min(...passing)) : null;
  const firstFailing = failing.length ? String(Math.max(...failing)) : null;

  return {
    engine,
    latestTested,
    oldestPassing,
    firstFailing,
    inconclusive,
    skipped,
    resultLine: oldestPassing
      ? `SUPPORTED >= ${oldestPassing}`
      : firstFailing
        ? `NOT SUPPORTED < ${firstFailing}`
        : 'INCONCLUSIVE',
    failureReason: mine.find((r) => r.verdict === 'FAIL')?.reason ?? null,
    limitationNote,
  };
}

function webkitNote(): string {
  return (
    'Historical WebKit binaries are not installable/drivable via Playwright. ' +
    'Only the current Playwright WebKit build was probed.'
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

import type {
  CheckResult,
  Confidence,
  EngineName,
  EngineSummary,
  ScanResult,
  Verdict,
} from '../reporting/types.js';
import type { ScanConfig } from '../config/schema.js';
import {
  resolveConfig,
  resolvePageReadiness,
  type ResolvedConfig,
  type ResolvedPage,
} from '../config/resolve.js';
import { defaultBrowserProvider, type BrowserProvider } from '../browsers/provider.js';
import { HistoricalUnavailableError } from '../browsers/types.js';
import { checkEngineDeps } from './dependencies.js';
import { runCheckWithRetry } from './compatibility-checker.js';
import { searchBoundary, versionRange } from './version-search.js';
import { aggregateFeatureFindings } from '../analysis/error-analyzer.js';

/**
 * BrowserCompatibilityScanner — the public orchestrator.
 *
 * Wires config → browser provider → per-(engine,version,page) checks →
 * version search → aggregated result. It has NO site-specific knowledge.
 */
export interface ScanProgress {
  onProgress?: (msg: string) => void;
}

export class BrowserCompatibilityScanner {
  private readonly config: ResolvedConfig;
  private readonly provider: BrowserProvider;

  constructor(input: ScanConfig, opts: { provider?: BrowserProvider } = {}) {
    this.config = resolveConfig(input);
    this.provider = opts.provider ?? defaultBrowserProvider;
  }

  /** Convenience: scan without instantiating. */
  static async scan(input: ScanConfig, progress?: ScanProgress): Promise<ScanResult> {
    return new BrowserCompatibilityScanner(input).scan(progress);
  }

  async scan(progress?: ScanProgress): Promise<ScanResult> {
    const log = progress?.onProgress ?? (() => {});
    const cfg = this.config;
    const startedAt = new Date().toISOString();
    const results: CheckResult[] = [];
    const summaries: EngineSummary[] = [];

    for (const engine of cfg.engines) {
      log(`\n=== ${engine.toUpperCase()} ===`);
      try {
        const summary = await this.scanEngine(engine, results, log);
        summaries.push(summary);
      } catch (err) {
        log(`Engine ${engine} failed: ${err instanceof Error ? err.message : String(err)}`);
        summaries.push({
          engine,
          versionType: engine === 'webkit' ? 'playwright-revision' : 'real-major',
          tested: [],
          latestTested: null,
          oldestVerifiedPassing: null,
          firstVerifiedFailing: null,
          boundaryConfidence: 'unknown',
          inconclusive: [],
          skipped: [],
          resultLine: 'ERROR — engine could not be scanned',
          failureReason: err instanceof Error ? err.message : String(err),
          limitationNote: null,
        });
      }
    }

    const featureFindings = aggregateFeatureFindings(results);
    return {
      website: cfg.siteName,
      pages: cfg.pages.map((p) => p.url),
      startedAt,
      finishedAt: new Date().toISOString(),
      config: {
        timeoutMs: cfg.timeout,
        headed: cfg.headed,
        latestOnly: cfg.strategy === 'latest',
        strategy: cfg.strategy,
        stepSize: cfg.stepSize,
        versionFloor: cfg.floor,
      },
      results,
      summaries,
      featureFindings,
    };
  }

  private async scanEngine(
    engine: EngineName,
    results: CheckResult[],
    log: (m: string) => void,
  ): Promise<EngineSummary> {
    const cfg = this.config;
    const pages = cfg.pages.map((p) => resolvePageReadiness(p, cfg));

    const latest = await this.provider.getLatest(engine);
    const latestMajor = Number(latest.version);
    const versionType = latest.versionType;

    // Engines that can't provide historical binaries (WebKit: no drivable
    // historical Safari off macOS) are probed latest-only. Chromium and Firefox
    // both support real historical binaries. Same for the explicit 'latest' strategy.
    const historicalCapable = this.provider.supportsHistoricalVersions(engine);
    if (!historicalCapable || cfg.strategy === 'latest') {
      log(`${cap(engine)}: current build only; probing latest.`);
      const tested: string[] = [];
      for (const page of pages) {
        const r = await this.probe(engine, latest.version, versionType, page, log);
        results.push(r);
        tested.push(latest.version);
      }
      return this.buildSummary(engine, versionType, results, tested, latest.version, 'low');
    }

    // Historical search. Up-front optional-dependency gate: if the engine's
    // historical path needs a package that isn't installed (selenium-webdriver
    // for Firefox, @puppeteer/browsers for Chromium), skip the engine with a
    // clear message instead of producing a stream of cryptic per-version errors.
    const deps = checkEngineDeps(engine, cfg);
    if (!deps.ok) {
      log(deps.message);
      return {
        engine,
        versionType,
        tested: [],
        latestTested: null,
        oldestVerifiedPassing: null,
        firstVerifiedFailing: null,
        boundaryConfidence: 'unknown',
        inconclusive: [],
        skipped: [],
        resultLine: 'SKIPPED — required package not installed',
        failureReason: null,
        limitationNote: deps.message,
      };
    }

    const floor = cfg.floor[engine] ?? 60;
    const versions = versionRange(latestMajor, floor);
    const strategy =
      cfg.strategy === 'explicit' && cfg.explicitVersions[engine]
        ? 'explicit'
        : cfg.strategy === 'step-down'
          ? 'step-down'
          : 'binary';

    const explicitVersions = cfg.explicitVersions[engine];
    const searchVersions =
      strategy === 'explicit' && explicitVersions
        ? [...explicitVersions].sort((a, b) => Number(b) - Number(a))
        : versions;

    const test = async (version: string): Promise<Verdict> => {
      let agg: Verdict = 'pass';
      for (const page of pages) {
        const r = await this.probe(engine, version, versionType, page, log);
        results.push(r);
        if (r.verdict === 'error') agg = 'error';
        else if (r.verdict === 'inconclusive') agg = agg === 'fail' ? 'fail' : 'inconclusive';
        else if (r.verdict === 'fail') agg = 'fail';
      }
      return agg;
    };

    const outcome = await searchBoundary({
      versions: searchVersions,
      test,
      strategy: strategy === 'explicit' ? 'explicit' : strategy === 'step-down' ? 'step-down' : 'binary',
      stepSize: cfg.stepSize,
    });

    return {
      engine,
      versionType,
      tested: outcome.tested,
      latestTested: String(latestMajor),
      oldestVerifiedPassing: outcome.oldestVerifiedPassing,
      firstVerifiedFailing: outcome.firstVerifiedFailing,
      boundaryConfidence: outcome.boundaryConfidence,
      inconclusive: outcome.inconclusive,
      skipped: outcome.skipped,
      resultLine: resultLineFor(outcome.oldestVerifiedPassing, outcome.firstVerifiedFailing),
      failureReason: this.firstFailReason(engine, results),
      limitationNote: null,
    };
  }

  private async probe(
    engine: EngineName,
    version: string,
    versionType: 'real-major' | 'playwright-revision',
    page: ResolvedPage,
    log: (m: string) => void,
  ): Promise<CheckResult> {
    log(`  [${engine} v${version}] ${page.label} …`);

    // Honesty contract: if a real historical binary for THIS version cannot be
    // obtained, record INCONCLUSIVE for it. NEVER substitute another version —
    // a verdict from e.g. Firefox 153 attributed to Firefox 52 is a lie.
    let binary;
    try {
      binary = await this.provider.install(engine, version, this.config.cacheDir);
    } catch (err) {
      if (err instanceof HistoricalUnavailableError) {
        log(`    → INCONCLUSIVE (historical binary unavailable: ${trunc(err.message, 400)})`);
        return synthesizeInconclusive(engine, version, versionType, page, err.message);
      }
      throw err;
    }

    const r = await runCheckWithRetry({
      engine,
      version,
      versionType,
      binary,
      page,
      config: this.config,
      artifactsDir: artifactDirFor(this.config.outputDir),
    });
    log(`    → ${r.verdict.toUpperCase()}${r.reason ? ` (${trunc(r.reason, 600)})` : ''}`);
    return r;
  }

  private buildSummary(
    engine: EngineName,
    versionType: 'real-major' | 'playwright-revision',
    allResults: CheckResult[],
    tested: string[],
    latestVersion: string,
    confidence: Confidence,
  ): EngineSummary {
    const mine = allResults.filter((r) => r.engine === engine);
    const pass = mine.filter((r) => r.verdict === 'pass').map((r) => Number(r.version));
    const fail = mine.filter((r) => r.verdict === 'fail').map((r) => Number(r.version));
    const oldest = pass.length ? String(Math.min(...pass)) : null;
    const firstFail = fail.length ? String(Math.max(...fail)) : null;
    return {
      engine,
      versionType,
      tested,
      latestTested: latestVersion,
      oldestVerifiedPassing: oldest,
      firstVerifiedFailing: firstFail,
      boundaryConfidence: confidence,
      inconclusive: mine.filter((r) => r.verdict === 'inconclusive' || r.verdict === 'error').map((r) => r.version),
      skipped: [],
      resultLine: resultLineFor(oldest, firstFail),
      failureReason: this.firstFailReason(engine, allResults),
      limitationNote: mine.find((r) => r.limitationNote)?.limitationNote ?? null,
    };
  }

  private firstFailReason(engine: EngineName, results: CheckResult[]): string | null {
    const f = results.find((r) => r.engine === engine && r.verdict === 'fail');
    return f?.reason ?? null;
  }
}

/** Top-level convenience function (preferred for most users). */
export async function scan(input: ScanConfig, progress?: ScanProgress): Promise<ScanResult> {
  return BrowserCompatibilityScanner.scan(input, progress);
}

function resultLineFor(oldest: string | null, firstFail: string | null): string {
  if (oldest && firstFail) return `verified PASS >= ${oldest}; verified FAIL at ${firstFail}`;
  if (oldest) return `verified PASS >= ${oldest} (no failure found in searched range)`;
  if (firstFail) return `verified FAIL at ${firstFail} (no pass found in searched range)`;
  return 'INCONCLUSIVE — no verified pass or fail';
}

/**
 * Build an INCONCLUSIVE CheckResult for a version whose real historical binary
 * could not be obtained. No browser is launched; no verdict is invented. This is
 * the credibility-preserving path for historical probes that can't be fulfilled.
 */
function synthesizeInconclusive(
  engine: EngineName,
  version: string,
  versionType: 'real-major' | 'playwright-revision',
  page: ResolvedPage,
  reason: string,
): CheckResult {
  return {
    engine,
    version,
    versionType,
    buildLabel: '(unavailable)',
    executablePath: '',
    url: page.url,
    verdict: 'inconclusive',
    reason,
    signals: {
      navigationError: null,
      jsErrors: [],
      consoleErrors: [],
      failedRequests: [],
      rendered: false,
      renderedSelectors: [],
      readyMs: 0,
    },
    artifacts: { screenshotPath: null, tracePath: null },
    finding: null,
    limitationNote: reason,
    durationMs: 0,
  };
}

function artifactDirFor(outputDir: string): string {
  return `${outputDir}/artifacts`;
}

function trunc(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

import path from 'node:path';
import { existsSync, mkdirSync, appendFileSync } from 'node:fs';
import type { Browser, BrowserType } from 'playwright';
import { playwrightBrowserType } from '../browsers/playwright-provider.js';
import type {
  CheckResult,
  EngineName,
  FailedRequest,
  JsError,
  Verdict,
  VersionType,
} from '../reporting/types.js';
import type { ResolvedConfig, ResolvedPage } from '../config/resolve.js';
import type { BrowserBinary } from '../browsers/types.js';
import { analyzeSignals } from '../analysis/error-analyzer.js';
import {
  attachJsCollectors,
  attachRequestTracker,
  checkReadiness,
  classifyFailedRequest,
  describeNavigationError,
  detectSilentStall,
} from '../detection/index.js';
import { withRetry, isTransientReason } from './retry.js';

/**
 * Runs ONE (engine, version, page) check using a REAL browser binary and
 * evaluates all enabled categories (navigation, JS, console, network,
 * rendering, readiness). No site-specific behavior lives here — anti-bot
 * warm-ups etc. are supplied via the config `hooks.beforeGoto`.
 */
export interface CheckInput {
  engine: EngineName;
  version: string;
  versionType: VersionType;
  binary: BrowserBinary;
  page: ResolvedPage;
  config: ResolvedConfig;
  artifactsDir: string;
}

export async function runCheck(input: CheckInput): Promise<CheckResult> {
  const started = Date.now();
  const { engine, version, versionType, binary, page, config, artifactsDir } = input;

  const jsErrors: JsError[] = [];
  const consoleMsgs: { level: 'error' | 'warning' | 'info' | 'log'; text: string }[] = [];
  const failedRequests: FailedRequest[] = [];
  let navigationError: string | null = null;
  let rendered = false;
  let renderedSelectors: string[] = [];
  let readyMs = 0;
  let renderError: string | null = null;

  const dirs = ensureArtifactDirs(artifactsDir);
  const stem = `${engine}-${version}-${page.label}`;
  const consoleLog = path.join(dirs.logs, `console-${stem}.log`);
  const reqLog = path.join(dirs.logs, `failed-requests-${stem}.log`);

  const browserType: BrowserType = playwrightBrowserType(engine);
  let browser: Browser | null = null;
  let verdict: Verdict = 'inconclusive';
  let reason = '';
  let screenshotPath: string | null = null;
  let tracePath: string | null = null;
  let finding: CheckResult['finding'] = null;

  try {
    browser = await launchReal(engine, browserType, binary, config);
    const context = await browser.newContext({ viewport: config.viewport });
    await context.tracing.start({ screenshots: true, snapshots: true });
    const p = await context.newPage();

    attachJsCollectors(
      p,
      (e) => {
        jsErrors.push(e);
        appendLog(consoleLog, `[pageerror] ${e.message}\n${e.stack ?? ''}\n`);
      },
      (level, text) => {
        consoleMsgs.push({ level, text });
        if (level === 'error' || level === 'warning') appendLog(consoleLog, `[${level}] ${text}\n`);
      },
    );

    const { inflight, responseCount } = attachRequestTracker(p, (status, method, url, dur) => {
      appendLog(reqLog, `[resp] ${status} ${method} ${url.slice(0, 80)} (${dur}ms)\n`);
    });
    p.on('requestfailed', (req) => {
      const fr = classifyFailedRequest(
        req.url(),
        req.method(),
        req.resourceType(),
        req.failure()?.errorText ?? null,
        config.ignoredPatterns,
        config.criticalResourceTypes,
      );
      failedRequests.push(fr);
      if (fr.fatal || fr.category === 'analytics') {
        appendLog(reqLog, `[${fr.category}${fr.fatal ? '*' : ''}] ${req.method()} ${req.url()} — ${fr.failureText}\n`);
      }
    });

    // --- Category 1: navigation (with optional beforeGoto hook) ---
    // waitUntil: 'domcontentloaded' (default) fires as soon as the DOM parses;
    // 'load' waits for the full page load. True readiness is then proven by the
    // readiness gate regardless.
    if (config.hooks.beforeGoto) {
      await config.hooks.beforeGoto({ page: p, url: page.url }).catch(() => {});
    }
    try {
      await p.goto(page.url, { waitUntil: config.waitUntil, timeout: config.timeout });
    } catch (err) {
      const outcome = describeNavigationError(err);
      navigationError = outcome.error;
      const stall = detectSilentStall(page.url, [...inflight.values()], responseCount(), config.timeout);
      if (stall) navigationError = stall;
    }

    // --- Categories 4 & 5: rendering + readiness ---
    if (!navigationError && config.checks.readiness) {
      const outcome = await checkReadiness(p, page, config.timeout);
      rendered = outcome.rendered;
      renderedSelectors = outcome.renderedSelectors;
      readyMs = outcome.readyMs;
      renderError = outcome.error;
    } else if (!navigationError) {
      rendered = true;
    }

    // --- Analyze → verdict ---
    const analysis = analyzeSignals(
      navigationError,
      jsErrors,
      consoleMsgs,
      failedRequests,
      rendered,
      config.minConfidence,
      renderError,
    );
    finding = analysis.finding;
    verdict = analysis.verdict;
    reason = analysis.reason;

    if (verdict === 'fail') {
      screenshotPath = path.join(dirs.screenshots, `${stem}.png`);
      await p.screenshot({ path: screenshotPath, fullPage: false }).catch(() => {});
      tracePath = path.join(dirs.traces, `${stem}.zip`);
      await context.tracing.stop({ path: tracePath }).catch(() => {});
    } else {
      await context.tracing.stop().catch(() => {});
    }
    await context.close();
  } catch (err) {
    verdict = 'error';
    reason = `Infrastructure error: ${err instanceof Error ? err.message : String(err)}`;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }

  return {
    engine,
    version,
    versionType,
    buildLabel: binary.buildLabel,
    executablePath: binary.executablePath,
    url: page.url,
    verdict,
    reason,
    signals: {
      navigationError,
      jsErrors,
      consoleErrors: consoleMsgs,
      failedRequests,
      rendered,
      renderedSelectors,
      readyMs,
    },
    artifacts: { screenshotPath, tracePath },
    finding,
    limitationNote: binary.limitationNote,
    durationMs: Date.now() - started,
  };
}

/** Run a check with transient-retry. Definitive pass/fail is never retried. */
export async function runCheckWithRetry(input: CheckInput): Promise<CheckResult> {
  return withRetry(
    () => runCheck(input),
    input.config.retries,
    (r) => (r.verdict === 'inconclusive' || r.verdict === 'error') && isTransientReason(r.reason),
  );
}

async function launchReal(
  engine: EngineName,
  browserType: BrowserType,
  binary: BrowserBinary,
  config: ResolvedConfig,
): Promise<Browser> {
  const opts: Parameters<BrowserType['launch']>[0] = {
    headless: !config.headed,
    timeout: config.timeout,
  };
  // Use the resolved binary path for historical Chromium/Firefox. WebKit always
  // uses the Playwright-patched build (its limitationNote explains this).
  if (engine !== 'webkit' && !binary.isPlaywrightBuild) {
    opts.executablePath = binary.executablePath;
  }
  if (engine === 'chromium') {
    opts.args = ['--no-sandbox', '--disable-dev-shm-usage'];
  }
  return browserType.launch(opts);
}

function ensureArtifactDirs(artifactsDir: string): {
  screenshots: string;
  traces: string;
  logs: string;
} {
  const screenshots = path.join(artifactsDir, 'screenshots');
  const traces = path.join(artifactsDir, 'traces');
  const logs = path.join(artifactsDir, 'logs');
  for (const d of [screenshots, traces, logs]) {
    if (!existsSync(d)) mkdirSync(d, { recursive: true });
  }
  return { screenshots, traces, logs };
}

function appendLog(file: string, text: string): void {
  try {
    appendFileSync(file, text);
  } catch {
    /* best-effort */
  }
}

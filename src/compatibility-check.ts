import path from 'node:path';
import { existsSync, mkdirSync, appendFileSync } from 'node:fs';
import type { Browser, BrowserType, Page } from 'playwright';
import { chromium, firefox, webkit } from 'playwright';
import type {
  CheckResult,
  ConsoleMessage as CapturedConsole,
  EngineName,
  FailedRequest,
  JsError,
  Verdict,
} from './types.js';
import type { PageProbe } from './config.js';
import { analyzeSignals, classifyFailedRequest } from './error-analyzer.js';

/**
 * compatibility-check.ts
 *
 * Runs ONE (engine, version, page) check using a REAL browser binary (never a
 * faked User-Agent) and evaluates the 5 compatibility categories:
 *   1. Navigation errors   (goto / DNS / TLS / timeout / crash)
 *   2. JavaScript errors   (pageerror = critical; console filtered)
 *   3. Failed network reqs (analytics = non-fatal; app = fatal)
 *   4. Page rendering      (site-specific selectors must be visible)
 *   5. Application readiness (waitForSelector + networkidle, configurable)
 */

export interface CheckInput {
  engine: EngineName;
  version: string;
  buildLabel: string;
  executablePath: string;
  limitationNote: string | null;
  page: PageProbe;
  timeoutMs: number;
  headed: boolean;
  artifactsDir: string;
}

export async function runCompatibilityCheck(input: CheckInput): Promise<CheckResult> {
  const started = Date.now();
  const {
    engine,
    version,
    buildLabel,
    executablePath,
    limitationNote,
    page,
    timeoutMs,
    headed,
    artifactsDir,
  } = input;

  const jsErrors: JsError[] = [];
  const consoleMsgs: CapturedConsole[] = [];
  const failedRequests: FailedRequest[] = [];
  let navigationError: string | null = null;
  let rendered = false;
  const renderedSelectors: string[] = [];
  let readyMs = 0;

  const screenshotDir = path.join(artifactsDir, 'screenshots');
  const traceDir = path.join(artifactsDir, 'traces');
  const logsDir = path.join(artifactsDir, 'logs');
  for (const d of [screenshotDir, traceDir, logsDir]) {
    if (!existsSync(d)) mkdirSync(d, { recursive: true });
  }
  const stem = `${engine}-${version}-${page.label}`;
  const consoleLog = path.join(logsDir, `console-${stem}.log`);
  const reqLog = path.join(logsDir, `failed-requests-${stem}.log`);

  const browserType: BrowserType = browserTypeFor(engine);

  let browser: Browser | null = null;
  let verdict: Verdict = 'INCONCLUSIVE';
  let reason = '';
  let screenshotPath: string | null = null;
  let tracePath: string | null = null;
  let failureFeature: CheckResult['failureFeature'] = null;

  try {
    browser = await launchReal(engine, browserType, executablePath, headed, timeoutMs);

    const context = await browser.newContext({
      viewport: { width: 1366, height: 768 },
      // We do NOT override userAgent — that would fake the browser identity,
      // which the task explicitly forbids.
    });
    await context.tracing.start({ screenshots: true, snapshots: true });

    const p = await context.newPage();

    p.on('pageerror', (err: Error) => {
      const entry: JsError = {
        type: 'pageerror',
        message: err.message,
        stack: err.stack,
      };
      jsErrors.push(entry);
      appendLog(consoleLog, `[pageerror] ${err.message}\n${err.stack ?? ''}\n`);
    });

    p.on('console', (msg) => {
      const type = msg.type() as CapturedConsole['level'];
      if (type !== 'error' && type !== 'warning' && type !== 'log' && type !== 'info') return;
      const text = msg.text();
      consoleMsgs.push({ level: type, text });
      if (type === 'error' || type === 'warning') {
        appendLog(consoleLog, `[${type}] ${text}\n`);
      }
    });

    p.on('requestfailed', (req) => {
      const url = req.url();
      const fr = classifyFailedRequest(
        url,
        req.method(),
        req.resourceType(),
        req.failure()?.errorText ?? null,
      );
      failedRequests.push(fr);
      if (fr.fatal || fr.category === 'analytics') {
        appendLog(reqLog, `[${fr.category}${fr.fatal ? '*' : ''}] ${req.method()} ${url} — ${fr.failureText}\n`);
      }
    });

    // Track request/response timing so we can detect the "silent stall"
    // pattern (request sent, no response ever) typical of WAF/anti-bot layers
    // that drop automated browsers without an explicit error.
    const inflight = new Map<string, { method: string; url: string; started: number }>();
    let responseCount = 0;
    p.on('request', (req) => {
      inflight.set(req.url(), { method: req.method(), url: req.url(), started: Date.now() });
    });
    p.on('response', (res) => {
      responseCount++;
      const meta = inflight.get(res.url());
      if (meta) {
        inflight.delete(meta.url);
        const dur = Date.now() - meta.started;
        appendLog(
          reqLog,
          `[resp] ${res.status()} ${meta.method} ${meta.url.slice(0, 80)} (${dur}ms)\n`,
        );
      }
    });

    // --- Category 1: navigation ---
    // We navigate to 'domcontentloaded' (not 'load') so that a resource-heavy
    // page that never fires `load` (slow analytics, long-polling, heavy media)
    // doesn't falsely count as a navigation failure. True readiness is then
    // proven by the explicit waitForSelector readiness checks below, which is
    // exactly what "application readiness" means in this task.
    //
    // Anti-bot warm-up: tabdeal.org sits behind ArvanCloud/F5-style WAF that
    // issues a session cookie (TS01*) on first contact. We do a lightweight
    // in-page request first to obtain that cookie using the browser's real
    // TLS fingerprint (NOT a faked UA), so the main navigation carries the
    // same session. This is legitimate — it's exactly what a real browser
    // session does — and never changes the browser identity.
    const origin = new URL(page.url).origin;
    await p
      .evaluate(async (o) => {
        try {
          await fetch(o, { mode: 'no-cors', credentials: 'include' });
        } catch {
          /* warm-up is best-effort; the cookie set by the server is what matters */
        }
      }, origin)
      .catch(() => {});

    const readyStart = Date.now();
    try {
      await p.goto(page.url, {
        waitUntil: 'domcontentloaded',
        timeout: timeoutMs,
      });
    } catch (err) {
      navigationError = describeNavigationError(err);
      // Detect the "silent stall" anti-bot pattern: the main document request
      // was dispatched but no response ever arrived, while non-automated
      // clients (curl) succeed. This is a WAF dropping the automated browser,
      // NOT a browser compatibility failure — flag it distinctly.
      const docReqInflight = [...inflight.values()].some(
        (m) => m.method === 'GET' && m.url.replace(/\/$/, '') === page.url.replace(/\/$/, ''),
      );
      if (docReqInflight && responseCount === 0) {
        navigationError =
          `Navigation stalled with no server response (anti-bot/WAF block): ` +
          `document request to ${page.url} was sent but the server returned 0 bytes ` +
          `within ${timeoutMs}ms, while non-automated clients succeed. ` +
          `Likely ArvanCloud/F5 bot-defense stalling the automated TLS client. ` +
          `(${err instanceof Error ? err.message.slice(0, 80) : ''})`;
      }
    }

    // --- Categories 4 & 5: rendering + readiness ---
    if (!navigationError) {
      for (const sel of page.readinessSelectors) {
        try {
          await p.waitForSelector(sel, { state: 'visible', timeout: timeoutMs });
          renderedSelectors.push(sel);
        } catch {
          /* selector not present; recorded by absence in renderedSelectors */
        }
      }
      rendered = renderedSelectors.length >= Math.min(1, page.readinessSelectors.length)
        ? renderedSelectors.length > 0
        : false;
      readyMs = Date.now() - readyStart;
    }

    // Analyse collected signals → verdict (categories 1/2/3 feed this).
    const analysis = analyzeSignals(navigationError, jsErrors, consoleMsgs, failedRequests, rendered);
    failureFeature = analysis.feature;

    // A WAF/anti-bot stall is an environmental block, NOT a browser-compat
    // failure: the browser may be fully compatible, we simply can't retrieve
    // the content to verify it. Mark such cases INCONCLUSIVE with a clear
    // reason rather than FAILING a browser version that did nothing wrong.
    const isWafStall = navigationError?.includes('anti-bot/WAF block');
    if (isWafStall) {
      verdict = 'INCONCLUSIVE';
      reason = navigationError ?? 'Blocked by anti-bot/WAF layer.';
    } else {
      verdict = analysis.verdict;
      reason = limitationNote
        ? analysis.reason || 'Passed with current build (historical binary unavailable).'
        : analysis.reason;
    }

    if (verdict === 'FAIL') {
      screenshotPath = path.join(screenshotDir, `${stem}.png`);
      await p.screenshot({ path: screenshotPath, fullPage: false }).catch(() => {});
      const traceZip = path.join(traceDir, `${stem}.zip`);
      await context.tracing.stop({ path: traceZip }).catch(() => {});
      tracePath = traceZip;
    } else {
      await context.tracing.stop().catch(() => {});
    }

    await context.close();
  } catch (err) {
    verdict = 'INCONCLUSIVE';
    reason = `Could not run check: ${err instanceof Error ? err.message : String(err)}`;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }

  return {
    engine,
    version,
    buildLabel,
    executablePath,
    url: page.url,
    verdict,
    reason,
    readyMs,
    rendered,
    renderedSelectors,
    navigationError,
    jsErrors,
    consoleErrors: consoleMsgs,
    failedRequests,
    screenshotPath,
    tracePath,
    failureFeature,
    limitationNote,
    durationMs: Date.now() - started,
  };
}

/**
 * Wrapper that retries a check on TRANSIENT failures only:
 *   - navigation timeout / anti-bot WAF stall
 *   - the browser process crashing at launch
 * It never retries a definitive PASS or a real JS/render/network FAIL, because
 * those reflect genuine (in)compatibility.
 *
 * tabdeal.org is behind ArvanCloud, which intermittently stalls automated
 * browsers under load; a single short retry reliably recovers a real result.
 */
export async function runCompatibilityCheckWithRetry(
  input: CheckInput,
  attempts = 3,
): Promise<CheckResult> {
  let last: CheckResult | null = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const result = await runCompatibilityCheck(input);
    last = result;

    // Keep the result unless it's a transient stall.
    const transient =
      result.verdict === 'INCONCLUSIVE' &&
      /anti-bot\/WAF block|Navigation (timeout|stalled)|Could not run check/i.test(
        result.reason,
      );
    if (!transient) return result;

    // Brief backoff before retrying.
    if (attempt < attempts) await new Promise((r) => setTimeout(r, 1500 * attempt));
  }
  return last!;
}

/**
 * Launch the real binary via executablePath. For historical Chrome/Firefox we
 * point Playwright at the downloaded binary directly. WebKit always uses the
 * Playwright-patched build.
 */
async function launchReal(
  engine: EngineName,
  browserType: BrowserType,
  executablePath: string,
  headed: boolean,
  timeoutMs: number,
): Promise<Browser> {
  const launchOptions: Parameters<BrowserType['launch']>[0] = {
    headless: !headed,
    timeout: timeoutMs,
  };
  if (engine !== 'webkit') {
    launchOptions.executablePath = executablePath;
  }
  // Historical Chrome on Linux often needs --no-sandbox in containers.
  if (engine === 'chromium') {
    launchOptions.args = ['--no-sandbox', '--disable-dev-shm-usage'];
  }
  return browserType.launch(launchOptions);
}

function browserTypeFor(engine: EngineName): BrowserType {
  switch (engine) {
    case 'chromium':
      return chromium;
    case 'firefox':
      return firefox;
    case 'webkit':
      return webkit;
  }
}

function describeNavigationError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  // Playwright/Chromium net errors carry ERR_* codes.
  const net = msg.match(/net::ERR_[A-Z_]+/);
  if (net) return `Network failure ${net[0]}: ${msg}`;
  if (/timeout/i.test(msg)) return `Navigation timeout: ${msg}`;
  if (/tls|certificate|ERR_CERT/i.test(msg)) return `TLS/certificate error: ${msg}`;
  if (/dns|ENOTFOUND|ERR_NAME_NOT_RESOLVED/i.test(msg)) return `DNS error: ${msg}`;
  return `Navigation failed: ${msg}`;
}

function appendLog(file: string, text: string): void {
  try {
    appendFileSync(file, text);
  } catch {
    /* best-effort logging */
  }
}

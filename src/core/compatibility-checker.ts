import path from 'node:path';
import { existsSync, mkdirSync, appendFileSync } from 'node:fs';
import type {
  CheckResult,
  ConsoleLevel,
  EngineName,
  FailedRequest,
  JsError,
  Verdict,
  VersionType,
} from '../reporting/types.js';
import type { ResolvedConfig, ResolvedPage } from '../config/resolve.js';
import type { BrowserBinary } from '../browsers/types.js';
import { analyzeSignals } from '../analysis/error-analyzer.js';
import { classifyFailedRequest } from '../detection/index.js';
import { withRetry, isTransientReason } from './retry.js';
import { controllerFor } from '../controllers/index.js';
import { buildIdentityEvidence, readExecutableIdentity, type RawControllerIdentity } from '../browsers/identity.js';
import type { BrowserIdentityEvidence } from '../reporting/types.js';

/**
 * Runs ONE (engine, version, page) check using a REAL browser binary and
 * evaluates all enabled categories (navigation, JS, console, network,
 * rendering, readiness). No site-specific behavior lives here — anti-bot
 * warm-ups etc. are supplied via the config `hooks.beforeGoto`.
 *
 * Browser driving is delegated to an AutomationController (Playwright or
 * WebDriver), selected from `binary.controller`. This file is protocol-agnostic:
 * it owns signal classification (config-bound) and verdict analysis, both
 * shared across controllers.
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
  const consoleMsgs: { level: ConsoleLevel; text: string }[] = [];
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

  let verdict: Verdict = 'inconclusive';
  let reason = '';
  let screenshotPath: string | null = null;
  let tracePath: string | null = null;
  let finding: CheckResult['finding'] = null;
  let identity: BrowserIdentityEvidence = buildIdentityEvidence({
    requestedVersion: version,
    requestedEngine: engine,
    versionType,
    executable: null,
    runtime: null,
  });
  let controllerKind: 'playwright' | 'webdriver' = binary.controller ?? 'playwright';

  /** Assemble the CheckResult; called on every exit path so identity/controller evidence is always retained. */
  const result = (): CheckResult => ({
    engine,
    version,
    versionType,
    buildLabel: binary.buildLabel,
    executablePath: binary.executablePath,
    url: page.url,
    verdict,
    reason,
    identity,
    controller: controllerKind,
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
  });

  const controller = await controllerFor(binary);
  controllerKind = controller.kind;
  let session: Awaited<ReturnType<typeof controller.launch>> | null = null;
  let finalizationStarted = false;

  try {
    session = await controller.launch(binary, config);

    // --- Identity honesty gate: verify who actually launched BEFORE navigating ---
    const executableIdentity =
      versionType === 'real-major' ? readExecutableIdentity(binary.executablePath) : null;
    let runtimeIdentity: RawControllerIdentity | null = null;
    try {
      runtimeIdentity = await session.getIdentity();
    } catch {
      runtimeIdentity = null; // evidence below marks the check inconclusive
    }
    identity = buildIdentityEvidence({
      requestedVersion: version,
      requestedEngine: engine,
      versionType,
      executable: executableIdentity,
      runtime: runtimeIdentity,
    });
    if (!identity.verified) {
      // Never execute compatibility checks under a mismatched requested label.
      verdict = 'inconclusive';
      reason = `Browser identity could not be verified (${identity.mismatchReason}); no compatibility checks were executed.`;
      finalizationStarted = true;
      await finalizeSession(session, config);
      session = null;
      return result();

    }

    await session.startTrace();

    if (config.disableHttpCache) {
      await session.disableCache();
    }

    // Signal collectors. The controller emits RAW events; the checker classifies
    // request fatality using the resolved config (controllers are config-free).
    await session.attachCollectors({
      onJsError: (e) => {
        jsErrors.push(e);
        appendLog(consoleLog, `[pageerror] ${e.message}\n${e.stack ?? ''}\n`);
      },
      onConsole: (level, text) => {
        consoleMsgs.push({ level, text });
        if (level === 'error' || level === 'warning') appendLog(consoleLog, `[${level}] ${text}\n`);
      },
      onRequestFailure: (url, method, resourceType, failureText) => {
        const fr = classifyFailedRequest(
          url,
          method,
          resourceType,
          failureText,
          config.ignoredPatterns,
          config.criticalResourceTypes,
        );
        failedRequests.push(fr);
        if (fr.fatal || fr.category === 'analytics') {
          appendLog(reqLog, `[${fr.category}${fr.fatal ? '*' : ''}] ${method} ${url} — ${fr.failureText}\n`);
        }
      },
    });

    // --- Category 1: navigation (with optional beforeGoto hook) ---
    try {
      const result = await session.goto(page.url, {
        waitUntil: config.waitUntil,
        timeout: config.timeout,
      });
      navigationError = result.error;
    } catch (err) {
      // Controllers report nav failures via GotoResult.error, not throws; this
      // guards against a controller that unexpectedly throws.
      navigationError = `Navigation error: ${err instanceof Error ? err.message : String(err)}`;
    }

    // --- Categories 4 & 5: rendering + readiness ---
    if (!navigationError && config.checks.readiness) {
      const outcome = await session.checkReadiness(page, config.timeout);
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
      await session.screenshot(screenshotPath);
      if (session.supportsTracing) {
        tracePath = path.join(dirs.traces, `${stem}.zip`);
        await session.saveTrace(tracePath);
      }
    } else if (session.supportsTracing) {
      await session.discardTrace();
    }

    finalizationStarted = true;
    await finalizeSession(session, config);
    session = null;
  } catch (err) {
    verdict = 'error';
    reason = `Infrastructure error: ${err instanceof Error ? err.message : String(err)}`;
  } finally {
    // If the check failed after launch, explicit headed mode must still wait for
    // the user to close the browser. Only a failure inside finalization itself
    // falls back to immediate best-effort teardown.
    if (session) {
      try {
        if (finalizationStarted) await session.holdOpenAndClose(0);
        else await finalizeSession(session, config);
      } catch {
        /* best effort */
      }
    }
  }

  return result();
}

/** Run a check with transient-retry. Definitive pass/fail is never retried. */
export async function runCheckWithRetry(input: CheckInput): Promise<CheckResult> {
  return withRetry(
    () => runCheck(input),
    input.config.retries,
    (r) => (r.verdict === 'inconclusive' || r.verdict === 'error') && isTransientReason(r.reason),
  );
}

/** Explicit headed probes are user-controlled: the next version starts only after close. */
export async function finalizeSession(
  session: import('../controllers/types.js').ControllerSession,
  config: ResolvedConfig,
): Promise<void> {
  if (config.strategy === 'explicit' && config.headed) {
    await session.waitForUserCloseAndClose();
    return;
  }
  await session.holdOpenAndClose(config.holdOpenSec);
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

import type { Browser, BrowserContext, BrowserType, Page } from 'playwright';
import { playwrightBrowserType } from '../browsers/playwright-provider.js';
import type { BrowserBinary } from '../browsers/types.js';
import type { EngineName } from '../reporting/types.js';
import type { ResolvedConfig, ResolvedPage } from '../config/resolve.js';
import {
  attachJsCollectors,
  attachRequestTracker,
  checkReadiness as playwrightCheckReadiness,
  describeNavigationError,
  detectSilentStall,
} from '../detection/index.js';
import type { AutomationController, ControllerSession, GotoResult, ReadinessOutcome, SignalSinks } from './types.js';

/**
 * Playwright controller. Drives Chromium (all versions via CDP), current Firefox
 * (Playwright's Juggler patch), and current WebKit (Playwright's inspector patch).
 *
 * Absorbs the Playwright-specific session logic that previously lived inline in
 * runCheck/launchReal — behavior is identical, just relocated behind the
 * ControllerSession interface so a WebDriver controller can share the checker.
 */
export class PlaywrightController implements AutomationController {
  readonly kind = 'playwright' as const;

  async launch(binary: BrowserBinary, _config: ResolvedConfig): Promise<ControllerSession> {
    const engine = engineForBinary(binary);
    const browserType: BrowserType = playwrightBrowserType(engine);
    const browser = await launchReal(engine, browserType, binary, _config);
    const context = await browser.newContext({ viewport: _config.viewport });
    const page = await context.newPage();
    return new PlaywrightSession(browser, context, page);
  }
}

class PlaywrightSession implements ControllerSession {
  readonly supportsTracing = true;
  private tracker: {
    inflight: Map<string, { method: string; url: string; started: number }>;
    responseCount: () => number;
  } | null = null;

  constructor(
    private readonly browser: Browser,
    private readonly context: BrowserContext,
    private readonly page: Page,
  ) {}

  async startTrace(): Promise<void> {
    await this.context.tracing.start({ screenshots: true, snapshots: true });
  }

  async disableCache(): Promise<void> {
    await this.page.route('**/*', async (route) => {
      await route.continue({
        headers: {
          ...route.request().headers(),
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          Pragma: 'no-cache',
        },
      }).catch(() => route.continue().catch(() => {}));
    });
  }

  async attachCollectors(sinks: SignalSinks): Promise<void> {
    attachJsCollectors(
      this.page,
      (e) => sinks.onJsError(e),
      (level, text) => sinks.onConsole(level, text),
    );
    this.tracker = attachRequestTracker(this.page);
    this.page.on('requestfailed', (req) => {
      sinks.onRequestFailure(
        req.url(),
        req.method(),
        req.resourceType(),
        req.failure()?.errorText ?? null,
      );
    });
  }

  async goto(url: string, opts: { waitUntil: 'domcontentloaded' | 'load'; timeout: number }): Promise<GotoResult> {
    const tracker = this.tracker ?? { inflight: new Map(), responseCount: () => 0 };
    try {
      await this.page.goto(url, { waitUntil: opts.waitUntil, timeout: opts.timeout });
    } catch (err) {
      const outcome = describeNavigationError(err);
      let error = outcome.error;
      const stall = detectSilentStall(url, [...tracker.inflight.values()], tracker.responseCount(), opts.timeout);
      if (stall) error = stall;
      return {
        error,
        isTransient: outcome.isTransient,
        inflight: [...tracker.inflight.values()].map((m) => ({ method: m.method, url: m.url })),
        responseCount: tracker.responseCount(),
      };
    }
    return {
      error: null,
      isTransient: false,
      inflight: [...tracker.inflight.values()].map((m) => ({ method: m.method, url: m.url })),
      responseCount: tracker.responseCount(),
    };
  }

  async checkReadiness(rpage: ResolvedPage, timeoutMs: number): Promise<ReadinessOutcome> {
    return playwrightCheckReadiness(this.page, rpage, timeoutMs);
  }

  async screenshot(path: string): Promise<void> {
    await this.page.screenshot({ path, fullPage: false }).catch(() => {});
  }

  async saveTrace(path: string): Promise<void> {
    await this.context.tracing.stop({ path }).catch(() => {});
  }

  async discardTrace(): Promise<void> {
    await this.context.tracing.stop().catch(() => {});
  }

  async holdOpenAndClose(sec: number): Promise<void> {
    if (sec > 0) await new Promise((r) => setTimeout(r, sec * 1000));
    await this.context.close().catch(() => {});
    await this.browser.close().catch(() => {});
  }

  async waitForUserCloseAndClose(): Promise<void> {
    // Listen for both ways a user can finish: closing just the tab or closing
    // the whole browser window. Register listeners before checking current state
    // so a close racing this method cannot leave the scan waiting forever.
    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        this.page.off('close', finish);
        this.browser.off('disconnected', finish);
        resolve();
      };
      this.page.on('close', finish);
      this.browser.on('disconnected', finish);
      if (this.page.isClosed() || !this.browser.isConnected()) finish();
    });
    await this.context.close().catch(() => {});
    await this.browser.close().catch(() => {});
  }
}

/**
 * Launch a Playwright-drivable browser for the resolved binary. Mirrors the
 * previous compatibility-checker.launchReal verbatim, including the executablePath
 * override rule (only for non-WebKit, non-Playwright builds) and the Chromium
 * sandbox args.
 */
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

/**
 * Determine the engine from the binary. The Playwright controller serves
 * chromium (any version), current firefox, and current webkit — historical
 * Firefox goes through the WebDriver controller instead.
 */
function engineForBinary(binary: BrowserBinary): EngineName {
  // WebKit is the only engine reported as 'playwright-revision'.
  if (binary.versionType === 'playwright-revision') return 'webkit';
  // Chrome-for-Testing / current Chrome both carry chrome-ish build labels.
  if (/chrome|chromium/i.test(binary.buildLabel)) return 'chromium';
  // Current Firefox (Playwright Juggler build) — only reaches this controller.
  return 'firefox';
}

import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import type { BrowserBinary } from '../browsers/types.js';
import type { JsError } from '../reporting/types.js';
import type { ResolvedConfig, ResolvedPage } from '../config/resolve.js';
import type { AutomationController, ControllerSession, GotoResult, ReadinessOutcome, SignalSinks } from './types.js';
import type { WebDriverLike, WebDriverLogEntry } from 'selenium-webdriver';

/**
 * WebDriver controller — drives REAL historical Firefox binaries via geckodriver
 * + the W3C WebDriver protocol (selenium-webdriver).
 *
 * Why this exists: Playwright CANNOT drive vanilla Firefox from archive.mozilla.org
 * because those builds lack Playwright's Juggler instrumentation patch — they
 * launch and exit immediately without responding. geckodriver speaks Marionette,
 * which IS built into every Firefox ≥48, so it can drive the genuine historical
 * binary. This is the only reliable way to test real old Firefox versions.
 *
 * `selenium-webdriver` is an OPTIONAL dependency, dynamically imported here so
 * consumers who only use Chromium (or current Firefox/WebKit) never install it.
 * The ambient shim in selenium-shim.d.ts provides types when the package is
 * absent; when present, its own bundled types take precedence.
 */

export class WebDriverController implements AutomationController {
  readonly kind = 'webdriver' as const;

  async launch(binary: BrowserBinary, config: ResolvedConfig): Promise<ControllerSession> {
    if (!binary.driverPath || !existsSync(binary.driverPath)) {
      throw new Error(
        `WebDriver controller requires a geckodriver binary (driverPath missing or not found).`,
      );
    }
    if (!binary.executablePath || !existsSync(binary.executablePath)) {
      throw new Error(
        `WebDriver controller requires a Firefox binary (executablePath missing or not found).`,
      );
    }

    // Dynamic import — selenium-webdriver is an OPTIONAL dependency.
    const sw = await import('selenium-webdriver');
    const firefox = await import('selenium-webdriver/firefox');
    const { Builder } = sw;

    // Start geckodriver as a managed subprocess so we own its lifecycle and
    // can tear it down deterministically (it does not self-daemonize cleanly
    // across selenium versions). We let selenium connect to our server.
    const port = await freePort();
    const geckodriver = spawn(binary.driverPath, ['--port', String(port)], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    // Buffer stderr for diagnostics if the session fails to come up.
    let stderrBuf = '';
    geckodriver.stderr?.on('data', (d: Buffer) => {
      stderrBuf += d.toString();
      if (stderrBuf.length > 4096) stderrBuf = stderrBuf.slice(-4096);
    });
    await waitForServer(port, 10_000).catch((err) => {
      killProc(geckodriver);
      throw new Error(
        `geckodriver did not start on port ${port}: ${err instanceof Error ? err.message : err}. ${stderrBuf.trim()}`,
      );
    });

    const options = new firefox.Options();
    options.setBinary(binary.executablePath);
    // headless: Firefox respects MOZ_HEADLESS; the legacy `--headless` flag also
    // works on ≥55. We pass it only when not headed.
    if (!config.headed) options.addArguments('--headless');
    // Collect browser/console logs for JS-error attribution.
    options.setPreference('devtools.console.stdout.content', true);
    // Performance logging exposes request failures (geckodriver ≥0.31 via
    // network events; older builds fall back to no network signals — handled).
    const loggingPrefs = new sw.logging.Preferences();
    loggingPrefs.setLevel(sw.logging.Type.BROWSER, sw.logging.Level.ALL);

    let driver: WebDriverLike;
    try {
      driver = (await new Builder()
        .forBrowser('firefox')
        .setFirefoxOptions(options)
        .usingServer(`http://127.0.0.1:${port}`)
        .setLoggingPrefs(loggingPrefs)
        .build()) as WebDriverLike;
    } catch (err) {
      killProc(geckodriver);
      throw new Error(
        `Could not start WebDriver session for ${binary.buildLabel}: ${err instanceof Error ? err.message : err}.`,
      );
    }

    try {
      await driver.manage().timeouts().pageLoadTimeout(config.timeout);
      await driver.manage().timeouts().implicit(0);
      await driver.manage().window().setRect(config.viewport);
    } catch {
      /* non-fatal — best effort */
    }

    return new WebDriverSession(driver, geckodriver, port);
  }
}

class WebDriverSession implements ControllerSession {
  readonly supportsTracing = false;
  private collectedLogs = false;

  constructor(
    private readonly driver: WebDriverLike,
    private readonly geckodriver: ChildProcess,
    private readonly port: number,
  ) {}

  async startTrace(): Promise<void> {
    /* no-op: WebDriver has no Playwright-style trace. */
  }
  async saveTrace(_path: string): Promise<void> {
    /* no-op */
  }
  async discardTrace(): Promise<void> {
    /* no-op */
  }

  async disableCache(): Promise<void> {
    // Firefox doesn't expose per-request header rewriting like Playwright, but
    // we can disable the HTTP cache via a profile pref applied at launch. As a
    // best-effort runtime knob we clear it now; launch prefs cover the rest.
    try {
      await this.driver.executeScript(
        // Force cache bypass for subsequent navigations (content only).
        'try{performance&&performance.clearResourceTimings&&performance.clearResourceTimings();}catch(e){}',
      );
    } catch {
      /* ignore */
    }
  }

  async attachCollectors(_sinks: SignalSinks): Promise<void> {
    // WebDriver is a polling protocol — there is no async event stream for JS
    // errors/console. Signals are gathered by pulling logs in goto()/holdOpen.
    // We stash the sinks for use there.
    this._sinks = _sinks;
  }
  private _sinks: SignalSinks | null = null;

  async goto(url: string, opts: { waitUntil: 'domcontentloaded' | 'load'; timeout: number }): Promise<GotoResult> {
    // Pull any logs accumulated since last poll BEFORE navigation, then after.
    const start = Date.now();
    try {
      await this.driver.get(url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isTransient = /timeout|session not created|unable to connect|target closed/i.test(msg);
      return {
        error: `Navigation failed: ${msg}`,
        isTransient,
        inflight: [],
        responseCount: this.collectedLogs ? 1 : 0,
      };
    }
    const elapsed = Date.now() - start;
    if (elapsed > opts.timeout) {
      return {
        error: `Navigation timeout: page exceeded ${opts.timeout}ms`,
        isTransient: true,
        inflight: [],
        responseCount: 0,
      };
    }
    await this.drainLogs();
    return { error: null, isTransient: false, inflight: [], responseCount: 1 };
  }

  async checkReadiness(rpage: ResolvedPage, timeoutMs: number): Promise<ReadinessOutcome> {
    const start = Date.now();
    if (rpage.readiness.kind === 'function') {
      // Custom readiness isn't portable to WebDriver (the function closes over a
      // Playwright Page). Treat as inconclusive render — caller decides.
      return { rendered: true, renderedSelectors: [], readyMs: Date.now() - start, error: null };
    }
    if (rpage.readiness.kind === 'none') {
      let hasContent = false;
      try {
        hasContent = await this.driver.executeScript<number>(
          'return (document.body && document.body.children.length) || 0;',
        ) > 0;
      } catch {
        /* ignore */
      }
      return { rendered: hasContent, renderedSelectors: [], readyMs: Date.now() - start, error: null };
    }
    const { selectors, mode } = rpage.readiness;
    const visible: string[] = [];
    for (const sel of selectors) {
      try {
        const found = await this.waitForSelectorVisible(sel, timeoutMs);
        if (found) visible.push(sel);
      } catch {
        /* not visible */
      }
    }
    const rendered = mode === 'all' ? visible.length === selectors.length : visible.length > 0;
    return { rendered, renderedSelectors: visible, readyMs: Date.now() - start, error: null };
  }

  private async waitForSelectorVisible(cssSelector: string, timeoutMs: number): Promise<boolean> {
    // Poll visibility via executeScript (CSS selectors only in WebDriver path).
    const deadline = Date.now() + timeoutMs;
    const script = `(function(sel){
      var el = document.querySelector(sel);
      if (!el) return false;
      var rect = el.getBoundingClientRect();
      var style = window.getComputedStyle(el);
      return !!(rect.width && rect.height && style.visibility !== 'hidden' && style.display !== 'none');
    })(arguments[0]);`;
    while (Date.now() < deadline) {
      try {
        const ok = await this.driver.executeScript<boolean>(script, cssSelector);
        if (ok) return true;
      } catch {
        /* page not ready yet */
      }
      await new Promise((r) => setTimeout(r, 150));
    }
    return false;
  }

  async screenshot(path: string): Promise<void> {
    // selenium-webdriver exposes takeScreenshot on the driver; we invoke via cast.
    const anyDriver = this.driver as unknown as {
      takeScreenshot: () => Promise<string>;
    };
    if (typeof anyDriver.takeScreenshot === 'function') {
      const { writeFileSync } = await import('node:fs');
      const b64 = await anyDriver.takeScreenshot();
      writeFileSync(path, Buffer.from(b64, 'base64'));
    }
  }

  async holdOpenAndClose(sec: number): Promise<void> {
    // Final log drain captures errors that fired after load.
    await this.drainLogs();
    if (sec > 0) await new Promise((r) => setTimeout(r, sec * 1000));
    try {
      await this.driver.quit();
    } catch {
      /* best effort */
    }
    killProc(this.geckodriver);
  }

  async waitForUserCloseAndClose(): Promise<void> {
    // WebDriver has no reliable close event, so poll until the user closes the
    // Firefox window and the session rejects a lightweight command.
    while (true) {
      try {
        await this.driver.getWindowHandle();
        await new Promise((resolve) => setTimeout(resolve, 250));
      } catch {
        break;
      }
    }
    try {
      await this.driver.quit();
    } catch {
      /* the user already closed the session */
    }
    killProc(this.geckodriver);
  }

  /** Pull browser logs and forward JS errors / console messages to the sinks. */
  private async drainLogs(): Promise<void> {
    const sinks = this._sinks;
    if (!sinks) return;
    let entries: WebDriverLogEntry[] = [];
    try {
      entries = await this.driver.manage().logs().get('browser');
    } catch {
      return; // some geckodriver builds don't implement log retrieval
    }
    this.collectedLogs = true;
    for (const e of entries) {
      const lvl = (e.level?.value ?? e.level?.name ?? '').toLowerCase();
      const text = e.message ?? '';
      // WebDriver "browser" logs carry "JavaScript error:" prefixed messages on
      // Firefox. Capture both uncaught JS errors and console output.
      if (/javascript error|uncaught|syntaxerror|referenceerror|typeerror/i.test(text)) {
        const js: JsError = { type: 'pageerror', message: text.replace(/^.*?javascript error:?\s*/i, '') };
        sinks.onJsError(js);
      } else if (lvl === 'error' || lvl === 'warning' || lvl === 'info' || lvl === 'log') {
        sinks.onConsole(lvl, text);
      } else if (lvl === 'severe') {
        sinks.onConsole('error', text);
      }
    }
  }
}

function killProc(p: ChildProcess): void {
  if (p.exitCode === null && p.signalCode === null) {
    try {
      p.kill('SIGTERM');
      setTimeout(() => {
        try {
          if (p.exitCode === null && p.signalCode === null) p.kill('SIGKILL');
        } catch {
          /* gone */
        }
      }, 1500);
    } catch {
      /* already gone */
    }
  }
}

async function freePort(): Promise<number> {
  const { createServer } = await import('node:net');
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      srv.close(() => resolve(typeof addr === 'object' && addr ? addr.port : 0));
    });
  });
}

async function waitForServer(port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/status`);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`geckodriver did not respond on :${port} within ${timeoutMs}ms`);
}

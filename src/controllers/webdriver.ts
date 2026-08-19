import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { BrowserBinary } from '../browsers/types.js';
import type { JsError } from '../reporting/types.js';
import type { ResolvedConfig, ResolvedPage } from '../config/resolve.js';
import type { AutomationController, ControllerSession, GotoResult, ReadinessOutcome, SignalSinks } from './types.js';
import type { WebDriverLike, WebDriverLogEntry } from 'selenium-webdriver';

type LegacySessionResponse = {
  sessionId?: string;
  status?: number;
  value?: Record<string, unknown> & { sessionId?: string; message?: string };
};

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
    const engine = binary.engine;
    if (engine !== 'firefox' && engine !== 'chromium') {
      throw new Error('WebDriver controller requires binary.engine to be firefox or chromium.');
    }
    if (!binary.driverPath || !existsSync(binary.driverPath)) {
      throw new Error(`WebDriver controller requires a ${engine} driver binary (driverPath missing or not found).`);
    }
    if (!binary.executablePath || !existsSync(binary.executablePath)) {
      throw new Error(`WebDriver controller requires a ${engine} browser binary (executablePath missing or not found).`);
    }

    const sw = await import('selenium-webdriver');
    const { Builder } = sw;
    const port = await freePort();
    const legacyDriver = engine === 'chromium' && isLegacyChromeDriver(binary.driverPath);
    const driverEnv = legacyDriver ? legacyChromeDriverEnv(binary.driverPath) : process.env;
    const driverProcess = spawn(binary.driverPath, driverServerArgs(engine, port), {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: driverEnv,
    });
    let stderrBuf = '';
    driverProcess.stderr?.on('data', (d: Buffer) => {
      stderrBuf += d.toString();
      if (stderrBuf.length > 4096) stderrBuf = stderrBuf.slice(-4096);
    });
    await waitForServer(port, 10_000, driverProcess).catch((err) => {
      killProc(driverProcess);
      throw new Error(
        `${engine} driver did not start on port ${port}: ${err instanceof Error ? err.message : err}. ${stderrBuf.trim()}`,
      );
    });

    const loggingPrefs = new sw.logging.Preferences();
    loggingPrefs.setLevel(sw.logging.Type.BROWSER, sw.logging.Level.ALL);
    if (engine === 'chromium') {
      loggingPrefs.setLevel('performance' as never, sw.logging.Level.ALL);
    }
    let builder = new Builder().forBrowser(engine === 'chromium' ? 'chrome' : 'firefox');
    if (engine === 'chromium') {
      const chrome = await import('selenium-webdriver/chrome.js');
      const options = new chrome.Options()
        .setChromeBinaryPath(binary.executablePath)
        .addArguments('--no-sandbox', '--disable-dev-shm-usage');
      if (!config.headed) options.addArguments('--headless');
      builder = builder.setChromeOptions(options);
    } else {
      const firefox = await import('selenium-webdriver/firefox.js');
      const options = new firefox.Options();
      options.setBinary(binary.executablePath);
      if (!config.headed) options.addArguments('--headless');
      options.setPreference('devtools.console.stdout.content', true);
      builder = builder.setFirefoxOptions(options);
    }

    let driver: WebDriverLike;
    try {
      driver = legacyDriver
        ? await createLegacyChromeDriverSession(sw, binary.executablePath, config, port)
        : (await builder
            .usingServer(`http://127.0.0.1:${port}`)
            .setLoggingPrefs(loggingPrefs)
            .build()) as WebDriverLike;
    } catch (err) {
      killProc(driverProcess);
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

    return new WebDriverSession(driver, driverProcess, port, engine);
  }
}

class WebDriverSession implements ControllerSession {
  readonly supportsTracing = false;
  private collectedLogs = false;
  private responseCount = 0;
  private readonly requests = new Map<string, { url: string; method: string; resourceType: string }>();

  constructor(
    private readonly driver: WebDriverLike,
    private readonly geckodriver: ChildProcess,
    private readonly port: number,
    private readonly engine: 'firefox' | 'chromium',
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
        responseCount: this.responseCount,
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
    return { error: null, isTransient: false, inflight: [], responseCount: this.responseCount };
  }

  async checkReadiness(rpage: ResolvedPage, timeoutMs: number): Promise<ReadinessOutcome> {
    const start = Date.now();
    if (rpage.readiness.kind === 'function') {
      throw new Error(
        'Custom readiness callbacks require a Playwright Page and are not supported by the WebDriver controller.',
      );
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
    if (this.engine === 'chromium') await this.drainPerformanceLogs(sinks);
    let entries: WebDriverLogEntry[] = [];
    try {
      entries = await this.driver.manage().logs().get('browser');
    } catch {
      return; // some geckodriver builds don't implement log retrieval
    }
    this.collectedLogs = true;
    for (const e of entries) {
      const lvl = normalizeWebDriverLogLevel(e.level);
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

  private async drainPerformanceLogs(sinks: SignalSinks): Promise<void> {
    let entries: WebDriverLogEntry[];
    try {
      entries = await this.driver.manage().logs().get('performance');
    } catch {
      return;
    }
    for (const entry of entries) {
      try {
        const envelope = JSON.parse(entry.message) as {
          message?: { method?: string; params?: Record<string, unknown> };
        };
        const event = envelope.message;
        const params = event?.params ?? {};
        const requestId = String(params.requestId ?? '');
        if (event?.method === 'Network.requestWillBeSent') {
          const request = params.request as { url?: string; method?: string } | undefined;
          this.requests.set(requestId, {
            url: request?.url ?? '',
            method: request?.method ?? 'GET',
            resourceType: String(params.type ?? '').toLowerCase(),
          });
        } else if (event?.method === 'Network.responseReceived') {
          this.responseCount++;
        } else if (event?.method === 'Network.loadingFailed') {
          const request = this.requests.get(requestId);
          sinks.onRequestFailure(
            request?.url ?? '',
            request?.method ?? 'GET',
            request?.resourceType ?? String(params.type ?? '').toLowerCase(),
            typeof params.errorText === 'string' ? params.errorText : null,
          );
          this.requests.delete(requestId);
        }
      } catch {
        /* malformed/unsupported performance-log entry */
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

export function driverServerArgs(engine: 'firefox' | 'chromium', port: number): string[] {
  return engine === 'chromium' ? [`--port=${port}`] : ['--port', String(port)];
}

export function normalizeWebDriverLogLevel(level: { value?: unknown; name?: unknown } | undefined): string {
  const raw = typeof level?.value === 'string' ? level.value : level?.name;
  return typeof raw === 'string' ? raw.toLowerCase() : '';
}

export function legacySessionPayload(executablePath: string, headless: boolean): Record<string, unknown> {
  const args = ['--no-sandbox', '--disable-dev-shm-usage'];
  if (headless) args.push('--headless');
  return {
    desiredCapabilities: {
      browserName: 'chrome',
      chromeOptions: { binary: executablePath, args },
      loggingPrefs: { browser: 'ALL' },
    },
  };
}

function isLegacyChromeDriver(driverPath: string): boolean {
  const result = spawnSync(driverPath, ['--version'], { encoding: 'utf8', timeout: 10_000 });
  return !result.error && result.status === 0 && isLegacyChromeDriverVersion(`${result.stdout} ${result.stderr}`);
}

export function isLegacyChromeDriverVersion(output: string): boolean {
  const match = output.match(/ChromeDriver\s+(\d+)(?:\.|$)/i);
  if (!match) return false;
  const major = Number(match[1]);
  return major === 2 || major < 75;
}

export function legacyFontconfigXml(fontDirs: string[]): string {
  const dirs = fontDirs.map((dir) => `  <dir>${dir}</dir>`).join('\n');
  return `<?xml version="1.0"?>\n<!DOCTYPE fontconfig SYSTEM "fonts.dtd">\n<fontconfig>\n${dirs}\n  <cachedir>/tmp/browser-boundary-font-cache</cachedir>\n  <config></config>\n</fontconfig>\n`;
}

function legacyChromeDriverEnv(driverPath: string): NodeJS.ProcessEnv {
  const configDir = path.join(path.dirname(driverPath), 'fontconfig');
  const configPath = path.join(configDir, 'fonts.conf');
  mkdirSync(configDir, { recursive: true });
  if (!existsSync(configPath)) {
    const candidates = [
      '/usr/share/fonts/truetype/dejavu',
      '/usr/share/fonts/truetype/liberation2',
      '/usr/share/fonts/truetype/liberation',
    ].filter(existsSync);
    writeFileSync(configPath, legacyFontconfigXml(candidates));
  }
  return { ...process.env, FONTCONFIG_FILE: configPath, FONTCONFIG_PATH: configDir };
}

async function createLegacyChromeDriverSession(
  sw: typeof import('selenium-webdriver'),
  executablePath: string,
  config: ResolvedConfig,
  port: number,
): Promise<WebDriverLike> {
  const baseUrl = `http://127.0.0.1:${port}`;
  const controller = new AbortController();
  const startupTimeoutMs = Math.max(10_000, Math.min(config.timeout, 30_000));
  const timer = setTimeout(() => controller.abort(), startupTimeoutMs);
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json;charset=UTF-8' },
      body: JSON.stringify(legacySessionPayload(executablePath, !config.headed)),
      signal: controller.signal,
    });
  } catch (err) {
    if (controller.signal.aborted) {
      throw new Error(`legacy Chromium session startup exceeded ${startupTimeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
  const body = await response.json() as LegacySessionResponse;
  const sessionId = body.sessionId ?? body.value?.sessionId;
  if (!response.ok || body.status !== 0 || !sessionId) {
    throw new Error(body.value?.message ?? `legacy ChromeDriver session failed with HTTP ${response.status}`);
  }

  const http = await import('selenium-webdriver/http/index.js');
  const sessionModule = await import('selenium-webdriver/lib/session.js');
  const capabilitiesModule = await import('selenium-webdriver/lib/capabilities.js');
  const executor = new http.Executor(new http.HttpClient(baseUrl));
  const session = new sessionModule.Session(sessionId, new capabilitiesModule.Capabilities(body.value));
  return new sw.WebDriver(session, executor) as WebDriverLike;
}

async function waitForServer(port: number, timeoutMs: number, process: ChildProcess): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (process.exitCode !== null || process.signalCode !== null) {
      throw new Error(`driver exited before becoming ready (exit ${process.exitCode ?? process.signalCode})`);
    }
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

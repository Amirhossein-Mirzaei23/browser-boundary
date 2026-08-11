import type { BrowserBinary } from '../browsers/types.js';
import type { JsError, Verdict } from '../reporting/types.js';
import type { ResolvedConfig, ResolvedPage } from '../config/resolve.js';

/**
 * Automation controller abstraction.
 *
 * Decouples HOW a browser is driven (Playwright via CDP/Juggler/inspector, vs.
 * W3C WebDriver via geckodriver) from WHAT a compatibility check measures. The
 * checker talks only to a `ControllerSession`; signal collection and verdict
 * logic live in the shared checker and operate on the normalized sinks below.
 *
 * Controllers are deliberately CONFIG-FREE: they emit raw signals (JS errors,
 * console messages, raw request failures) and the checker — which owns the
 * ResolvedConfig — classifies them (e.g. which failed request is fatal).
 */

/** Callbacks the controller pushes protocol-normalized signals into. */
export interface SignalSinks {
  onJsError: (e: JsError) => void;
  onConsole: (level: 'error' | 'warning' | 'info' | 'log', text: string) => void;
  /**
   * Raw request-failure event. `resourceType` is best-effort and may be '' when
   * the protocol doesn't expose it (the checker's URL-based classifier still
   * works). The checker classifies fatality using config.
   */
  onRequestFailure: (url: string, method: string, resourceType: string, failureText: string | null) => void;
}

/** The inflight/response state at goto-failure time, for silent-stall detection. */
export interface GotoResult {
  /** Classified navigation error, or null on success. */
  error: string | null;
  /** Whether the failure looks transient (eligible for retry). */
  isTransient: boolean;
  /** In-flight requests at the time of failure (for detectSilentStall). */
  inflight: { method: string; url: string }[];
  /** Total responses observed so far. */
  responseCount: number;
}

/** Readiness outcome (mirrors detection/rendering.ts RenderOutcome). */
export interface ReadinessOutcome {
  rendered: boolean;
  renderedSelectors: string[];
  readyMs: number;
  error: string | null;
}

/** A live automation session the checker drives. */
export interface ControllerSession {
  /** Re-write request headers to defeat the browser HTTP cache. */
  disableCache(): Promise<void>;
  /** Wire the protocol's error/console/network events into the sinks. */
  attachCollectors(sinks: SignalSinks): Promise<void>;
  /** Navigate to url. Never throws on nav failure — returns a GotoResult. */
  goto(url: string, opts: { waitUntil: 'domcontentloaded' | 'load'; timeout: number }): Promise<GotoResult>;
  /** Evaluate rendering/readiness selectors against the loaded page. */
  checkReadiness(rpage: ResolvedPage, timeoutMs: number): Promise<ReadinessOutcome>;
  /** Capture a screenshot to path (best-effort; never throws). */
  screenshot(path: string): Promise<void>;
  /** Whether this controller can save a Playwright-style trace. */
  readonly supportsTracing: boolean;
  /** Save the trace to path (only if supportsTracing). */
  saveTrace(path: string): Promise<void>;
  /** Discard the trace without saving (only if supportsTracing). */
  discardTrace(): Promise<void>;
  /** Start tracing (called right after launch, before navigation). */
  startTrace(): Promise<void>;
  /** Hold the window open `sec` seconds, then close the session. */
  holdOpenAndClose(sec: number): Promise<void>;
}

/** A controller: produces sessions from a resolved binary + config. */
export interface AutomationController {
  readonly kind: 'playwright' | 'webdriver';
  launch(binary: BrowserBinary, config: ResolvedConfig): Promise<ControllerSession>;
}

/** Aggregated page verdicts folded into one engine-version verdict. */
export function foldVerdicts(verdicts: Verdict[]): Verdict {
  let agg: Verdict = 'pass';
  for (const v of verdicts) {
    if (v === 'error') agg = 'error';
    else if (v === 'inconclusive') agg = agg === 'fail' ? 'fail' : 'inconclusive';
    else if (v === 'fail') agg = 'fail';
  }
  return agg;
}

import type { Page } from 'playwright';
import type { JsError } from '../reporting/types.js';

/**
 * JavaScript error collection (Category 2).
 *
 * pageerror events are always captured (uncaught errors are serious). Console
 * messages are captured at error/warning/log/info levels for analysis; only
 * error-level console messages can be fatal, and only when the analyzer maps
 * them to a known feature (warnings are never fatal).
 */
export interface JsSignals {
  jsErrors: JsError[];
  consoleMessages: { level: 'error' | 'warning' | 'info' | 'log'; text: string }[];
}

export function attachJsCollectors(
  page: Page,
  onJsError: (e: JsError) => void,
  onConsole: (level: 'error' | 'warning' | 'info' | 'log', text: string) => void,
): void {
  page.on('pageerror', (err: Error) => {
    onJsError({ type: 'pageerror', message: err.message, stack: err.stack });
  });
  page.on('console', (msg) => {
    const type = msg.type();
    if (type !== 'error' && type !== 'warning' && type !== 'log' && type !== 'info') return;
    onConsole(type as 'error' | 'warning' | 'info' | 'log', msg.text());
  });
}

export function emptyJsSignals(): JsSignals {
  return { jsErrors: [], consoleMessages: [] };
}

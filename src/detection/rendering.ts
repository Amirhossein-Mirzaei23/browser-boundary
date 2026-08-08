import type { Page } from 'playwright';
import type { ResolvedPage } from '../config/resolve.js';

/**
 * Rendering & readiness checks (Categories 4 & 5).
 *
 * Readiness is fully generic and configured per-URL:
 *  - selectors with mode 'any' (≥1 visible) or 'all' (every selector visible)
 *  - a custom async function (for SPAs needing a client-side predicate)
 *  - 'none' (no readiness gate; rendering relies on the document existing)
 *
 * The core never contains site-specific selectors.
 */
export interface RenderOutcome {
  rendered: boolean;
  renderedSelectors: string[];
  readyMs: number;
  /** Error if the readiness function threw (treated as a render failure). */
  error: string | null;
}

export async function checkReadiness(
  page: Page,
  rpage: ResolvedPage,
  timeoutMs: number,
): Promise<RenderOutcome> {
  const start = Date.now();

  if (rpage.readiness.kind === 'function') {
    try {
      const ok = await rpage.readiness.fn({ page });
      return {
        rendered: !!ok,
        renderedSelectors: [],
        readyMs: Date.now() - start,
        error: ok ? null : 'Custom readiness function returned false.',
      };
    } catch (e) {
      return {
        rendered: false,
        renderedSelectors: [],
        readyMs: Date.now() - start,
        error: `Readiness function threw: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }

  if (rpage.readiness.kind === 'none') {
    // No selector gate; treat the document body having content as rendered.
    let hasContent = false;
    try {
      // Runs in the browser page; cast to avoid needing DOM lib in the Node build.
      hasContent = await page.evaluate<boolean>(
        () => ((globalThis as unknown as { document?: { body?: { children?: unknown[] } } }).document?.body?.children?.length ?? 0) > 0,
      );
    } catch {
      /* ignore */
    }
    return { rendered: hasContent, renderedSelectors: [], readyMs: Date.now() - start, error: null };
  }

  const { selectors, mode } = rpage.readiness;
  const visible: string[] = [];
  for (const sel of selectors) {
    try {
      await page.waitForSelector(sel, { state: 'visible', timeout: timeoutMs });
      visible.push(sel);
    } catch {
      /* not visible; recorded by absence */
    }
  }
  const rendered = mode === 'all' ? visible.length === selectors.length : visible.length > 0;
  return {
    rendered,
    renderedSelectors: visible,
    readyMs: Date.now() - start,
    error: null,
  };
}

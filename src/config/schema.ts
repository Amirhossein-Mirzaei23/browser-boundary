import type { EngineName } from '../reporting/types.js';

/**
 * Generic configuration model. The core has NO hard-coded knowledge of any
 * specific website, selectors, analytics hosts, or anti-bot behavior — all of
 * that is supplied through this config. Selectors/readiness live per-URL in
 * `pages`, never in the core.
 */

export type SearchStrategy = 'step-down' | 'binary' | 'latest' | 'explicit';

/** A readiness check for a page. Either declarative selectors or a function. */
export type ReadinessSpec =
  | { selectors: string[]; mode?: 'any' | 'all' }
  | ((ctx: { page: import('playwright').Page }) => Promise<boolean>);

/** A page to test. A bare string is equivalent to { url }. */
export interface PageSpec {
  url: string;
  label?: string;
  /** Per-URL readiness; overrides the top-level default. */
  readiness?: ReadinessSpec;
}

/** Resource types Playwright reports. */
export type ResourceType =
  | 'document' | 'script' | 'stylesheet' | 'xhr' | 'fetch'
  | 'image' | 'font' | 'media' | 'websocket' | 'other';

export interface ScanConfig {
  /** Pages to test. Each entry may be a bare URL or a full PageSpec. */
  urls: (string | PageSpec)[];
  /** Engines to scan. */
  engines?: EngineName[];
  /** A human site name used in report titles (defaults to first URL origin). */
  siteName?: string;

  search?: {
    strategy?: SearchStrategy;
    /** Major-version step before binary-searching. Default 10. */
    stepSize?: number;
    /** Don't search below this major version per engine. */
    floor?: Partial<Record<EngineName, number>>;
    /** Only used when strategy is 'explicit'. */
    explicitVersions?: Partial<Record<EngineName, string[]>>;
  };

  checks?: {
    navigation?: boolean;
    javascript?: boolean;
    console?: boolean;
    network?: boolean;
    rendering?: boolean;
    readiness?: boolean;
  };

  /** Default readiness for pages that don't specify their own. */
  readiness?: Extract<ReadinessSpec, { selectors: string[] }>;

  network?: {
    /** URL patterns whose failed requests are NON-fatal (analytics/tracking). */
    ignoredPatterns?: (RegExp | string)[];
    /** Resource types whose failure IS fatal (app-critical). */
    criticalResourceTypes?: ResourceType[];
  };

  analysis?: {
    /** Errors below this confidence don't auto-FAIL a version. Default 'low'. */
    minConfidence?: 'high' | 'medium' | 'low' | 'unknown';
  };

  /** Lifecycle hooks. beforeGoto is opt-in (e.g. for sites needing a warm-up). */
  hooks?: {
    beforeGoto?: (ctx: { page: import('playwright').Page; url: string }) => Promise<void>;
    onStall?: (ctx: { url: string; reason: string }) => 'inconclusive' | 'fail';
  };

  timeout?: number;          // default 30000
  headed?: boolean;          // default false
  retries?: number;          // default 3 (transient only)
  viewport?: { width: number; height: number };

  output?: {
    format?: ('json' | 'markdown')[];
    directory?: string;       // default ./reports
  };

  cache?: {
    directory?: string;       // default ~/.cache/mrz-browser-compat
  };
}

export const DEFAULTS = {
  engines: ['chromium', 'firefox', 'webkit'] as EngineName[],
  timeout: 30_000,
  headed: false,
  retries: 3,
  viewport: { width: 1366, height: 768 },
  strategy: 'binary' as SearchStrategy,
  stepSize: 10,
  floor: { chromium: 60, firefox: 60, webkit: 13 } as Record<EngineName, number>,
  format: ['json', 'markdown'] as ('json' | 'markdown')[],
  outputDir: './reports',
  cacheDir: '~/.cache/mrz-browser-compat',
  criticalResourceTypes: ['script', 'stylesheet', 'xhr', 'fetch', 'font'] as ResourceType[],
  minConfidence: 'low' as const,
} as const;

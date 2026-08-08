import type { EngineName, ScanConfigSnapshot } from './types.js';

/**
 * Central, env-overridable configuration.
 *
 * All knobs can be set without editing code via BC_* environment variables,
 * which keeps CI runs and ad-hoc experiments scriptable.
 */

export interface PageProbe {
  url: string;
  /** Selectors that must become visible for the page to count as "rendered". */
  readinessSelectors: string[];
  /** Human label used in the report. */
  label: string;
}

/**
 * Selectors were discovered from the LIVE site (tabdeal.org), not invented.
 * The site is a Persian RTL SSR app (Nuxt/Next-style). Selectors are kept
 * resilient: stable nav hrefs + visible CTA anchors/text.
 */
export const PAGES: PageProbe[] = [
  {
    label: 'home',
    url: 'https://tabdeal.org',
    readinessSelectors: [
      'a[href="/"]', // logo
      'a[href="/buy-cryptocurrency"]', // primary nav entry
      'a[href="/swap"]', // easy-buy CTA
    ],
  },
  {
    label: 'buy-btc',
    url: 'https://tabdeal.org/buy-btc',
    readinessSelectors: [
      'a[href="/buy-btc"]', // self/nav link present
      'a[href="/panel/trade/BTC_IRT"]', // trade CTA
      'a[href="/swap?to-symbol=btc"]', // easy-buy CTA
    ],
  },
];

/** Engines to scan. Override with BC_ENGINES=chromium,firefox,webkit */
export const ALL_ENGINES: EngineName[] = ['chromium', 'firefox', 'webkit'];

function parseEngines(): EngineName[] {
  const raw = process.env.BC_ENGINES;
  if (!raw) return [...ALL_ENGINES];
  const requested = raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean) as EngineName[];
  return requested.filter((e) => ALL_ENGINES.includes(e));
}

function envInt(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function envBool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v === undefined) return fallback;
  return v === '1' || v.toLowerCase() === 'true' || v.toLowerCase() === 'yes';
}

export interface RuntimeConfig {
  /** Pages to test. Override a single URL set via BC_PAGES (comma-sep labels). */
  pages: PageProbe[];
  /** Engines to test. */
  engines: EngineName[];
  /** Per-page readiness/navigation timeout. */
  timeoutMs: number;
  /** Run browsers visibly. */
  headed: boolean;
  /** Only probe the latest available build per engine (smoke run). */
  latestOnly: boolean;
  /** Major-version step used by the step-down search before binary-searching. */
  stepSize: number;
  /**
   * Don't search below this major version per engine — sanity floor so we
   * don't attempt to fetch truly ancient binaries that can't run on modern
   * Linux anyway (e.g. Chrome < 60 lacks the modern sandbox/Linux ABI).
   */
  versionFloor: Record<EngineName, number>;
  /** Where to resolve real historical browser binaries. */
  browserCacheDir: string;
  /** Absolute reports dir. */
  reportsDir: string;
}

export function loadConfig(): RuntimeConfig {
  const labelFilter = process.env.BC_PAGES
    ?.split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const pages = labelFilter
    ? PAGES.filter((p) => labelFilter.includes(p.label))
    : PAGES;

  const versionFloor: Record<EngineName, number> = {
    chromium: envInt('BC_FLOOR_CHROMIUM', 60),
    firefox: envInt('BC_FLOOR_FIREFOX', 60),
    webkit: envInt('BC_FLOOR_WEBKIT', 13), // Safari/WebKit major
  };

  return {
    pages,
    engines: parseEngines(),
    timeoutMs: envInt('BC_TIMEOUT_MS', 30_000),
    headed: envBool('HEADED', false) || envBool('BC_HEADED', false),
    latestOnly: envBool('BC_LATEST_ONLY', false),
    stepSize: envInt('BC_STEP_SIZE', 10),
    versionFloor,
    browserCacheDir: process.env.BC_BROWSER_CACHE || './browser-cache',
    reportsDir: process.env.BC_REPORTS_DIR || './reports',
  };
}

/** Snapshot of the knobs that matter for reproducibility — stored in JSON. */
export function snapshotConfig(c: RuntimeConfig): ScanConfigSnapshot {
  return {
    timeoutMs: c.timeoutMs,
    headed: c.headed,
    latestOnly: c.latestOnly,
    stepSize: c.stepSize,
    versionFloor: { ...c.versionFloor },
  };
}

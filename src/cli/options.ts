import { parseArgs } from 'node:util';
import type { ScanConfig, SearchStrategy } from '../config/schema.js';
import type { EngineName } from '../reporting/types.js';
import { ConfigError } from '../config/resolve.js';

/**
 * CLI flag parsing. Thin layer: parses argv plus MRZ_ and BC_ env vars into a
 * ScanConfig, then the CLI hands it to the public scan() API (no duplicated
 * scanning logic). Flags take precedence over env vars over defaults.
 */

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    help: { type: 'boolean', short: 'h', default: false },
    version: { type: 'boolean', short: 'v', default: false },
    headless: { type: 'boolean', default: false },
    engines: { type: 'string' },
    pages: { type: 'string' },
    'base-url': { type: 'string' },
    strategy: { type: 'string' },
    'latest-only': { type: 'boolean', default: false },
    headed: { type: 'boolean', default: false },
    format: { type: 'string' },
    output: { type: 'string', short: 'o' },
    timeout: { type: 'string' },
    'wait-until': { type: 'string' },
    'http-cache': { type: 'boolean', default: false },
    'hold-open': { type: 'string' },
    'step-size': { type: 'string' },
    config: { type: 'string' },
    'readiness-selector': { type: 'string', multiple: true },
    'readiness-mode': { type: 'string' },
    'min-confidence': { type: 'string' },
  },
});

export interface ParsedCli {
  command: 'scan' | 'install' | 'help' | 'version';
  url: string | null;
  config: Partial<ScanConfig>;
}

export function parseCli(): ParsedCli {
  if (values.version || positionals[0] === 'version') {
    return { command: 'version', url: null, config: {} };
  }
  if (values.help || positionals[0] === 'help') {
    return { command: 'help', url: null, config: {} };
  }
  if (positionals[0] === 'install') {
    return { command: 'install', url: null, config: {} };
  }

  const url = positionals.find((p) => /^https?:\/\//i.test(p)) ?? null;

  // Build URLs from positional url + --pages + --base-url.
  const urls: string[] = [];
  if (url) urls.push(url);
  if (values.pages) {
    const base = values['base-url'] ?? url;
    if (!base) throw new ConfigError('--pages requires either a positional URL or --base-url.');
    for (const p of values.pages.split(',').map((s) => s.trim()).filter(Boolean)) {
      urls.push(p.startsWith('http') ? p : `${base.replace(/\/$/, '')}${p.startsWith('/') ? '' : '/'}${p}`);
    }
  }
  if (values.config) {
    // File config merge is handled by the caller via readFileSync; here we just
    // surface the path so runScan can load it. Kept simple: not implementing
    // deep-merge of file+flags in v1; flag/env wins.
  }

  const envEngines = process.env.MRZ_ENGINES ?? process.env.BC_ENGINES;
  const engines = (values.engines ?? envEngines)?.split(',').map((s) => s.trim().toLowerCase()) as
    | EngineName[]
    | undefined;

  const strategy = (values.strategy ?? process.env.MRZ_STRATEGY) as SearchStrategy | undefined;
  const latestOnly = values['latest-only'] || envBool('MRZ_LATEST_ONLY') || envBool('BC_LATEST_ONLY');
  // Headed (visible windows) is the DEFAULT. --headless opts into running
  // invisibly. The MRZ_HEADLESS / BC_HEADLESS env vars do the same.
  const headless = values.headless || envBool('MRZ_HEADLESS') || envBool('BC_HEADLESS');

  const format = (values.format ?? process.env.MRZ_FORMAT)?.split(',').map((s) => s.trim()) as
    | ('json' | 'markdown')[]
    | undefined;

  const selectors = values['readiness-selector'];
  const config: Partial<ScanConfig> = {
    urls,
    engines: engines?.length ? engines : undefined,
    search: {
      strategy: latestOnly ? 'latest' : strategy,
      stepSize: num(values['step-size'] ?? process.env.MRZ_STEP_SIZE ?? process.env.BC_STEP_SIZE),
    },
    timeout: num(values.timeout ?? process.env.MRZ_TIMEOUT_MS ?? process.env.BC_TIMEOUT_MS),
    waitUntil: (values['wait-until'] ?? process.env.MRZ_WAIT_UNTIL) as
      | 'domcontentloaded'
      | 'load'
      | undefined,
    // HTTP cache is DISABLED by default (correctness). `--http-cache` opts back in.
    disableHttpCache: values['http-cache']
      ? false
      : envBool('MRZ_HTTP_CACHE')
        ? false
        : undefined,
    holdOpenSec: num(values['hold-open'] ?? process.env.MRZ_HOLD_OPEN),
    // Headed is the default; --headless inverts it.
    headed: headless ? false : true,
    output: {
      format,
      directory: values.output ?? process.env.MRZ_REPORTS_DIR ?? process.env.BC_REPORTS_DIR,
    },
    analysis: {
      minConfidence: (values['min-confidence'] ?? process.env.MRZ_MIN_CONFIDENCE) as
        | 'high'
        | 'medium'
        | 'low'
        | 'unknown'
        | undefined,
    },
    readiness: selectors?.length ? { selectors, mode: (values['readiness-mode'] as 'any' | 'all') ?? 'any' } : undefined,
  };

  return { command: 'scan', url, config: clean(config) as Partial<ScanConfig> };
}

function envBool(name: string): boolean {
  const v = process.env[name];
  if (v === undefined) return false;
  return v === '1' || v.toLowerCase() === 'true' || v.toLowerCase() === 'yes';
}

function num(v: string | undefined): number | undefined {
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function clean(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const c = clean(v as Record<string, unknown>);
      if (Object.keys(c).length) out[k] = c;
    } else {
      out[k] = v;
    }
  }
  return out;
}

export const HELP = `
browser-boundary — find the oldest browser version your website can actually run on.

Usage:
  browser-boundary <url> [options]
  browser-boundary <url> --engines chromium,firefox
  browser-boundary <url> --pages /,/dashboard --base-url <url>
  browser-boundary <url> --strategy binary|step-down|latest|explicit
  browser-boundary <url> --latest-only
  browser-boundary install                       install current Playwright browsers
  browser-boundary --help

Options:
  -v, --version             print the app version and exit
  --engines <list>          chromium,firefox,webkit (default: all)
  --pages <list>            comma-sep paths or URLs to also test
  --base-url <url>          base for relative --pages
  --strategy <s>            binary | step-down | latest | explicit (default: binary)
  --latest-only             probe only the current build per engine
  --headless                run browsers invisibly (default: headed, windows shown)
  --format <list>           json,markdown (default: both)
  -o, --output <dir>        report directory (default: ./reports)
  --timeout <ms>            per-page readiness/navigation timeout (default: 30000)
  --wait-until <event>      domcontentloaded | load  (default: domcontentloaded)
  --http-cache              allow the browser HTTP cache (default: disabled for accuracy)
  --hold-open <sec>         seconds to keep the window open after checks, to fully load (default: 2)
  --step-size <n>           major-version step before binary search (default: 10)
  --readiness-selector <s>  require this CSS selector (repeatable; default any)
  --readiness-mode <m>      any | all (default: any)
  --min-confidence <c>      high|medium|low|unknown threshold for FAIL attribution (default: low)
  --config <file>           config file (JSON)

Environment (MRZ_* and legacy BC_* equivalents supported):
  MRZ_ENGINES, MRZ_LATEST_ONLY, MRZ_STRATEGY, MRZ_TIMEOUT_MS, MRZ_STEP_SIZE,
  MRZ_REPORTS_DIR, MRZ_FORMAT, MRZ_HEADLESS, MRZ_MIN_CONFIDENCE

Exit codes:
  0  scan completed
  1  compatibility failure (a verified boundary failure found)
  2  configuration error
  3  infrastructure / browser error

WebKit note: only the current Playwright WebKit build is drivable; it is NOT
reported as a specific Safari version.
`.trim();

export { positionals };

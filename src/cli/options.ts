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
    'step-size': { type: 'string' },
    config: { type: 'string' },
    'readiness-selector': { type: 'string', multiple: true },
    'readiness-mode': { type: 'string' },
    'min-confidence': { type: 'string' },
  },
});

export interface ParsedCli {
  command: 'scan' | 'install' | 'help';
  url: string | null;
  config: Partial<ScanConfig>;
}

export function parseCli(): ParsedCli {
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
  const headed = values.headed || envBool('HEADED') || envBool('MRZ_HEADED') || envBool('BC_HEADED');

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
    headed,
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
mrz-browser-compat — find the oldest browser version your website can actually run on.

Usage:
  mrz-browser-compat <url> [options]
  mrz-browser-compat <url> --engines chromium,firefox
  mrz-browser-compat <url> --pages /,/dashboard --base-url <url>
  mrz-browser-compat <url> --strategy binary|step-down|latest|explicit
  mrz-browser-compat <url> --latest-only
  mrz-browser-compat install                       install current Playwright browsers
  mrz-browser-compat --help

Options:
  --engines <list>          chromium,firefox,webkit (default: all)
  --pages <list>            comma-sep paths or URLs to also test
  --base-url <url>          base for relative --pages
  --strategy <s>            binary | step-down | latest | explicit (default: binary)
  --latest-only             probe only the current build per engine
  --headed                  show browser windows
  --format <list>           json,markdown (default: both)
  -o, --output <dir>        report directory (default: ./reports)
  --timeout <ms>            per-page readiness/navigation timeout (default: 30000)
  --wait-until <event>      domcontentloaded | load  (default: domcontentloaded)
  --step-size <n>           major-version step before binary search (default: 10)
  --readiness-selector <s>  require this CSS selector (repeatable; default any)
  --readiness-mode <m>      any | all (default: any)
  --min-confidence <c>      high|medium|low|unknown threshold for FAIL attribution (default: low)
  --config <file>           config file (JSON)

Environment (MRZ_* and legacy BC_* equivalents supported):
  MRZ_ENGINES, MRZ_LATEST_ONLY, MRZ_STRATEGY, MRZ_TIMEOUT_MS, MRZ_STEP_SIZE,
  MRZ_REPORTS_DIR, MRZ_FORMAT, MRZ_HEADED, MRZ_MIN_CONFIDENCE

Exit codes:
  0  scan completed
  1  compatibility failure (a verified boundary failure found)
  2  configuration error
  3  infrastructure / browser error

WebKit note: only the current Playwright WebKit build is drivable; it is NOT
reported as a specific Safari version.
`.trim();

export { positionals };

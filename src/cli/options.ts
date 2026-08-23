import { parseArgs } from 'node:util';
import { readFileSync } from 'node:fs';
import type { ScanConfig, SearchStrategy } from '../config/schema.js';
import type { EngineName } from '../reporting/types.js';
import { ConfigError } from '../config/resolve.js';

/**
 * CLI flag parsing. Thin layer: parses argv plus MRZ_ and BC_ env vars into a
 * ScanConfig, then the CLI hands it to the public scan() API (no duplicated
 * scanning logic). Flags take precedence over env vars over defaults.
 */

const CLI_OPTIONS = {
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
    versions: { type: 'string' },
    'exact-version': { type: 'string' },
    'chromium-controller': { type: 'string' },
} as const;

export interface ParsedCli {
  command: 'scan' | 'install' | 'help' | 'version';
  url: string | null;
  config: Partial<ScanConfig>;
}

export function parseCli(
  args: string[] = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env,
): ParsedCli {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: CLI_OPTIONS });
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
  const fileConfig = values.config ? readConfigFile(values.config) : {};

  const envEngines = env.MRZ_ENGINES ?? env.BC_ENGINES;
  const engines = (values.engines ?? envEngines)?.split(',').map((s) => s.trim().toLowerCase()) as
    | EngineName[]
    | undefined;

  validateEngines(engines);
  const strategy = (values.strategy ?? env.MRZ_STRATEGY) as SearchStrategy | undefined;
  const latestOnly = values['latest-only'] || envBool(env, 'MRZ_LATEST_ONLY') || envBool(env, 'BC_LATEST_ONLY');
  // Headed (visible windows) is the DEFAULT. --headless opts into running
  // invisibly. The MRZ_HEADLESS / BC_HEADLESS env vars do the same.
  const headless = values.headless || envBool(env, 'MRZ_HEADLESS') || envBool(env, 'BC_HEADLESS');
  const versionsValue = values.versions ?? values['exact-version'];
  const explicitVersions = versionsValue
    ? parseExplicitVersions(versionsValue, values.engines, engines, strategy, latestOnly)
    : undefined;

  const format = (values.format ?? env.MRZ_FORMAT)?.split(',').map((s) => s.trim()) as
    | ('json' | 'markdown')[]
    | undefined;

  const selectors = values['readiness-selector'];
  const chromiumController = parseChromiumController(
    values['chromium-controller'] ?? env.MRZ_CHROMIUM_CONTROLLER ?? env.BC_CHROMIUM_CONTROLLER,
  );
  const cliConfig: Partial<ScanConfig> = {
    urls: urls.length ? urls : undefined,
    engines: engines?.length ? engines : undefined,
    chromiumController,
    search: {
      strategy: explicitVersions ? 'explicit' : latestOnly ? 'latest' : strategy,
      stepSize: num(values['step-size'] ?? env.MRZ_STEP_SIZE ?? env.BC_STEP_SIZE),
      explicitVersions,
    },
    timeout: num(values.timeout ?? env.MRZ_TIMEOUT_MS ?? env.BC_TIMEOUT_MS),
    waitUntil: (values['wait-until'] ?? env.MRZ_WAIT_UNTIL) as
      | 'domcontentloaded'
      | 'load'
      | undefined,
    // HTTP cache is DISABLED by default (correctness). `--http-cache` opts back in.
    disableHttpCache: values['http-cache']
      ? false
      : envBool(env, 'MRZ_HTTP_CACHE')
        ? false
        : undefined,
    holdOpenSec: num(values['hold-open'] ?? env.MRZ_HOLD_OPEN),
    // Headed is the default; --headless inverts it.
    headed: headless ? false : values.headed ? true : undefined,
    output: {
      format,
      directory: values.output ?? env.MRZ_REPORTS_DIR ?? env.BC_REPORTS_DIR,
    },
    analysis: {
      minConfidence: (values['min-confidence'] ?? env.MRZ_MIN_CONFIDENCE) as
        | 'high'
        | 'medium'
        | 'low'
        | 'unknown'
        | undefined,
    },
    readiness: selectors?.length ? { selectors, mode: (values['readiness-mode'] as 'any' | 'all') ?? 'any' } : undefined,
  };

  const config = mergeConfig(fileConfig, clean(cliConfig) as Partial<ScanConfig>);
  return { command: 'scan', url, config };
}

function readConfigFile(configPath: string): Partial<ScanConfig> {
  try {
    const value: unknown = JSON.parse(readFileSync(configPath, 'utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('the top-level JSON value must be an object');
    }
    return value as Partial<ScanConfig>;
  } catch (err) {
    throw new ConfigError(
      `Could not load config file ${configPath}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

function mergeConfig(file: Partial<ScanConfig>, overrides: Partial<ScanConfig>): Partial<ScanConfig> {
  return {
    ...file,
    ...overrides,
    search: mergeSection(file.search, overrides.search),
    output: mergeSection(file.output, overrides.output),
    analysis: mergeSection(file.analysis, overrides.analysis),
    readiness: mergeSection(file.readiness, overrides.readiness),
  };
}

function mergeSection<T extends object>(base: T | undefined, overrides: T | undefined): T | undefined {
  if (!base) return overrides;
  if (!overrides) return base;
  return { ...base, ...overrides };
}

function envBool(env: NodeJS.ProcessEnv, name: string): boolean {
  const v = env[name];
  if (v === undefined) return false;
  return v === '1' || v.toLowerCase() === 'true' || v.toLowerCase() === 'yes';
}

function parseChromiumController(value: string | undefined): 'auto' | 'playwright' | 'webdriver' | undefined {
  if (value === undefined) return undefined;
  if (value === 'auto' || value === 'playwright' || value === 'webdriver') return value;
  throw new ConfigError(
    `Unknown Chromium controller "${value}". Valid values: auto, playwright, webdriver.`,
  );
}

const VALID_ENGINES: EngineName[] = ['chromium', 'firefox', 'webkit'];

function validateEngines(engines: EngineName[] | undefined): void {
  const invalid = engines?.find((engine) => !VALID_ENGINES.includes(engine));
  if (invalid) throw new ConfigError(`Unknown engine "${invalid}". Valid engines: chromium, firefox, webkit.`);
}

function parseExplicitVersions(
  value: string,
  enginesFlag: string | undefined,
  engines: EngineName[] | undefined,
  strategy: SearchStrategy | undefined,
  latestOnly: boolean,
): Partial<Record<EngineName, string[]>> {
  if (!enginesFlag) throw new ConfigError('--versions requires --engines with exactly one engine.');
  if (!engines || engines.length !== 1) {
    throw new ConfigError('--versions requires exactly one engine; multiple engines cannot be tested together.');
  }
  if (strategy || latestOnly) throw new ConfigError('--versions cannot be combined with --strategy or --latest-only.');
  const engine = engines[0];
  if (engine === 'webkit') {
    throw new ConfigError('WebKit supports the current build only; specific versions cannot be tested.');
  }
  const versions = [...new Set(value.split(',').map((item) => item.trim()).filter(Boolean))];
  if (versions.length === 0 || versions.some((version) => !/^\d+$/.test(version))) {
    throw new ConfigError(
      '--versions accepts whole major versions only (for example: 120 or 120,115). ' +
      'Valid ranges: Chromium: 67–current; Firefox: 52–current; WebKit: current only.',
    );
  }
  const floor = engine === 'chromium' ? 67 : 52;
  const belowFloor = versions.filter((version) => Number(version) < floor);
  if (belowFloor.length) {
    throw new ConfigError(
      `${engine === 'chromium' ? 'Chromium' : 'Firefox'} versions must be in the supported range ` +
      `${floor}–current. Invalid: ${belowFloor.join(', ')}.`,
    );
  }
  return { [engine]: versions };
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
  browser-boundary <url> --engines chromium --versions 120,115,110
  browser-boundary <url> --latest-only
  browser-boundary install                       install current Playwright browsers
  browser-boundary --help

Options:
  -v, --version             print the app version and exit
  --engines <list>          chromium,firefox,webkit (default: all)
  --pages <list>            comma-sep paths or URLs to also test
  --base-url <url>          base for relative --pages
  --strategy <s>            binary | step-down | latest | explicit (default: binary)
  --versions <list>         exact major(s) to test; requires one --engines value
  --exact-version <major>   alias for --versions when testing one exact major
  --latest-only             probe only the current build per engine
  --headless                run browsers invisibly (default: headed, windows shown)
  --chromium-controller <m> auto | playwright | webdriver (default: auto)
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

Specific-version ranges:
  Chromium  67–current
  Firefox   52–current
  WebKit    current only (specific versions unsupported)

In headed specific-version mode, each browser stays open until you close its
tab/window. The next requested version opens only after the current one closes.
Specific-version mode accepts exactly one URL (not multiple --pages).
`.trim();

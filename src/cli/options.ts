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
  command: 'scan' | 'quick' | 'install' | 'help' | 'version';
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
    if (positionals.length !== 1) throw new ConfigError('install does not accept positional arguments.');
    return { command: 'install', url: null, config: {} };
  }
  if (positionals[0] === 'quick') {
    return parseQuickCli(positionals.slice(1), values, env);
  }

  if (positionals.length > 1) {
    throw new ConfigError('Only one positional URL is accepted; use --pages for additional pages.');
  }
  const url = positionals[0] ?? null;
  if (url && !/^https?:\/\//i.test(url)) {
    throw new ConfigError(`Invalid positional URL (must start with http(s)://): ${url}`);
  }
  const fileConfig = values.config ? readConfigFile(values.config) : {};

  // Build URLs from positional url + --pages + --base-url.
  const configuredUrls = fileConfig.urls ?? [];
  const urls: ScanConfig['urls'] = url ? [url] : values.pages !== undefined ? [...configuredUrls] : [];
  if (values.pages !== undefined) {
    const pageItems = parseNonEmptyList(values.pages, '--pages');
    const configuredBase = configuredUrls[0];
    const configuredBaseUrl = typeof configuredBase === 'string' ? configuredBase : configuredBase?.url;
    const base = values['base-url'] ?? url ?? configuredBaseUrl;
    if (!base) throw new ConfigError('--pages requires either a positional URL or --base-url.');
    for (const p of pageItems) {
      urls.push(/^https?:\/\//i.test(p) ? p : `${base.replace(/\/$/, '')}${p.startsWith('/') ? '' : '/'}${p}`);
    }
  }

  const envEngines = env.MRZ_ENGINES ?? env.BC_ENGINES;
  const enginesValue = values.engines ?? envEngines;
  const engines = parseEngines(enginesValue);

  validateEngines(engines);
  const strategy = parseEnum(
    values.strategy ?? env.MRZ_STRATEGY ?? env.BC_STRATEGY,
    '--strategy',
    ['binary', 'step-down', 'latest', 'explicit'],
  ) as SearchStrategy | undefined;
  const latestOnly = values['latest-only'] || envBool(env, 'MRZ_LATEST_ONLY') || envBool(env, 'BC_LATEST_ONLY');
  // Headed (visible windows) is the DEFAULT. --headless opts into running
  // invisibly. The MRZ_HEADLESS / BC_HEADLESS env vars do the same.
  const headless = values.headless || envBool(env, 'MRZ_HEADLESS') || envBool(env, 'BC_HEADLESS');
  const hasVersionsFlag = values.versions !== undefined || values['exact-version'] !== undefined;
  if (values.versions !== undefined && values['exact-version'] !== undefined) {
    throw new ConfigError('--versions and --exact-version are aliases; use only one.');
  }
  const versionsValue = values.versions ?? values['exact-version'];
  const explicitVersions = hasVersionsFlag
    ? parseExplicitVersions(versionsValue!, values.engines, engines, strategy, latestOnly)
    : undefined;

  const formatValue = values.format ?? env.MRZ_FORMAT ?? env.BC_FORMAT;
  const format = formatValue === undefined
    ? undefined
    : parseEnumList(formatValue, '--format', ['json', 'markdown']) as ('json' | 'markdown')[];

  const selectors = values['readiness-selector'];
  if (selectors?.some((selector) => selector.trim().length === 0)) {
    throw new ConfigError('--readiness-selector must not be empty.');
  }
  const readinessModeValue = values['readiness-mode'];
  if (readinessModeValue !== undefined && !selectors?.length) {
    throw new ConfigError('--readiness-mode requires at least one --readiness-selector.');
  }
  const readinessMode = parseEnum(readinessModeValue, '--readiness-mode', ['any', 'all']);
  const waitUntil = parseEnum(
    values['wait-until'] ?? env.MRZ_WAIT_UNTIL ?? env.BC_WAIT_UNTIL,
    '--wait-until',
    ['domcontentloaded', 'load'],
  );
  const minConfidence = parseEnum(
    values['min-confidence'] ?? env.MRZ_MIN_CONFIDENCE ?? env.BC_MIN_CONFIDENCE,
    '--min-confidence',
    ['high', 'medium', 'low', 'unknown'],
  );
  const chromiumController = parseChromiumController(
    values['chromium-controller'] ?? env.MRZ_CHROMIUM_CONTROLLER ?? env.BC_CHROMIUM_CONTROLLER,
  );
  const cliConfig: Partial<ScanConfig> = {
    urls: urls.length ? urls : undefined,
    engines: engines?.length ? engines : undefined,
    chromiumController,
    search: {
      strategy: explicitVersions ? 'explicit' : latestOnly ? 'latest' : strategy,
      stepSize: positiveNumber(values['step-size'] ?? env.MRZ_STEP_SIZE ?? env.BC_STEP_SIZE, '--step-size'),
      explicitVersions,
    },
    timeout: positiveNumber(values.timeout ?? env.MRZ_TIMEOUT_MS ?? env.BC_TIMEOUT_MS, '--timeout'),
    waitUntil: waitUntil as 'domcontentloaded' | 'load' | undefined,
    // HTTP cache is DISABLED by default (correctness). `--http-cache` opts back in.
    disableHttpCache: values['http-cache']
      ? false
      : envBool(env, 'MRZ_HTTP_CACHE') || envBool(env, 'BC_HTTP_CACHE')
        ? false
        : undefined,
    holdOpenSec: positiveNumber(values['hold-open'] ?? env.MRZ_HOLD_OPEN ?? env.BC_HOLD_OPEN, '--hold-open'),
    // Headed is the default; --headless inverts it.
    headed: headless ? false : values.headed ? true : undefined,
    output: {
      format,
      directory: values.output ?? env.MRZ_REPORTS_DIR ?? env.BC_REPORTS_DIR,
    },
    analysis: {
      minConfidence: minConfidence as 'high' | 'medium' | 'low' | 'unknown' | undefined,
    },
    readiness: selectors?.length ? { selectors, mode: (readinessMode as 'any' | 'all') ?? 'any' } : undefined,
  };

  const config = mergeConfig(fileConfig, clean(cliConfig) as Partial<ScanConfig>);
  return { command: 'scan', url, config };
}

/**
 * `quick <url>` — Fast Start: a one-command, headless, one-URL
 * current-Chromium result. Deliberately NOT historical boundary discovery.
 * Translated into a normal ScanConfig; no separate scanner behavior.
 */
function parseQuickCli(
  positionals: string[],
  values: ReturnType<typeof parseArgs>['values'],
  env: NodeJS.ProcessEnv,
): ParsedCli {
  if (positionals.length !== 1 || !/^https?:\/\//i.test(positionals[0])) {
    throw new ConfigError('quick requires exactly one URL: browser-boundary quick <url>.');
  }
  const url = positionals[0];
  if (values.pages) throw new ConfigError('quick accepts exactly one URL and cannot be combined with --pages.');
  if (values.versions !== undefined || values['exact-version'] !== undefined) {
    throw new ConfigError('quick tests the current build only and cannot be combined with --versions.');
  }
  if (values.strategy) throw new ConfigError('quick uses the latest strategy only and cannot be combined with --strategy.');
  if (values.engines && values.engines !== 'chromium') {
    throw new ConfigError('quick is a Chromium-only current-browser proof; use a full scan for other engines.');
  }
  return {
    command: 'quick',
    url,
    config: {
      urls: [url],
      engines: ['chromium'],
      search: { strategy: 'latest' },
      headed: false,
      quick: true,
      output: {
        directory: (values.output as string | undefined) ?? env.MRZ_REPORTS_DIR ?? env.BC_REPORTS_DIR,
      },
    },
  };
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

function parseEngines(value: string | undefined): EngineName[] | undefined {
  if (value === undefined) return undefined;
  const items = value.split(',').map((item) => item.trim().toLowerCase());
  if (items.some((item) => item.length === 0)) {
    throw new ConfigError('--engines must not contain empty values. Valid engines: chromium, firefox, webkit.');
  }
  return items as EngineName[];
}

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

function positiveNumber(value: string | undefined, option: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new ConfigError(`${option} must be a finite number greater than 0; received "${value}".`);
  }
  return parsed;
}

function parseNonEmptyList(value: string, option: string): string[] {
  const items = value.split(',').map((item) => item.trim());
  if (items.length === 0 || items.some((item) => item.length === 0)) {
    throw new ConfigError(`${option} must not be empty or contain empty values.`);
  }
  return items;
}

function parseEnum(value: string | undefined, option: string, valid: readonly string[]): string | undefined {
  if (value === undefined) return undefined;
  if (!valid.includes(value)) {
    throw new ConfigError(`${option} must be one of: ${valid.join(', ')}; received "${value}".`);
  }
  return value;
}

function parseEnumList(value: string, option: string, valid: readonly string[]): string[] {
  const items = parseNonEmptyList(value, option);
  const invalid = items.find((item) => !valid.includes(item));
  if (invalid) throw new ConfigError(`${option} values must be one of: ${valid.join(', ')}; received "${invalid}".`);
  return [...new Set(items)];
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
  browser-boundary quick <url>                   one-command current-Chromium proof (headless)
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

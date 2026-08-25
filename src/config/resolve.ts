import os from 'node:os';
import path from 'node:path';
import type { EngineName } from '../reporting/types.js';
import type {
  ChromiumControllerPolicy,
  PageSpec,
  ResourceType,
  ScanConfig,
  SearchStrategy,
} from './schema.js';
import { DEFAULTS } from './schema.js';

/**
 * Resolved, normalized configuration. Everything the core needs, with defaults
 * applied and validation done. The core never reads process.env or process.argv
 * directly — that happens here (and in the CLI options layer).
 */
export interface ResolvedConfig {
  pages: PageSpec[];
  engines: EngineName[];
  chromiumController: ChromiumControllerPolicy;
  siteName: string;
  strategy: SearchStrategy;
  stepSize: number;
  floor: Record<EngineName, number>;
  explicitVersions: Partial<Record<EngineName, string[]>>;
  checks: {
    navigation: boolean;
    javascript: boolean;
    console: boolean;
    network: boolean;
    rendering: boolean;
    readiness: boolean;
  };
  defaultReadiness: { selectors: string[]; mode: 'any' | 'all' } | null;
  ignoredPatterns: RegExp[];
  criticalResourceTypes: ResourceType[];
  minConfidence: 'high' | 'medium' | 'low' | 'unknown';
  hooks: NonNullable<ScanConfig['hooks']>;
  timeout: number;
  headed: boolean;
  retries: number;
  viewport: { width: number; height: number };
  waitUntil: 'domcontentloaded' | 'load';
  disableHttpCache: boolean;
  holdOpenSec: number;
  /** True for quick current-browser proofs (Fast Start), set from ScanConfig.quick. */
  quick: boolean;
  formats: ('json' | 'markdown')[];
  outputDir: string;
  cacheDir: string;
}

/** A resolved page with a concrete label and readiness (selector-mode normalized). */
export interface ResolvedPage {
  url: string;
  label: string;
  readiness:
    | { kind: 'selectors'; selectors: string[]; mode: 'any' | 'all' }
    | { kind: 'function'; fn: (ctx: { page: import('playwright').Page }) => Promise<boolean> }
    | { kind: 'none' };
}

export function resolveConfig(input: ScanConfig): ResolvedConfig {
  const engines = input.engines && input.engines.length ? input.engines : [...DEFAULTS.engines];
  validateEngines(engines);
  validateChromiumController(input.chromiumController);
  validateExplicitConfig(input, engines);
  validateRuntimeConfig(input);

  const pages: PageSpec[] = (input.urls ?? []).map((u, i) =>
    typeof u === 'string' ? { url: u, label: labelFor(u, i) } : { label: labelFor(u.url, i), ...u },
  );
  if (pages.length === 0) {
    throw new ConfigError('At least one URL must be provided via `urls`.');
  }
  for (const p of pages) {
    if (!/^https?:\/\//i.test(p.url)) {
      throw new ConfigError(`Invalid URL (must start with http(s)://): ${p.url}`);
    }
  }

  const floor = { ...DEFAULTS.floor, ...(input.search?.floor ?? {}) };
  const criticalResourceTypes =
    input.network?.criticalResourceTypes ?? DEFAULTS.criticalResourceTypes;
  const ignoredPatterns = (input.network?.ignoredPatterns ?? []).map(toRegExp);

  const strategy = input.search?.strategy ?? DEFAULTS.strategy;
  if (!['step-down', 'binary', 'latest', 'explicit'].includes(strategy)) {
    throw new ConfigError(`Unknown search strategy: ${strategy}`);
  }

  const siteName = input.siteName ?? originOf(pages[0].url);

  const cacheDir = expandTilde(input.cache?.directory ?? DEFAULTS.cacheDir);
  const outputDir = path.resolve(input.output?.directory ?? DEFAULTS.outputDir);
  const formats = input.output?.format ?? [...DEFAULTS.format];

  return {
    pages,
    engines,
    chromiumController: input.chromiumController ?? DEFAULTS.chromiumController,
    siteName,
    strategy,
    stepSize: input.search?.stepSize ?? DEFAULTS.stepSize,
    floor,
    explicitVersions: input.search?.explicitVersions ?? {},
    checks: {
      navigation: input.checks?.navigation ?? true,
      javascript: input.checks?.javascript ?? true,
      console: input.checks?.console ?? true,
      network: input.checks?.network ?? true,
      rendering: input.checks?.rendering ?? true,
      readiness: input.checks?.readiness ?? true,
    },
    defaultReadiness: input.readiness
      ? { selectors: input.readiness.selectors, mode: input.readiness.mode ?? 'any' }
      : null,
    ignoredPatterns,
    criticalResourceTypes,
    minConfidence: input.analysis?.minConfidence ?? DEFAULTS.minConfidence,
    hooks: input.hooks ?? {},
    timeout: input.timeout ?? DEFAULTS.timeout,
    headed: input.headed ?? DEFAULTS.headed,
    retries: input.retries ?? DEFAULTS.retries,
    viewport: input.viewport ?? DEFAULTS.viewport,
    waitUntil: input.waitUntil ?? DEFAULTS.waitUntil,
    disableHttpCache: input.disableHttpCache ?? DEFAULTS.disableHttpCache,
    holdOpenSec: input.holdOpenSec ?? DEFAULTS.holdOpenSec,
    quick: input.quick ?? false,
    formats,
    outputDir,
    cacheDir,
  };
}

export class ConfigError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'ConfigError';
  }
}

const VALID_ENGINES: EngineName[] = ['chromium', 'firefox', 'webkit'];

function validateEngines(engines: EngineName[]): void {
  const invalid = engines.find((engine) => !VALID_ENGINES.includes(engine));
  if (invalid) throw new ConfigError(`Unknown engine "${invalid}". Valid engines: chromium, firefox, webkit.`);
}

function validateChromiumController(policy: ChromiumControllerPolicy | undefined): void {
  if (policy && !['auto', 'playwright', 'webdriver'].includes(policy)) {
    throw new ConfigError(
      `Unknown Chromium controller "${policy}". Valid values: auto, playwright, webdriver.`,
    );
  }
}

function validateRuntimeConfig(input: ScanConfig): void {
  if (input.waitUntil !== undefined && !['domcontentloaded', 'load'].includes(input.waitUntil)) {
    throw new ConfigError(`Unknown waitUntil value: ${input.waitUntil}. Valid values: domcontentloaded, load.`);
  }
  if (input.output?.format !== undefined) {
    if (!Array.isArray(input.output.format) || input.output.format.length === 0) {
      throw new ConfigError('At least one output format is required. Valid values: json, markdown.');
    }
    const invalid = input.output.format.find((format) => !['json', 'markdown'].includes(format));
    if (invalid) throw new ConfigError(`Unknown output format: ${invalid}. Valid values: json, markdown.`);
  }
  if (input.readiness !== undefined) {
    if (!Array.isArray(input.readiness.selectors) || input.readiness.selectors.length === 0 ||
        input.readiness.selectors.some((selector) => typeof selector !== 'string' || selector.trim().length === 0)) {
      throw new ConfigError('Readiness requires at least one non-empty selector.');
    }
    if (input.readiness.mode !== undefined && !['any', 'all'].includes(input.readiness.mode)) {
      throw new ConfigError(`Unknown readiness mode: ${input.readiness.mode}. Valid values: any, all.`);
    }
  }
  const minConfidence = input.analysis?.minConfidence;
  if (minConfidence !== undefined && !['high', 'medium', 'low', 'unknown'].includes(minConfidence)) {
    throw new ConfigError(`Unknown minimum confidence: ${minConfidence}. Valid values: high, medium, low, unknown.`);
  }
}

function validateExplicitConfig(input: ScanConfig, engines: EngineName[]): void {
  if (input.search?.strategy !== 'explicit') return;
  if (engines.length !== 1) throw new ConfigError('Explicit version testing requires exactly one engine.');
  if (input.urls.length !== 1) {
    throw new ConfigError(
      'Explicit version testing requires exactly one URL. Multiple --pages would reopen the same ' +
      'version after closure instead of advancing to the next requested version.',
    );
  }
  const engine = engines[0];
  const versions = input.search.explicitVersions?.[engine];
  if (!versions?.length) throw new ConfigError(`Explicit version testing requires at least one version for ${engine}.`);
  if (engine === 'webkit') {
    throw new ConfigError('WebKit supports only its current Playwright build; specific versions cannot be tested.');
  }
  const floor = engine === 'chromium' ? 67 : 52;
  if (versions.some((version) => !/^\d+$/.test(version) || Number(version) < floor)) {
    throw new ConfigError(
      `${engine === 'chromium' ? 'Chromium' : 'Firefox'} versions must be whole major versions in the supported range ${floor}–current.`,
    );
  }
}

export function validateExplicitVersionsAgainstLatest(
  engine: EngineName,
  versions: string[],
  latestMajor: number,
): void {
  const floor = engine === 'chromium' ? 67 : engine === 'firefox' ? 52 : latestMajor;
  const invalid = versions.filter((version) => Number(version) < floor || Number(version) > latestMajor);
  if (invalid.length) {
    const label = engine === 'chromium' ? 'Chromium' : engine === 'firefox' ? 'Firefox' : 'WebKit';
    throw new ConfigError(
      `${label} versions must be in the supported range ${floor}–${latestMajor}. ` +
      `Invalid requested version(s): ${invalid.join(', ')}.`,
    );
  }
}

export function toRegExp(p: RegExp | string): RegExp {
  return p instanceof RegExp ? p : new RegExp(escapeRegExp(p), 'i');
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function labelFor(url: string, i: number): string {
  try {
    const u = new URL(url);
    const seg = u.pathname === '/' ? 'home' : u.pathname.replace(/^\/|\/$/g, '').replace(/\//g, '-') || 'page';
    return seg || `page-${i}`;
  } catch {
    return `page-${i}`;
  }
}

function originOf(url: string): string {
  try {
    const u = new URL(url);
    return u.origin;
  } catch {
    return url;
  }
}

function expandTilde(p: string): string {
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  if (p === '~') return os.homedir();
  return path.resolve(p);
}

export function resolvePageReadiness(
  page: PageSpec,
  cfg: ResolvedConfig,
): ResolvedPage {
  const label = page.label ?? labelFor(page.url, 0);
  if (page.readiness) {
    if (typeof page.readiness === 'function') {
      return { url: page.url, label, readiness: { kind: 'function', fn: page.readiness } };
    }
    return {
      url: page.url,
      label,
      readiness: {
        kind: 'selectors',
        selectors: page.readiness.selectors,
        mode: page.readiness.mode ?? 'any',
      },
    };
  }
  if (cfg.defaultReadiness) {
    return {
      url: page.url,
      label,
      readiness: {
        kind: 'selectors',
        selectors: cfg.defaultReadiness.selectors,
        mode: cfg.defaultReadiness.mode,
      },
    };
  }
  return { url: page.url, label, readiness: { kind: 'none' } };
}

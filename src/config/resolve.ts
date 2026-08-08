import os from 'node:os';
import path from 'node:path';
import type { EngineName } from '../reporting/types.js';
import type {
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
  const formats = input.output?.format && input.output.format.length
    ? input.output.format
    : [...DEFAULTS.format];

  return {
    pages,
    engines,
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

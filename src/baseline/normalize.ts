import { createHash } from 'node:crypto';
import type { NormalizedRoute, NormalizedScanScope } from './types.js';
import type { ResolvedConfig } from '../config/resolve.js';

/**
 * Canonical scan-scope normalization + stable fingerprint (Task 10).
 *
 * Goal: detect MATERIAL configuration drift between a scan and its baseline
 * without noisy machine-specific differences. Paths, directories, timestamps,
 * and artifact locations never enter the normalized scope.
 */

/**
 * Recursively key-sorted JSON representation: two semantically equal
 * configurations serialize identically regardless of key order.
 */
export function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = canonicalize((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

/** Stable route policy: sort by (label, url). */
function sortedRoutes(routes: NormalizedRoute[]): NormalizedRoute[] {
  return [...routes].sort((a, b) => (a.label === b.label ? a.url.localeCompare(b.url) : a.label.localeCompare(b.label)));
}

/** Normalize a resolved configuration into the canonical, comparable scope. */
export function normalizeScanScope(config: ResolvedConfig): NormalizedScanScope {
  const nonPortable: string[] = [];

  const routes: NormalizedRoute[] = config.pages.map((page) => {
    const resolved = page.readiness;
    if (typeof resolved === 'function') {
      nonPortable.push(`route "${page.label ?? page.url}" uses a custom readiness function (non-portable; never serialized from source text)`);
      return { url: page.url, label: page.label ?? page.url, readiness: { kind: 'non-portable-function' as const } };
    }
    if (resolved && typeof resolved === 'object') {
      const selectors = [...resolved.selectors].sort();
      return {
        url: page.url,
        label: page.label ?? page.url,
        readiness: { kind: 'selectors' as const, selectors, mode: resolved.mode ?? 'any' },
      };
    }
    return { url: page.url, label: page.label ?? page.url, readiness: { kind: 'none' as const } };
  });

  return {
    routes: sortedRoutes(routes),
    checks: { ...config.checks },
    engines: [...config.engines].sort(),
    controllerPolicy: config.chromiumController,
    minConfidence: config.minConfidence,
    floors: Object.fromEntries(
      Object.entries({ ...config.floor }).filter(([, v]) => v !== undefined).map(([k, v]) => [k, v]),
    ),
    // RegExp flags/sources normalize deterministically: source string only.
    ignoredPatterns: config.ignoredPatterns.map((r) => r.source).sort(),
    criticalResourceTypes: [...config.criticalResourceTypes].sort(),
    timeoutMs: config.timeout,
    waitUntil: config.waitUntil,
    viewport: { width: config.viewport.width, height: config.viewport.height },
    nonPortable,
  };
}

/** sha256 hex digest of the canonical normalized scope. */
export function scopeFingerprint(scope: NormalizedScanScope): string {
  return createHash('sha256').update(JSON.stringify(canonicalize(scope))).digest('hex');
}

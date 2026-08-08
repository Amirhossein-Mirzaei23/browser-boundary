import type { EngineName } from '../reporting/types.js';

/**
 * Pure data: ECMAScript / Web feature → minimum engine version + how to
 * recognize a failure caused by its absence. This is a data table, decoupled
 * from the analysis logic, so it can be unit-tested and extended without
 * touching code.
 *
 * IMPORTANT — confidence design (fixes over-attribution):
 *  - 'high'    : a SyntaxError that uniquely identifies a missing syntax feature
 *                (e.g. "Unexpected token '?.'"). This really is a compat issue.
 *  - 'medium'  : a ReferenceError/TypeError naming a specific API that the
 *                feature table can pin down (e.g. "structuredClone is not defined").
 *  - 'low'     : an error that COULD be the feature but might be app logic
 *                (e.g. a method-not-found that's usually a missing polyfill).
 *  - 'unknown' : a generic runtime error (e.g. "Cannot read properties of
 *                undefined") — this is almost always an APP BUG, not a browser
 *                compat problem. It must NOT be attributed to a feature.
 *
 * Note: a runtime "Cannot read properties of undefined" was previously mapped
 * to "Optional chaining" — that was a bug. Optional chaining is a *syntax*
 * feature; its genuine compat failure is a SyntaxError, already matched below.
 * The runtime null-dereference is app code, so it is deliberately absent here.
 */

export interface FeatureRow {
  feature: string;
  minVersions: Partial<Record<EngineName, number>>;
  /** Regex tested against the lowercased error text. */
  signatures: RegExp[];
  confidence: 'high' | 'medium' | 'low';
  kind: 'js' | 'net';
}

export const FEATURE_TABLE: FeatureRow[] = [
  // --- HIGH confidence: SyntaxErrors that uniquely identify missing syntax ---
  {
    feature: 'Optional chaining (?.)',
    minVersions: { chromium: 80, firefox: 74, webkit: 13.1 },
    confidence: 'high',
    kind: 'js',
    signatures: [/unexpected token ['"]?\?\.['"]?/],
  },
  {
    feature: 'Nullish coalescing (??)',
    minVersions: { chromium: 80, firefox: 72, webkit: 13.1 },
    confidence: 'high',
    kind: 'js',
    signatures: [/unexpected token ['"]?\?\?['"]?/],
  },
  {
    feature: 'Logical assignment operators (||=, &&=, ??=)',
    minVersions: { chromium: 85, firefox: 79, webkit: 14 },
    confidence: 'high',
    kind: 'js',
    signatures: [/unexpected token ['"]?\?\?=['"]?/, /unexpected token ['"]\|\|=]/],
  },
  {
    feature: 'Private class fields (#)',
    minVersions: { chromium: 74, firefox: 90, webkit: 14.1 },
    confidence: 'high',
    kind: 'js',
    signatures: [/unexpected token ['"]#['"]/, /private field/],
  },
  {
    feature: 'Numeric separators (1_000)',
    minVersions: { chromium: 75, firefox: 70, webkit: 13 },
    confidence: 'high',
    kind: 'js',
    signatures: [/unexpected token ['"]_['"]?/],
  },
  {
    feature: 'Dynamic import()',
    minVersions: { chromium: 63, firefox: 67, webkit: 11.1 },
    confidence: 'medium',
    kind: 'js',
    signatures: [/unexpected token ['"]import['"]?/],
  },

  // --- MEDIUM confidence: named APIs not defined ---
  {
    feature: 'structuredClone()',
    minVersions: { chromium: 98, firefox: 94, webkit: 15.4 },
    confidence: 'medium',
    kind: 'js',
    signatures: [/structuredclone is not defined/],
  },
  {
    feature: 'Object.hasOwn()',
    minVersions: { chromium: 93, firefox: 92, webkit: 15.4 },
    confidence: 'medium',
    kind: 'js',
    signatures: [/object\.hasown is not a function/],
  },
  {
    feature: 'globalThis',
    minVersions: { chromium: 71, firefox: 65, webkit: 12.1 },
    confidence: 'medium',
    kind: 'js',
    signatures: [/globalthis is not defined/],
  },
  {
    feature: 'BigInt',
    minVersions: { chromium: 67, firefox: 68, webkit: 14 },
    confidence: 'medium',
    kind: 'js',
    signatures: [/bigint is not defined/],
  },
  {
    feature: 'fetch()',
    minVersions: { chromium: 42, firefox: 39, webkit: 10.1 },
    confidence: 'medium',
    kind: 'js',
    signatures: [/fetch is not defined/],
  },
  {
    feature: 'ResizeObserver',
    minVersions: { chromium: 64, firefox: 69, webkit: 13.1 },
    confidence: 'medium',
    kind: 'js',
    signatures: [/resizeobserver is not defined/],
  },
  {
    feature: 'IntersectionObserver',
    minVersions: { chromium: 51, firefox: 55, webkit: 12.1 },
    confidence: 'medium',
    kind: 'js',
    signatures: [/intersectionobserver is not defined/],
  },

  // --- LOW confidence: method-not-found (could be missing polyfill OR app bug) ---
  {
    feature: 'Array.prototype.at() / String.prototype.at()',
    minVersions: { chromium: 92, firefox: 90, webkit: 15.4 },
    confidence: 'low',
    kind: 'js',
    signatures: [/\.at is not a function/],
  },
  {
    feature: 'Promise.allSettled()',
    minVersions: { chromium: 76, firefox: 71, webkit: 13 },
    confidence: 'low',
    kind: 'js',
    signatures: [/promise\.allsettled is not a function/],
  },
  {
    feature: 'Promise.any()',
    minVersions: { chromium: 88, firefox: 79, webkit: 14 },
    confidence: 'low',
    kind: 'js',
    signatures: [/promise\.any is not a function/],
  },
  {
    feature: 'Array.prototype.flat() / flatMap()',
    minVersions: { chromium: 69, firefox: 62, webkit: 12 },
    confidence: 'low',
    kind: 'js',
    signatures: [/\.flat(?:map)? is not a function/],
  },
  {
    feature: 'Object.fromEntries()',
    minVersions: { chromium: 73, firefox: 63, webkit: 12.1 },
    confidence: 'low',
    kind: 'js',
    signatures: [/object\.fromentries is not a function/],
  },
  {
    feature: 'String.prototype.replaceAll()',
    minVersions: { chromium: 85, firefox: 77, webkit: 13.1 },
    confidence: 'low',
    kind: 'js',
    signatures: [/\.replaceall is not a function/],
  },
  {
    feature: 'String.prototype.matchAll()',
    minVersions: { chromium: 73, firefox: 67, webkit: 13 },
    confidence: 'low',
    kind: 'js',
    signatures: [/\.matchall is not a function/],
  },
];

export function formatVersion(v: number): string {
  if (v >= 100) return String(v);
  const major = Math.floor(v);
  const minor = Math.round((v - major) * 10);
  return minor > 0 ? `${major}.${minor}` : `${major}`;
}

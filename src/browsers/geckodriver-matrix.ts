/**
 * geckodriver ↔ Firefox compatibility matrix.
 *
 * This is PURE DATA plus a resolver. The Firefox provider never hard-codes a
 * geckodriver version — it asks `resolveGeckodriver(major)`. Adding or upgrading
 * a row here requires no change to provider logic.
 *
 * Source: Mozilla's published geckodriver "Supported Platforms" matrix
 * (https://firefox-source-docs.mozilla.org/testing/geckodriver/Support.html).
 * Each geckodriver release only drives a specific Firefox range; outside that
 * range the driver either refuses the session or behaves unreliably.
 */

/** A row of the matrix: which Firefox majors a given geckodriver can drive. */
export interface GeckodriverCompat {
  /** Lowest Firefox major this geckodriver supports (inclusive). */
  firefoxMin: number;
  /** Highest Firefox major this geckodriver supports (inclusive). */
  firefoxMax: number;
  /** geckodriver release tag, e.g. '0.34.0'. */
  geckodriver: string;
}

/**
 * Absolute floor: no geckodriver release can drive Firefox below this major.
 * (geckodriver 0.17.0 is the oldest release, supporting Firefox 52.)
 */
export const GECKODRIVER_ABSOLUTE_FLOOR = 52;

/**
 * Vendored compatibility table. Overlapping ranges are fine — the resolver
 * picks the highest (most recent) compatible geckodriver. A very high
 * `firefoxMax` (9999) denotes "current / open-ended".
 */
export const GECKODRIVER_MATRIX: readonly GeckodriverCompat[] = [
  { firefoxMin: 52, firefoxMax: 62, geckodriver: '0.17.0' },
  { firefoxMin: 55, firefoxMax: 62, geckodriver: '0.20.0' },
  { firefoxMin: 57, firefoxMax: 90, geckodriver: '0.26.0' },
  { firefoxMin: 60, firefoxMax: 90, geckodriver: '0.30.0' },
  { firefoxMin: 91, firefoxMax: 120, geckodriver: '0.31.0' },
  { firefoxMin: 102, firefoxMax: 120, geckodriver: '0.33.0' },
  { firefoxMin: 115, firefoxMax: 9999, geckodriver: '0.34.0' },
];

/**
 * Resolve the best (most recent) geckodriver that can drive the requested
 * Firefox major. Returns null if no compatible driver exists in the matrix —
 * the caller MUST then record an INCONCLUSIVE result, never substitute another
 * browser version.
 */
export function resolveGeckodriver(firefoxMajor: number): GeckodriverCompat | null {
  const matches = GECKODRIVER_MATRIX.filter(
    (e) => firefoxMajor >= e.firefoxMin && firefoxMajor <= e.firefoxMax,
  );
  if (matches.length === 0) return null;
  // Highest (most recent) geckodriver wins. Stable sort keeps determinism.
  return [...matches].sort((a, b) => cmpSemver(b.geckodriver, a.geckodriver))[0];
}

/**
 * Compare two dotted numeric version strings (e.g. '0.34.0' vs '0.17.0').
 * Returns < 0 if a < b, 0 if equal, > 0 if a > b. Non-numeric segments compare 0.
 */
export function cmpSemver(a: string, b: string): number {
  const pa = a.split('.').map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => Number.parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

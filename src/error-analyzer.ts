import type {
  CheckResult,
  ConsoleMessage,
  EngineName,
  FailedRequest,
  FeatureRequirement,
  JsError,
} from './types.js';

/**
 * error-analyzer.ts
 *
 * Turns raw browser noise (pageerrors, console messages, failed requests)
 * into two things:
 *   1. A verdict (PASS / FAIL) with a single human reason.
 *   2. A mapping to the ECMAScript / Web feature that most likely caused the
 *      failure, plus the minimum engine major versions that support it.
 *
 * The feature table is a plain data structure so it can be extended without
 * touching logic. Min versions come from MDN/caniuse baseline support data
 * (engine major versions):
 *   - Chromium = Chrome desktop major
 *   - Firefox  = Firefox desktop major
 *   - WebKit   = Safari desktop major (closest proxy; see browser-installer)
 */

interface FeatureRow {
  feature: string;
  minVersions: Partial<Record<EngineName, number>>;
  /** Regex tested against the lowercased error text. */
  signatures: RegExp[];
  /** js = JS/Syntax/Reference error; net = failed app-critical request. */
  kind: 'js' | 'net';
}

const FEATURE_TABLE: FeatureRow[] = [
  {
    feature: 'Optional chaining (?.)',
    minVersions: { chromium: 80, firefox: 74, webkit: 13_1 },
    kind: 'js',
    signatures: [
      /unexpected token ['"]?\?\.['"]?/,
      /cannot read propert(?:y|ies) of undefined \(reading/,
    ],
  },
  {
    feature: 'Nullish coalescing (??)',
    minVersions: { chromium: 80, firefox: 72, webkit: 13_1 },
    kind: 'js',
    signatures: [/unexpected token ['"]?\?\?['"]?/],
  },
  {
    feature: 'Logical assignment operators (||=, &&=, ??=)',
    minVersions: { chromium: 85, firefox: 79, webkit: 14 },
    kind: 'js',
    signatures: [/unexpected token ['"]?\?\?=['"]?/, /unexpected token ['"]\|\|=]/],
  },
  {
    feature: 'Array.prototype.at() / String.prototype.at()',
    minVersions: { chromium: 92, firefox: 90, webkit: 15_4 },
    kind: 'js',
    signatures: [/\.at is not a function/, /reading ['"]at['"]/],
  },
  {
    feature: 'structuredClone()',
    minVersions: { chromium: 98, firefox: 94, webkit: 15_4 },
    kind: 'js',
    signatures: [/structuredclone is not defined/],
  },
  {
    feature: 'Object.hasOwn()',
    minVersions: { chromium: 93, firefox: 92, webkit: 15_4 },
    kind: 'js',
    signatures: [/object\.hasown is not a function/],
  },
  {
    feature: 'Promise.allSettled()',
    minVersions: { chromium: 76, firefox: 71, webkit: 13 },
    kind: 'js',
    signatures: [/promise\.allsettled is not a function/],
  },
  {
    feature: 'Promise.any()',
    minVersions: { chromium: 88, firefox: 79, webkit: 14 },
    kind: 'js',
    signatures: [/promise\.any is not a function/],
  },
  {
    feature: 'Private class fields (#)',
    minVersions: { chromium: 74, firefox: 90, webkit: 14_1 },
    kind: 'js',
    signatures: [/unexpected token ['"]#['"]/, /private field/],
  },
  {
    feature: 'Public class fields',
    minVersions: { chromium: 72, firefox: 69, webkit: 14_1 },
    kind: 'js',
    signatures: [/class field/, /must be called with 'new'/],
  },
  {
    feature: 'globalThis',
    minVersions: { chromium: 71, firefox: 65, webkit: 12_1 },
    kind: 'js',
    signatures: [/globalthis is not defined/],
  },
  {
    feature: 'Numeric separators (1_000)',
    minVersions: { chromium: 75, firefox: 70, webkit: 13 },
    kind: 'js',
    signatures: [/unexpected token ['"]_['"]?/],
  },
  {
    feature: 'Array.prototype.flat() / flatMap()',
    minVersions: { chromium: 69, firefox: 62, webkit: 12 },
    kind: 'js',
    signatures: [/\.flat(?:map)? is not a function/],
  },
  {
    feature: 'Object.fromEntries()',
    minVersions: { chromium: 73, firefox: 63, webkit: 12_1 },
    kind: 'js',
    signatures: [/object\.fromentries is not a function/],
  },
  {
    feature: 'BigInt',
    minVersions: { chromium: 67, firefox: 68, webkit: 14 },
    kind: 'js',
    signatures: [/cannot use.*bigint/, /bigint is not defined/],
  },
  {
    feature: 'String.prototype.replaceAll()',
    minVersions: { chromium: 85, firefox: 77, webkit: 13_1 },
    kind: 'js',
    signatures: [/\.replaceall is not a function/],
  },
  {
    feature: 'String.prototype.matchAll()',
    minVersions: { chromium: 73, firefox: 67, webkit: 13 },
    kind: 'js',
    signatures: [/\.matchall is not a function/],
  },
  {
    feature: 'Dynamic import()',
    minVersions: { chromium: 63, firefox: 67, webkit: 11_1 },
    kind: 'js',
    signatures: [/import\(\)/, /unexpected token ['"]import['"]?/],
  },
  {
    feature: 'fetch()',
    minVersions: { chromium: 42, firefox: 39, webkit: 10_1 },
    kind: 'js',
    signatures: [/fetch is not defined/],
  },
  {
    feature: 'ResizeObserver',
    minVersions: { chromium: 64, firefox: 69, webkit: 13_1 },
    kind: 'js',
    signatures: [/resizeobserver is not defined/],
  },
  {
    feature: 'IntersectionObserver',
    minVersions: { chromium: 51, firefox: 55, webkit: 12_1 },
    kind: 'js',
    signatures: [/intersectionobserver is not defined/],
  },
];

/**
 * Hosts whose failed requests must NOT fail a test. These are analytics,
 * tracking pixels, A/B testing, and similar non-functional telemetry. A real
 * Iranian crypto exchange ships gtag/GA/similar; those failing in old browsers
 * is expected and irrelevant to app compatibility.
 */
const ANALYTICS_HOST_FRAGMENTS = [
  'google-analytics.com',
  'googletagmanager.com',
  'gtag',
  'doubleclick.net',
  'facebook.net',
  'connect.facebook.net',
  'snap.licdn.com',
  'px.ads.linkedin.com',
  'hotjar',
  'clarity.ms',
  'segment.io',
  'mixpanel',
  'sentry.io', // telemetry; app often still works if telemetry fails
  'rudderstack',
  'amplitude',
  'matomo',
  'mc.yandex.',
  'tracking',
  'pixel',
  'tagmanager',
];

function classifyRequest(url: string, resourceType: string): FailedRequest['category'] {
  const u = url.toLowerCase();
  if (resourceType === 'font' || u.includes('.woff') || u.includes('.ttf')) return 'font';
  if (resourceType === 'image' || /\.(png|jpe?g|gif|webp|svg|ico|avif)(\?|$)/.test(u)) return 'image';
  if (resourceType === 'stylesheet' || u.endsWith('.css')) return 'css';
  if (resourceType === 'script' || u.endsWith('.js') || u.includes('.mjs')) return 'js';
  if (resourceType === 'xhr' || resourceType === 'fetch' || u.includes('/api/')) return 'app';
  if (ANALYTICS_HOST_FRAGMENTS.some((f) => u.includes(f))) return 'analytics';
  if (ANALYTICS_HOST_FRAGMENTS.some((f) => u.includes(f))) return 'analytics';
  return 'other';
}

export function isAnalyticsFailure(url: string): boolean {
  const u = url.toLowerCase();
  return ANALYTICS_HOST_FRAGMENTS.some((f) => u.includes(f));
}

/**
 * Decorate a raw requestfailed event with category + fatality.
 * App/js/css/api/font failures are fatal; analytics/image/other are not.
 */
export function classifyFailedRequest(
  url: string,
  method: string,
  resourceType: string,
  failureText: string | null,
): FailedRequest {
  const category = classifyRequest(url, resourceType);
  const fatal = category !== 'analytics' && category !== 'image' && category !== 'other';
  return { url, method, resourceType, failureText, category, fatal };
}

/** Find the feature whose signature matches an error string, if any. */
export function matchFeature(text: string, kind: 'js' | 'net'): FeatureRequirement | null {
  const lower = text.toLowerCase();
  for (const row of FEATURE_TABLE) {
    if (row.kind !== kind) continue;
    if (row.signatures.some((re) => re.test(lower))) {
      return {
        feature: row.feature,
        minVersions: { ...row.minVersions },
        evidence: text,
      };
    }
  }
  return null;
}

/**
 * Analyse all collected signals for a single check and produce:
 *  - verdict (PASS/FAIL)
 *  - a single reason string
 *  - the most likely responsible feature (if FAIL), for the ES findings table
 *
 * Priority of fatal signals:
 *   1. navigationError  (DNS/TLS/timeout/crash)
 *   2. pageerror / critical console errors  (JS)
 *   3. fatal failedRequests (app js/css/api/font)
 */
export interface Analysis {
  verdict: 'PASS' | 'FAIL';
  reason: string;
  feature: FeatureRequirement | null;
}

export function analyzeSignals(
  navigationError: string | null,
  jsErrors: JsError[],
  consoleErrors: ConsoleMessage[],
  failedRequests: FailedRequest[],
  rendered: boolean,
): Analysis {
  if (navigationError) {
    return {
      verdict: 'FAIL',
      reason: `Navigation error: ${navigationError}`,
      feature: null,
    };
  }

  for (const err of jsErrors) {
    const feat = matchFeature(err.message, 'js');
    if (feat) {
      return {
        verdict: 'FAIL',
        reason: `JavaScript ${err.type} error: ${err.message}`,
        feature: feat,
      };
    }
    // A pageerror is fatal even if we can't map it to a known feature.
    if (err.type === 'pageerror') {
      return {
        verdict: 'FAIL',
        reason: `Uncaught JavaScript error: ${err.message}`,
        feature: feat,
      };
    }
  }

  // Console errors are NOT automatically fatal — only "error" level messages
  // that look like real JS runtime failures (not generic framework warnings).
  for (const msg of consoleErrors) {
    if (msg.level !== 'error') continue;
    const feat = matchFeature(msg.text, 'js');
    if (feat) {
      return { verdict: 'FAIL', reason: `Console error: ${msg.text}`, feature: feat };
    }
  }

  const fatalReq = failedRequests.find((r) => r.fatal);
  if (fatalReq) {
    return {
      verdict: 'FAIL',
      reason: `Failed app request [${fatalReq.category}] ${fatalReq.url}: ${fatalReq.failureText ?? 'unknown'}`,
      feature: matchFeature(fatalReq.url, 'net'),
    };
  }

  if (!rendered) {
    return {
      verdict: 'FAIL',
      reason: 'Page did not render required application content (key selectors not visible).',
      feature: null,
    };
  }

  return { verdict: 'PASS', reason: '', feature: null };
}

/**
 * Collapse per-version feature requirements into the report's findings table,
 * keeping the highest (most restrictive) min version per feature per engine.
 */
export function aggregateFeatureFindings(
  results: CheckResult[],
  summaries: { engine: EngineName; oldestPassing: string | null }[],
): FeatureRequirement[] {
  const byFeature = new Map<string, FeatureRequirement>();

  for (const r of results) {
    if (!r.failureFeature) continue;
    const existing = byFeature.get(r.failureFeature.feature);
    if (!existing) {
      byFeature.set(r.failureFeature.feature, { ...r.failureFeature });
      continue;
    }
    // Keep the strictest min version per engine.
    for (const eng of ['chromium', 'firefox', 'webkit'] as EngineName[]) {
      const a = existing.minVersions[eng];
      const b = r.failureFeature.minVersions[eng];
      if (b !== undefined && (a === undefined || b > a)) {
        existing.minVersions[eng] = b;
      }
    }
  }

  const findings = [...byFeature.values()];
  void summaries; // signatures kept for future per-engine restriction
  return findings;
}

export function formatVersion(v: number): string {
  // Safari uses minor versions (13.1, 14.1) meaningfully.
  if (v >= 100) return String(v);
  const major = Math.floor(v);
  const minor = Math.round((v - major) * 10);
  return minor > 0 ? `${major}.${minor}` : `${major}`;
}

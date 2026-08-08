import type { Page } from 'playwright';
import type { FailedRequest } from '../reporting/types.js';
import type { ResourceType } from '../config/schema.js';

/**
 * Network failure classification (Category 3).
 *
 * Classifies a failed request as fatal or non-fatal based on config:
 *  - ignoredPatterns: URLs matching these are NON-fatal (analytics/tracking).
 *  - criticalResourceTypes: failures of these resource types ARE fatal
 *    (app-critical JS/CSS/API/fonts).
 *
 * The classification logic is PURE (no network) so it is unit-testable.
 */

export function classifyRequest(
  url: string,
  resourceType: string,
  ignoredPatterns: RegExp[],
): FailedRequest['category'] {
  const u = url.toLowerCase();
  if (ignoredPatterns.some((re) => re.test(url))) return 'analytics';
  if (resourceType === 'font' || u.includes('.woff') || u.includes('.ttf')) return 'font';
  if (resourceType === 'image' || /\.(png|jpe?g|gif|webp|svg|ico|avif)(\?|$)/.test(u)) return 'image';
  if (resourceType === 'stylesheet' || u.endsWith('.css')) return 'css';
  if (resourceType === 'script' || u.endsWith('.js') || u.includes('.mjs')) return 'js';
  if (resourceType === 'xhr' || resourceType === 'fetch' || u.includes('/api/')) return 'app';
  return 'other';
}

export function isFatalFailure(
  category: FailedRequest['category'],
  resourceType: string,
  criticalResourceTypes: ResourceType[],
): boolean {
  // analytics/image/other are never fatal.
  if (category === 'analytics' || category === 'image' || category === 'other') return false;
  // css/js/app/font: fatal only if the resource type is in criticalResourceTypes.
  return criticalResourceTypes.includes(resourceType as ResourceType);
}

export function classifyFailedRequest(
  url: string,
  method: string,
  resourceType: string,
  failureText: string | null,
  ignoredPatterns: RegExp[],
  criticalResourceTypes: ResourceType[],
): FailedRequest {
  const category = classifyRequest(url, resourceType, ignoredPatterns);
  const fatal = isFatalFailure(category, resourceType, criticalResourceTypes);
  return { url, method, resourceType, failureText, category, fatal };
}

/**
 * Tracks in-flight requests and response counts on a page so the checker can
 * (a) time responses for the artifact log and (b) detect the silent-stall
 * anti-bot pattern via detectSilentStall().
 */
export function attachRequestTracker(
  page: Page,
  onResponse?: (status: number, method: string, url: string, durMs: number) => void,
): { inflight: Map<string, { method: string; url: string; started: number }>; responseCount: () => number } {
  const inflight = new Map<string, { method: string; url: string; started: number }>();
  let count = 0;
  page.on('request', (req) => {
    inflight.set(req.url(), { method: req.method(), url: req.url(), started: Date.now() });
  });
  page.on('response', (res) => {
    count++;
    const meta = inflight.get(res.url());
    if (meta) {
      inflight.delete(meta.url);
      onResponse?.(res.status(), meta.method, meta.url, Date.now() - meta.started);
    }
  });
  return { inflight, responseCount: () => count };
}

import type { RuntimeCompatibilityStatus } from './types.js';

export type WebViewCapabilityCategory =
  | 'web-platform'
  | 'native-api'
  | 'host-setting'
  | 'permission'
  | 'product-feature';

export interface WebViewCapabilityEntry {
  id: string;
  category: WebViewCapabilityCategory;
  status: Extract<RuntimeCompatibilityStatus, 'supported' | 'unsupported' | 'conditional'>;
  minMajor?: number;
  maxMajor?: number;
  source: string;
  notes: string;
  conditions?: string[];
}

/**
 * Small, sourced override registry. It intentionally does not duplicate Blink's
 * web-platform feature table; entries describe WebView embedding/runtime facts.
 */
export const WEBVIEW_CAPABILITIES: readonly WebViewCapabilityEntry[] = [
  {
    id: 'javascript-execution',
    category: 'host-setting',
    status: 'conditional',
    source: 'https://developer.android.com/develop/ui/views/layout/webapps/webview',
    notes: 'JavaScript execution is controlled by the embedding application and is disabled by default.',
    conditions: ['The host application must enable JavaScript through WebSettings.'],
  },
  {
    id: 'chrome-sync',
    category: 'product-feature',
    status: 'unsupported',
    source: 'https://developer.chrome.com/docs/webview',
    notes: 'Google Chrome product features such as Sync are not part of the Android WebView runtime.',
  },
];

export function webViewCapabilityFor(
  id: string,
  major: number | null,
  registry: readonly WebViewCapabilityEntry[] = WEBVIEW_CAPABILITIES,
): WebViewCapabilityEntry | null {
  if (major === null) return null;
  return registry.find((entry) =>
    entry.id === id &&
    (entry.minMajor === undefined || major >= entry.minMajor) &&
    (entry.maxMajor === undefined || major <= entry.maxMajor),
  ) ?? null;
}

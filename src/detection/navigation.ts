/**
 * Navigation error detection (Category 1).
 *
 * Wraps page.goto and classifies DNS/TLS/timeout/crash failures. Also detects
 * the "silent stall" pattern (request sent, no response) typical of anti-bot
 * layers that drop automated browsers without an explicit error — reported as
 * inconclusive, NOT as a compatibility failure.
 */

export interface NavigationOutcome {
  ok: boolean;
  error: string | null;
  /** True if the failure looks like an infrastructure/anti-bot stall. */
  isTransient: boolean;
}

export function describeNavigationError(err: unknown): NavigationOutcome {
  const msg = err instanceof Error ? err.message : String(err);
  const net = msg.match(/net::ERR_[A-Z_]+/);
  if (net) return { ok: false, error: `Network failure ${net[0]}: ${msg}`, isTransient: false };
  if (/timeout/i.test(msg)) return { ok: false, error: `Navigation timeout: ${msg}`, isTransient: true };
  if (/tls|certificate|ERR_CERT/i.test(msg)) return { ok: false, error: `TLS/certificate error: ${msg}`, isTransient: false };
  if (/dns|ENOTFOUND|ERR_NAME_NOT_RESOLVED/i.test(msg)) return { ok: false, error: `DNS error: ${msg}`, isTransient: false };
  if (/target closed|browser has been closed|crash/i.test(msg)) return { ok: false, error: `Browser/transport error: ${msg}`, isTransient: true };
  return { ok: false, error: `Navigation failed: ${msg}`, isTransient: false };
}

/**
 * Given the in-flight request set and response count at failure time, detect
 * the silent-stall anti-bot pattern: the document request was dispatched but
 * the server returned nothing. This is reported distinctly and is never treated
 * as a browser compatibility failure.
 */
export function detectSilentStall(
  pageUrl: string,
  inflight: { method: string; url: string }[],
  responseCount: number,
  timeoutMs: number,
): string | null {
  const docInflight = inflight.some(
    (m) => m.method === 'GET' && m.url.replace(/\/$/, '') === pageUrl.replace(/\/$/, ''),
  );
  if (docInflight && responseCount === 0) {
    return (
      `Navigation stalled with no server response: the document request to ${pageUrl} was ` +
      `sent but the server returned 0 bytes within ${timeoutMs}ms, while non-automated clients ` +
      `succeed. This is typical of an anti-bot/WAF layer stalling the automated TLS client, ` +
      `not a browser-compatibility problem.`
    );
  }
  return null;
}

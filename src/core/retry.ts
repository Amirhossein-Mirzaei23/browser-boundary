/**
 * Retry wrapper for TRANSIENT failures only.
 *
 * A check is retried when its verdict is 'inconclusive'/'error' AND the reason
 * looks transient (navigation timeout, silent-stall, browser/transport error).
 * Definitive pass/fail results are never retried — they reflect genuine
 * (in)compatibility.
 */
const TRANSIENT = /stalled with no server response|navigation timeout|browser\/transport error|could not run check|target closed|crash/i;

export async function withRetry<T>(
  fn: () => Promise<T>,
  attempts: number,
  shouldRetry: (result: T) => boolean,
  backoffMs = (n: number) => 1500 * n,
  onRetry?: (attempt: number, result: T) => void,
): Promise<T> {
  let last: T;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    last = await fn();
    if (!shouldRetry(last) || attempt === attempts) return last;
    onRetry?.(attempt, last);
    await new Promise((r) => setTimeout(r, backoffMs(attempt)));
  }
  return last!;
}

export function isTransientReason(reason: string): boolean {
  return TRANSIENT.test(reason);
}

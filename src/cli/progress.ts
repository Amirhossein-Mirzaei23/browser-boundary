import type { FetchProgressEvent } from '../browsers/progress.js';

/**
 * CLI renderer for binary-fetch progress events.
 *
 * Draws an in-place progress line (via `\r` carriage-return redraw) while a
 * Chromium binary downloads, so the user sees the version that is missing, the
 * nearby revision being fetched, and a byte progress bar — all updating live on
 * one line beneath the `[chromium vNNN] home …` label.
 *
 * Output contract:
 *  - On a TTY: redraws the SAME line with `\r` while a download is active, then
 *    clears it on `done` so the eventual `→ PASS`/`→ INCONCLUSIVE` verdict lands
 *    on a fresh line.
 *  - NOT a TTY (redirected to a file/log): prints each phase change once as a
 *    normal line (no `\r`, no bar) so logs stay readable instead of filling with
 *    control characters.
 *
 * The renderer is the ONLY place that knows about terminals; the provider/scanner
 * layers emit pure data events.
 */

/**
 * Minimal stream surface the renderer needs: a writable text stream that reports
 * whether it's a TTY and its column width. `process.stdout` satisfies this, and
 * so does a tiny fake in tests — without pulling in the full WriteStream type.
 */
export interface ProgressStream {
  write(s: string): boolean;
  readonly isTTY?: boolean;
  readonly columns?: number;
}

/** Minimum byte delta between bar redraws (avoids flooding a fast stream). */
const REDRAW_BYTE_INTERVAL = 1_000_000; // ~1 MB

/** Integer percentage change that forces a redraw regardless of byte delta. */
function pctOf(received: number, total: number | null): number {
  if (total && total > 0) return Math.min(100, Math.floor((received / total) * 100));
  return -1;
}

export class FetchProgressRenderer {
  private readonly stream: ProgressStream;
  private readonly isTTY: boolean;
  /** Label of the current phase, shown before the bar. */
  private currentLabel = '';
  /** True when the current phase has no byte total (pulse instead of % bar). */
  private indeterminate = false;
  /** Last received/total for the current phase. */
  private received = 0;
  private total: number | null = null;
  /** Bytes at which we last actually wrote, to throttle redraws. */
  private lastDrawnBytes = -Infinity;
  /** Integer percentage last drawn, to force a redraw on whole-% changes. */
  private lastDrawnPct = -1;
  /** Timestamp (ms) of the last redraw — time-throttles indeterminate updates. */
  private lastDrawnAt = 0;
  /** Whether a line is currently drawn (needs clearing before the next print). */
  private lineActive = false;

  constructor(stream: ProgressStream = process.stdout) {
    this.stream = stream;
    this.isTTY = stream.isTTY === true;
  }

  /** Entry point: handle one progress event from the provider layer. */
  handle(event: FetchProgressEvent): void {
    switch (event.type) {
      case 'status':
        this.startPhase(event.label, event.indeterminate === true);
        break;
      case 'bytes':
        this.received = event.received;
        this.total = event.total;
        this.redraw(false);
        break;
      case 'done':
        this.finish();
        break;
    }
  }

  private startPhase(label: string, indeterminate: boolean): void {
    this.currentLabel = label;
    this.indeterminate = indeterminate;
    this.received = 0;
    this.total = null;
    this.lastDrawnBytes = -Infinity;
    this.lastDrawnPct = -1;
    this.lastDrawnAt = 0;
    if (this.isTTY) {
      // Redraw in place immediately so the new phase label appears right away.
      this.redraw(true);
    } else {
      // Non-TTY: emit the phase label once as a plain line.
      this.writePlain(`    ${label}`);
    }
  }

  private redraw(force: boolean): void {
    if (!this.isTTY) return;
    // Throttle byte-driven redraws unless forced, OR the integer percentage
    // changed (so small downloads still tick visibly), OR enough bytes flowed.
    // When the total is unknown (no %), use a smaller byte delta + a time
    // fallback so an indeterminate download still visibly progresses.
    const now = Date.now();
    const pct = pctOf(this.received, this.total);
    const known = pct >= 0;
    const pctChanged = known && pct !== this.lastDrawnPct;
    const interval = known ? REDRAW_BYTE_INTERVAL : 256 * 1024;
    const byteEnough = this.received - this.lastDrawnBytes >= interval;
    const timeEnough = !known && now - this.lastDrawnAt >= 120;
    if (!force && !pctChanged && !byteEnough && !timeEnough) return;
    this.lastDrawnBytes = this.received;
    this.lastDrawnAt = now;
    if (known) this.lastDrawnPct = pct;
    this.lineActive = true;
    const line = this.indeterminate
      ? `${this.currentLabel} ${pulse()}`
      : `${this.currentLabel} ${this.bar()}`;
    // Pad to (over-)clear the previous line, then reset cursor with \r.
    this.stream.write(`\r${padToWidth(line, this.stream.columns ?? 80)}`);
  }

  private bar(): string {
    if (this.total && this.total > 0) {
      const pct = Math.min(100, Math.round((this.received / this.total) * 100));
      const width = 24;
      const filled = Math.round((pct / 100) * width);
      const blocks = '█'.repeat(filled) + '░'.repeat(width - filled);
      return `${blocks} ${String(pct).padStart(3)}% ${humanBytes(this.received)}/${humanBytes(this.total)}`;
    }
    // No Content-Length — show an indeterminate fill + running byte count.
    return `${indeterminateBar()} ${humanBytes(this.received)}`;
  }

  private finish(): void {
    if (this.isTTY && this.lineActive) {
      // Clear the progress line so the verdict line lands cleanly.
      this.stream.write(`\r${' '.repeat(this.stream.columns ?? 80)}\r`);
      this.lineActive = false;
    }
    // On non-TTY nothing to clear; phase lines were already printed.
  }

  private writePlain(s: string): void {
    this.stream.write(`${s}\n`);
  }
}

/** Format a byte count as e.g. "157.8 MB". */
function humanBytes(n: number): string {
  if (n >= 1_073_741_824) return `${(n / 1_073_741_824).toFixed(1)} GB`;
  if (n >= 1_048_576) return `${(n / 1_048_576).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${n} B`;
}

/** A simple spinner frame that advances on each call (indeterminate phase). */
function pulse(): string {
  const frame = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏';
  return frame[Date.now() % frame.length]!;
}

/** An indeterminate sliding-fill bar (no known total). */
function indeterminateBar(): string {
  const width = 24;
  const pos = Math.floor(Date.now() / 120) % width;
  return '░'.repeat(pos) + '█' + '░'.repeat(width - pos - 1);
}

/** Pad/truncate a string to exactly `width` columns (so `\r` clears the prior line). */
function padToWidth(s: string, width: number): string {
  // Strip ANSI for length math; this renderer emits none, but be safe.
  const visible = s.replace(/\x1b\[[0-9;]*m/g, '');
  if (visible.length >= width) return visible.slice(0, width);
  return visible + ' '.repeat(width - visible.length);
}

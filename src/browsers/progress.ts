/**
 * Progress events emitted while a provider acquires a browser binary.
 *
 * Providers emit these as they move through acquisition phases (probing the
 * bucket, falling back to a nearby revision, downloading, extracting). The
 * scanner forwards them to the CLI renderer, which draws an in-place progress
 * bar during the (often long, multi-hundred-MB) Chromium download.
 *
 * Pure data — no rendering lives here so the same events can drive a CLI bar,
 * a structured logger, or tests.
 */

/**
 * A human-readable phase change: "the binary for Chrome 111 is not on the
 * bucket; searching for a nearby revision", "downloading r1014682…", etc.
 *
 * `label` is a short one-liner (no trailing newline). `indeterminate` means
 * the phase has no known byte total (e.g. probing revisions, extracting) — the
 * renderer shows an animation/pulse instead of a percentage bar.
 */
export interface FetchStatus {
  type: 'status';
  label: string;
  /** When true, this phase has no byte total (render as indeterminate). */
  indeterminate?: boolean;
}

/**
 * Incremental byte progress for the current download. `received` accumulates
 * since the last 'status' event; `total` is the Content-Length (null if the
 * server did not report it → render as indeterminate).
 */
export interface FetchBytes {
  type: 'bytes';
  received: number;
  total: number | null;
}

/**
 * Emitted once when the entire acquisition for a version is finished (binary
 * ready, or failed). The renderer clears its in-place bar so the verdict line
 * lands cleanly on a fresh line.
 */
export interface FetchDone {
  type: 'done';
  /** True when the binary is ready to launch; false on failure. */
  ok: boolean;
}

export type FetchProgressEvent = FetchStatus | FetchBytes | FetchDone;

/** Callback shape threaded from the scanner down into providers. */
export type FetchProgressHandler = (event: FetchProgressEvent) => void;

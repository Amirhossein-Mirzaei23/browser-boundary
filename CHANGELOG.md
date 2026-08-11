# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.1] - 2026-08-11

### Added
- **Download progress bar** — when a Chromium historical binary needs to be
  fetched (cache miss), the CLI now draws a live in-place progress bar with
  percentage and byte count (e.g. `71.0 MB/150.5 MB`) on the line beneath the
  `[chromium vNNN] home …` label.
- **Status text for missing versions** — when a curated snapshot revision has
  been pruned from the bucket, the scan now prints
  `Chromium NNN (rXXXXXX) is no longer on the bucket — finding a nearby revision…`
  followed by `Downloading Chromium NNN (rXXXXXX)…` and `Extracting…` phase
  indicators, instead of silently hanging.
- TTY-aware rendering: an interactive terminal redraws the bar in place with
  `\r`; when piped to a file/log, each phase prints once as a plain line (no
  control-character garbage).
- Pluggable `FetchProgressEvent` pipeline (`status`/`bytes`/`done`) threaded
  from `downloadFile` → provider → scanner → CLI renderer, so progress is pure
  data until the terminal layer.

## [1.3.0] - 2026-08-10

### Fixed
- **Chromium snapshot 404 errors** — the vendored `MILESTONE_REVISIONS` table
  held commit-position revisions that Google continuously prunes from the
  `chromium-browser-snapshots` bucket. 40 of 52 curated revisions returned 404
  (e.g. Chrome 111 → r1014680, Chrome 101 → r908261), surfacing as
  `INCONCLUSIVE (historical binary unavailable: … server returned code 404)`.
  The provider now detects a pruned revision and falls back to the nearest
  still-available revision in the same milestone window.
- Eliminated the leaked `@puppeteer/browsers` `"All providers failed… 404"`
  raw error; failures now report a clear, honest message.

### Added
- Outward HEAD-probing fallback (`findNearestAvailableSnapshotRevision`):
  steps `±1, ±2, … ±100` from the curated revision, returning the closest one
  whose `chrome-linux.zip` still exists. Stays within the same Chrome milestone
  (~6-week release window) — never a cross-version substitution.
- Tri-state revision probe (`probeSnapshotRevision`): distinguishes `ok` /
  `pruned` (404 → try nearby) / `unreachable` (401/403 geo-block or network →
  short-circuit to INCONCLUSIVE without probing 100 unreachable revisions).
- Direct `chrome-linux.zip` download + extraction in `downloadChromiumSnapshot`
  (bypasses `@puppeteer/browsers` so the exact fallback revision is controlled).
- The build label honestly reports a fallback revision, e.g.
  `Chromium 111 (snapshot r1014682, nearest to curated r1014680)`.

## [1.2.1] - 2026-08-09

### Changed
- Package renamed to `browser-boundary` (from `mrz-browser-compat`) and
  published under the `@amirhossein-mirzaei23` scope.

## [1.2.0] - 2026-08-08

### Added
- `--hold-open <sec>` flag (and `holdOpenSec` config / `MRZ_HOLD_OPEN` env) to
  keep the browser window open for N seconds after checks complete, giving the
  page extra time to fully load (late JS, async chunks, hydration) — useful in
  headed mode. Default 0 (no delay).
- `--http-cache` flag (and `disableHttpCache` config / `MRZ_HTTP_CACHE` env) to
  re-enable the browser HTTP cache. The cache is **disabled by default** for
  accuracy: a cached 200 can mask a real network failure and produce a false
  PASS. Opt in with `--http-cache` only if you specifically test caching.

### Fixed
- **Firefox historical testing removed** — vanilla Firefox builds from
  archive.mozilla.org lack Playwright's Juggler instrumentation and exit
  immediately on launch. Firefox now correctly reports as current-only (same
  honest limitation as WebKit). Previously it attempted to drive undrivable
  binaries, producing misleading ERROR verdicts.
- **Version-search "all-errored" bug** — when every version in a range errored
  or was inconclusive, the summary wrongly reported the floor (e.g. "PASS >= 60")
  as the oldest verified pass. Now correctly reports null (no verified pass)
  with `boundaryConfidence: 'unknown'`.

### Changed
- Only Chromium supports real historical browser testing (CDP is native to
  every Chrome build). Firefox and WebKit are probed latest-only with a clear
  limitation note in the report.

## [1.1.0] - 2026-08-08

### Added
- `--wait-until` flag (and `waitUntil` config / `MRZ_WAIT_UNTIL` env) to choose
  between full page load (`load`) and document-only (`domcontentloaded`,
  default). Useful for asserting the whole page (images/media/analytics)
  finishes loading vs. just the parsed DOM.
- `waitUntil` added to the resolved config and CHANGELOG/config snapshot.

### Changed
- Per-check progress-log error text is no longer truncated at 90 characters;
  it now truncates at 600 characters so full diagnostic text (stack signatures,
  request URLs, net error codes) is visible during a scan.

## [Unreleased]

### Added
- README recommends https://www.whatsmybrowser.org/ as a quick first-test
  target: the page renders the *actual* browser version/engine/UA of whatever
  loads it, giving visible proof that the tool drives real historical binaries
  rather than spoofing the User-Agent.
- Generic reusable npm package `mrz-browser-compat` (extracted from the
  Tabdeal-specific prototype). The core engine now has **no** site-specific
  knowledge.
- `BrowserCompatibilityScanner` class and `scan()` public API.
- `mrz-browser-compat` CLI with flag parsing, `install` subcommand, and
  distinct exit codes (0 success / 1 compat failure / 2 config error / 3 infra).
- Pluggable `BrowserProvider` abstraction (Playwright / Chrome-for-Testing /
  Firefox archive / WebKit-revision-only).
- Generic readiness model: selector-based (`any`/`all`), custom async function,
  per-URL overrides.
- Error analysis with a confidence model (`high`/`medium`/`low`/`unknown`).
- Local test fixtures (no external-site dependency for unit/integration tests).
- Dual ESM/CJS build via `tsup`.

### Changed
- `package.json` renamed from `browser-compatibility`; `private` removed;
  Playwright is now a peer dependency; `@puppeteer/browsers` optional.
- Verdict model now reports **verified boundaries** (`oldestVerifiedPassing`,
  `firstVerifiedFailing`) instead of claiming a whole supported/unsupported
  range for untested versions.
- WebKit results carry an explicit `versionType: 'playwright-revision'` and are
  never reported as a specific Safari version.

### Fixed
- Error analyzer no longer attributes generic runtime `TypeError` (e.g.
  "Cannot read properties of undefined") to an ECMAScript feature. Such errors
  now carry `confidence: 'unknown'` and do not auto-FAIL a version.
- Removed hardcoded analytics-host blocklist from the core; it is now
  configurable via `network.ignoredPatterns`.

### Removed
- Tabdeal-specific selectors, URLs, and the ArvanCloud/WAF warm-up have been
  moved out of the core into `examples/tabdeal.ts` and an opt-in hook.

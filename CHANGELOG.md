# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
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

# Browser Capability Matrix

What `browser-boundary` can actually launch, drive, and verify — before you pay the historical download cost. Every entry is grounded in the providers and controllers in this repository (`src/browsers/*`, `src/controllers/*`).

Columns per engine: **Controller** (automation path), **Version type** (how versions are reported), **Historical support**, **Supported floor**, **Tested OS/architecture**, **Required optional dependency**, and **Known host limitations**.

## Legend

- **Implemented range** — what the code can nominally acquire and launch.
- **Validated combinations** — engine/controller/host pairs actually exercised by this repository's tests and verified demo runs.
- **Best-effort combinations** — implemented but not validated on every host; failures surface as `inconclusive`, never as fake verdicts.
- **Unsupported combinations** — rejected with a configuration error; not attempted.
- **Inconclusive behavior** — when acquisition or launch fails, the version is reported `inconclusive` (or `error` for infrastructure faults). Another browser version is NEVER substituted under the requested version's label.

## Chromium

| Aspect | Value |
| --- | --- |
| Controller | Playwright (CDP) for current builds and Chrome-for-Testing ≥113; WebDriver (ChromeDriver) for historical snapshots ≤112 |
| Version type | `real-major` |
| Historical support | Major 67–current (two-tier: Chrome-for-Testing ≥113; Chromium continuous snapshots 67–112) |
| Supported floor | 67 |
| Tested OS/architecture | Linux x64 (validated: Chrome-for-Testing 120/121 via the demo verification workflow; Playwright-managed current builds via the unit/integration suites) |
| Required optional dependency | `@puppeteer/browsers` (Chrome-for-Testing and snapshot acquisition) |
| Known host limitations | The Chromium snapshot bucket (majors ≤112) is geo-blocked in some locations; downloads then fail and affected versions are reported inconclusive |

## Firefox

| Aspect | Value |
| --- | --- |
| Controller | WebDriver (geckodriver + Marionette) for historical and current builds; Playwright (Juggler) only for the Playwright-managed current build |
| Version type | `real-major` |
| Historical support | Major 52–current via archive.mozilla.org builds |
| Supported floor | 52 (config floor default 60) |
| Tested OS/architecture | Linux x64 (historical builds 93/103/113/123/143 exercised on this repository's host) |
| Required optional dependency | `selenium-webdriver` |
| Known host limitations | Vanilla Firefox builds lack Playwright's Juggler patch and cannot be driven by Playwright — they require the WebDriver path. Old Linux hosts may need `MOZ_DISABLE_CONTENT_SANDBOX` (applied automatically). |

## WebKit

| Aspect | Value |
| --- | --- |
| Controller | Playwright (inspector patch) |
| Version type | `playwright-revision` — a Playwright build revision, **not a Safari major** |
| Historical support | Current Playwright-managed build only |
| Supported floor | n/a (current build only) |
| Tested OS/architecture | Linux x64 (Playwright-managed build) |
| Required optional dependency | none (Playwright manages the build) |
| Known host limitations | Historical Safari testing requires matching macOS releases or a device-testing service; it is intentionally not claimed |

## Compatibility classification

| Classification | Meaning |
| --- | --- |
| Implemented range | See per-engine rows above |
| Validated combinations | Chromium/Playwright on Linux x64 (demo boundary 120→121, identity-verified); Firefox/WebDriver on Linux x64; WebKit/Playwright current build |
| Best-effort combinations | Chromium snapshot majors 67–112 on non-geo-blocked hosts; any engine on macOS/Windows hosts the maintainers have not exercised |
| Unsupported combinations | WebKit historical versions; Chromium <67; Firefox <52; `--versions` with multiple engines |
| Inconclusive behavior | Failed acquisition, launch failure, geo-blocked downloads, identity mismatch, anti-bot stalls → `inconclusive`; never a pass/fail under the requested label |

## Identity verification

Every real-major check verifies the requested major against both the on-disk executable's own `--version` output and the live automation session's reported identity (`browser.version()` / WebDriver capabilities). A mismatch makes the check `inconclusive`. WebKit revision builds are compared only by engine, never against a Safari version.

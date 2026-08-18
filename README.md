<div align="center">

# browser-boundary

### Find the oldest real browser that can run your website.

[![npm version](https://img.shields.io/npm/v/browser-boundary?color=cb3837&logo=npm)](https://www.npmjs.com/package/browser-boundary)
[![CI](https://github.com/Amirhossein-Mirzaei23/browser-boundary/actions/workflows/ci.yml/badge.svg)](https://github.com/Amirhossein-Mirzaei23/browser-boundary/actions/workflows/ci.yml)
[![Node.js](https://img.shields.io/node/v/browser-boundary?logo=node.js&logoColor=white)](https://www.npmjs.com/package/browser-boundary)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Real browser binaries. Verified compatibility boundaries. No User-Agent spoofing.

[Quick start](#quick-start) · [How it works](#how-the-search-works) · [CLI reference](#cli-reference) · [Library API](#library-api)

</div>

---

Browser support should be measured, not guessed. `browser-boundary` launches your site in real browser builds, watches how it loads and renders, and finds the oldest version it can verify as passing.

Instead of returning a vague compatibility range, it reports two concrete points:

- `oldestVerifiedPassing`: the oldest version that actually passed
- `firstVerifiedFailing`: the first version that actually failed

Versions the scanner could not test remain inconclusive. They are never silently counted as passes or failures.

## Why browser-boundary?

| | browser-boundary |
| --- | --- |
| Browser identity | Launches the real binary; never changes only the User-Agent |
| Historical testing | Chromium 60 to current and Firefox 52 to current |
| Search speed | Steps through releases, then binary-searches the pass/fail gap |
| Failure signals | Navigation, JavaScript, console, network, rendering, and app readiness |
| Evidence | JSON and Markdown reports, screenshots, traces, and logs |
| Automation | CLI exit codes plus a typed TypeScript API |

## Browser coverage

| Engine | Coverage | Automation |
| --- | --- | --- |
| Chromium | Major 60 to current | Playwright/CDP with Chromium snapshots and Chrome for Testing |
| Firefox | Major 52 to current | geckodriver/WebDriver with builds from archive.mozilla.org |
| WebKit | Current Playwright build | Playwright |

> [!IMPORTANT]
> WebKit results use `versionType: "playwright-revision"`. They are not Safari version claims. Historical Safari testing requires matching macOS releases or a device-testing service.

## Quick start

### 1. Install

You need Node.js 18 or newer and Playwright 1.40 or newer.

```bash
npm install --save-dev browser-boundary playwright
npx browser-boundary install
```

The install command downloads the current Playwright browser builds. Historical Chromium and Firefox builds are downloaded only when a scan needs them, then cached under `~/.cache/browser-boundary/`.

Historical scanning uses the package's optional `@puppeteer/browsers` and `selenium-webdriver` dependencies. If your package manager omits optional dependencies, install them manually:

```bash
npm install --save-dev @puppeteer/browsers selenium-webdriver
```

### 2. Scan a site

```bash
npx browser-boundary https://example.com
```

Browser windows are visible by default, making it easy to watch each test. Hide them in CI or automated runs:

```bash
npx browser-boundary https://example.com --headless
```

The default scan checks Chromium, Firefox, and WebKit and writes its results to `./reports`.

### 3. Read the result

The terminal summary shows each engine's oldest verified pass and first verified failure. Full findings are written to `reports/compatibility.json` and `reports/compatibility.md`. Only versions shown as verified were used to determine the boundary.

Want visible proof that the tool launches real builds? Scan a page that displays its own browser version:

```bash
npx browser-boundary https://www.whatsmybrowser.org/ --engines chromium
```

## Common recipes

### Pick browser engines

```bash
npx browser-boundary https://example.com --engines chromium,firefox
```

### Run a fast current-browser check

```bash
npx browser-boundary https://example.com --strategy latest --headless
```

`--latest-only` is a shortcut for the same search mode:

```bash
npx browser-boundary https://example.com --latest-only --headless
```

### Test exact browser majors

```bash
npx browser-boundary https://example.com \
  --engines chromium \
  --versions 120,115,110
```

Use `--exact-version` when you need only one:

```bash
npx browser-boundary https://example.com \
  --engines firefox \
  --exact-version 115
```

Exact-version mode has a few deliberate constraints:

- choose exactly one engine;
- use Chromium 60 to current or Firefox 52 to current;
- provide one URL only;
- versions run sequentially in the order given;
- in headed mode, each browser stays open until you close it.

WebKit does not support exact historical versions.

### Scan several routes

```bash
npx browser-boundary https://example.com \
  --pages /,/login,/dashboard \
  --base-url https://example.com
```

The positional URL is included in the scan. `--pages` accepts relative paths and full URLs.

### Wait for real app readiness

A page loading is not always the same as an app being ready. Require one or more CSS selectors before the scan passes:

```bash
npx browser-boundary https://example.com \
  --readiness-selector '#app' \
  --readiness-selector '[data-hydrated]' \
  --readiness-mode all
```

`--readiness-mode any` passes when one selector appears. `all` requires every selector.

### Choose report formats and location

```bash
npx browser-boundary https://example.com \
  --format json,markdown \
  --output ./browser-reports
```

## How the search works

The default `binary` strategy avoids running every browser release:

```text
current version
      │
      ▼
step down by 10 majors ──────┐
      │                      │
      ▼                      │ still passing
first verified failure ◄─────┘
      │
      ▼
binary-search the remaining gap
      │
      ▼
verified pass/fail boundary
```

Change the initial interval with `--step-size 5`.

| Strategy | Behavior |
| --- | --- |
| `binary` | Step down, then binary-search the pass/fail gap. Default. |
| `step-down` | Probe releases at the configured interval. |
| `latest` | Test the current build only. |
| `explicit` | Test API-supplied versions. The CLI selects this for `--versions`. |

The scanner stays conservative throughout the search. An unavailable archive, a browser that cannot launch, or a stalled WAF produces an inconclusive result rather than a made-up boundary.

## What counts as a pass?

Each browser, version, and page combination can check:

- navigation failures, including DNS, TLS, timeouts, and crashes;
- uncaught JavaScript errors;
- console errors linked to known compatibility features;
- failed critical scripts, stylesheets, XHR, fetch, and font requests;
- rendered content and custom readiness conditions.

| Verdict | Meaning |
| --- | --- |
| `pass` | Every enabled check passed. |
| `fail` | The scan verified a compatibility failure. |
| `inconclusive` | The scan could not determine compatibility. |
| `error` | Browser or host infrastructure failed. |
| `skipped` | The search did not need to test this version. |

Feature attribution includes `high`, `medium`, `low`, or `unknown` confidence. Generic runtime errors are not automatically blamed on unsupported browser features.

## Reports and artifacts

By default, every CLI scan creates:

```text
reports/
├── compatibility.json
├── compatibility.md
└── artifacts/
    ├── screenshots/
    ├── traces/
    └── logs/
```

Reports may contain tested URLs, failed request URLs, console messages, and errors from the target site. Review them before sharing.

## CLI reference

```text
browser-boundary <url> [options]
```

| Option | Description |
| --- | --- |
| `--engines <list>` | Comma-separated `chromium`, `firefox`, and `webkit`. Default: all. |
| `--pages <list>` | Additional comma-separated paths or URLs. |
| `--base-url <url>` | Base URL for relative `--pages` values. |
| `--strategy <name>` | `binary`, `step-down`, or `latest`. |
| `--versions <list>` | Exact major versions; requires one engine. |
| `--exact-version <major>` | Alias for one exact major version. |
| `--latest-only` | Test current builds only. |
| `--headless` | Hide browser windows. Browsers are headed by default. |
| `--step-size <number>` | Major-version interval before binary search. Default: `10`. |
| `--timeout <ms>` | Per-page navigation/readiness timeout. Default: `30000`. |
| `--wait-until <event>` | `domcontentloaded` or `load`. Default: `domcontentloaded`. |
| `--http-cache` | Enable HTTP cache. It is disabled by default for scan accuracy. |
| `--hold-open <seconds>` | Keep a headed browser open after checks. Default: `2`. |
| `--readiness-selector <css>` | Required CSS selector. May be repeated. |
| `--readiness-mode <mode>` | `any` or `all`. Default: `any`. |
| `--min-confidence <level>` | Minimum confidence that can cause failure. Default: `low`. |
| `--format <list>` | `json`, `markdown`, or both. Default: both. |
| `-o, --output <dir>` | Report directory. Default: `./reports`. |
| `-v, --version` | Print the installed version. |
| `-h, --help` | Show CLI help. |

```bash
npx browser-boundary --help
npx browser-boundary --version
```

### Exit codes

| Code | Meaning |
| ---: | --- |
| `0` | Scan completed without a verified compatibility failure. |
| `1` | At least one verified compatibility failure was found. |
| `2` | Configuration is invalid. |
| `3` | Browser or host infrastructure failed. |

## Library API

The package exports a typed API for custom runners and test pipelines.

```ts
import { scan, writeJson, writeMarkdown } from 'browser-boundary';

const result = await scan(
  {
    urls: [
      'https://example.com',
      {
        url: 'https://example.com/dashboard',
        label: 'dashboard',
        readiness: {
          selectors: ['#app', '[data-hydrated]'],
          mode: 'all',
        },
      },
    ],
    engines: ['chromium', 'firefox'],
    search: {
      strategy: 'binary',
      stepSize: 10,
      floor: { chromium: 80, firefox: 78 },
    },
    headed: false,
    network: {
      ignoredPatterns: [/google-analytics\.com/i],
    },
  },
  {
    onProgress: console.log,
  },
);

for (const summary of result.summaries) {
  console.log(summary.engine, summary.resultLine);
}

writeJson(result, './reports');
writeMarkdown(result, './reports');
```

`scan()` returns a `ScanResult`; it does not write summary reports automatically. Failure artifacts are created during checks under the configured output directory.

### Custom readiness function

Each page can define its own readiness logic:

```ts
import { scan } from 'browser-boundary';

const result = await scan({
  urls: [
    {
      url: 'https://example.com/dashboard',
      readiness: async ({ page }) => {
        await page.waitForSelector('[data-dashboard-ready]');
        return true;
      },
    },
  ],
  engines: ['chromium'],
  search: { strategy: 'latest' },
});
```

### Exact versions through the API

```ts
import { scan } from 'browser-boundary';

const result = await scan({
  urls: ['https://example.com'],
  engines: ['chromium'],
  search: {
    strategy: 'explicit',
    explicitVersions: {
      chromium: ['120', '115', '110'],
    },
  },
  headed: false,
});
```

### Main configuration

| Field | Type | Purpose |
| --- | --- | --- |
| `urls` | `(string \| PageSpec)[]` | Pages to scan. Required. |
| `engines` | `EngineName[]` | Engines to include. Default: all. |
| `search.strategy` | `binary \| step-down \| latest \| explicit` | Version search method. |
| `search.stepSize` | `number` | Initial major-version interval. |
| `search.floor` | `Partial<Record<EngineName, number>>` | Lowest major to consider per engine. |
| `search.explicitVersions` | `Partial<Record<EngineName, string[]>>` | Versions for explicit mode. |
| `checks` | `object` | Enable or disable individual compatibility checks. |
| `readiness` | `ReadinessSpec` | Default selector-based readiness rule. |
| `network.ignoredPatterns` | `(RegExp \| string)[]` | Non-fatal request URL patterns. |
| `network.criticalResourceTypes` | `ResourceType[]` | Resource failures that should be fatal. |
| `analysis.minConfidence` | `Confidence` | Lowest attribution confidence that can fail. |
| `timeout` | `number` | Navigation/readiness timeout in milliseconds. |
| `headed` | `boolean` | Show browser windows. Default: `true`. |
| `retries` | `number` | Retries for transient failures. Default: `3`. |
| `viewport` | `{ width, height }` | Browser viewport. |
| `waitUntil` | `domcontentloaded \| load` | Navigation load state. |
| `disableHttpCache` | `boolean` | Disable browser cache. Default: `true`. |
| `holdOpenSec` | `number` | Delay before closing a headed browser. |
| `output.directory` | `string` | Artifact directory. |
| `cache.directory` | `string` | Historical binary cache directory. |

The package also exports result types, browser-provider interfaces, report renderers, compatibility analysis helpers, and low-level search/check functions. See the generated TypeScript declarations for the complete API.

## CI example

Current-browser checks are a practical fast gate for pull requests:

```yaml
- name: Install browser-boundary
  run: |
    npm install --save-dev browser-boundary playwright
    npx browser-boundary install

- name: Check browser compatibility
  run: >
    npx browser-boundary https://staging.example.com
    --strategy latest
    --headless
    --output ./browser-reports
```

Use a historical boundary scan on a schedule or before releases when downloading multiple browser builds would make every pull request too slow.

## Limitations

- Historical browser archives are incomplete. Missing versions remain inconclusive.
- Old binaries may not start on modern Linux because of sandbox, ABI, or system-library differences.
- Firefox below 52 cannot be driven through the supported geckodriver path.
- WebKit is current-only and does not map to a Safari major version.
- Anti-bot systems and WAFs can prevent a result even when the browser is compatible.
- A pass covers the configured pages and checks, not every route or feature in the site.

Only scan websites you own or are authorized to test.

## Development

```bash
git clone https://github.com/Amirhossein-Mirzaei23/browser-boundary.git
cd browser-boundary
npm install
npm run test
npm run typecheck
npm run build
npm run test:fixtures
npm run pack-check
```

The codebase is split into browser providers, automation controllers, compatibility checks, version search, and report generation. Keep site-specific selectors and workarounds in caller configuration or examples rather than the core package.

## License

[MIT](LICENSE) © Amirhossein Mirzaei
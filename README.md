# browser-boundary

Find the oldest real browser version that can run your website.

`browser-boundary` opens your site in real browser builds, checks whether it loads and renders correctly, and reports the oldest version it verified as passing alongside the first version it verified as failing. It does not spoof the User-Agent.

## What it tests

| Engine | Historical coverage | Driver |
| --- | --- | --- |
| Chromium | Major 60 to current | Playwright/CDP with Chromium snapshots and Chrome for Testing |
| Firefox | Major 52 to current | geckodriver/WebDriver with builds from archive.mozilla.org |
| WebKit | Current Playwright build only | Playwright |

WebKit results use `versionType: "playwright-revision"`. They are not Safari version claims. Testing historical Safari requires matching macOS versions or a device-testing service.

## Install

Requirements:

- Node.js 18 or newer
- Playwright 1.40 or newer

```bash
npm install --save-dev browser-boundary playwright
npx browser-boundary install
```

The install command downloads the current Playwright Chromium, Firefox, and WebKit builds. Historical Chromium and Firefox builds are downloaded only when a scan needs them and cached under `~/.cache/browser-boundary/`.

Historical scans also use these packages:

```bash
npm install --save-dev @puppeteer/browsers selenium-webdriver
```

`@puppeteer/browsers` is required for historical Chromium scans. `selenium-webdriver` is required for historical Firefox scans. They are declared as optional dependencies, but if your package manager omits optional packages you must install them before running a historical scan. Neither is needed for `--strategy latest`.

## Quick start

Run the default boundary search across Chromium, Firefox, and WebKit:

```bash
npx browser-boundary https://example.com
```

Browsers are visible by default. Use `--headless` in CI or when you do not need to inspect them:

```bash
npx browser-boundary https://example.com --headless
```

To confirm that real builds are being launched, scan a page that displays its browser version:

```bash
npx browser-boundary https://www.whatsmybrowser.org/ --engines chromium
```

The CLI writes `compatibility.json`, `compatibility.md`, and failure artifacts to `./reports` by default.

## Common commands

### Scan selected engines

```bash
npx browser-boundary https://example.com --engines chromium,firefox
```

### Test only current browser builds

```bash
npx browser-boundary https://example.com --strategy latest --headless
```

`--latest-only` is a shortcut for the same search mode:

```bash
npx browser-boundary https://example.com --latest-only --headless
```

### Test exact major versions

```bash
npx browser-boundary https://example.com \
  --engines chromium \
  --versions 120,115,110
```

Exact-version mode:

- requires exactly one engine;
- supports Chromium 60 to current and Firefox 52 to current;
- does not support WebKit versions;
- accepts one URL only;
- tests versions sequentially in the order provided;
- keeps each browser open until you close it when running headed.

For one version, `--exact-version` is an alias:

```bash
npx browser-boundary https://example.com \
  --engines firefox \
  --exact-version 115
```

### Scan several pages

```bash
npx browser-boundary https://example.com \
  --pages /,/login,/dashboard \
  --base-url https://example.com
```

A positional URL is included in the scan. Values passed to `--pages` may be relative paths or full URLs.

### Require rendered content

Repeat `--readiness-selector` to provide more than one selector:

```bash
npx browser-boundary https://example.com \
  --readiness-selector '#app' \
  --readiness-selector '[data-hydrated]' \
  --readiness-mode all
```

`--readiness-mode any` passes when one selector appears. `all` requires every selector.

### Choose reports and output directory

```bash
npx browser-boundary https://example.com \
  --format json,markdown \
  --output ./browser-reports
```

### Show all CLI options

```bash
npx browser-boundary --help
npx browser-boundary --version
```

## How boundary search works

The default `binary` strategy does not run every historical version:

1. Test the current browser.
2. Step down by 10 major versions at a time until a failure is found.
3. Binary-search the remaining gap.
4. Report only versions that were actually verified.

Change the initial interval with `--step-size`:

```bash
npx browser-boundary https://example.com --step-size 5
```

Available strategies:

| Strategy | Behavior |
| --- | --- |
| `binary` | Step down, then binary-search the pass/fail gap. This is the default. |
| `step-down` | Probe versions at the configured step interval. |
| `latest` | Test the current build only. |
| `explicit` | Test versions supplied through the API. The CLI selects this automatically for `--versions`. |

The result is intentionally conservative. `oldestVerifiedPassing` means that exact version passed. `firstVerifiedFailing` means that exact version failed. Untested or unavailable versions are not silently treated as passing or failing.

## What counts as a pass

Each browser/version/page combination can check:

- navigation, including DNS, TLS, timeout, and browser crashes;
- uncaught JavaScript errors;
- console errors that map to known compatibility features;
- failed app-critical script, stylesheet, XHR, fetch, and font requests;
- rendering and readiness selectors or predicates.

Verdicts are kept separate:

| Verdict | Meaning |
| --- | --- |
| `pass` | All enabled checks passed. |
| `fail` | A compatibility failure was verified. |
| `inconclusive` | Compatibility could not be determined, such as when a binary is unavailable or a WAF stalls navigation. |
| `error` | Browser or host infrastructure failed. |
| `skipped` | The search algorithm did not need to test the version. |

Feature attribution also carries `high`, `medium`, `low`, or `unknown` confidence. Generic runtime errors are not automatically blamed on missing browser features.

## CLI options

| Option | Description |
| --- | --- |
| `--engines <list>` | Comma-separated `chromium`, `firefox`, and `webkit`. Default: all. |
| `--pages <list>` | Additional comma-separated paths or URLs. |
| `--base-url <url>` | Base URL for relative `--pages` values. |
| `--strategy <name>` | `binary`, `step-down`, or `latest`. The CLI selects `explicit` when `--versions` is used. |
| `--versions <list>` | Exact major versions; requires one explicit engine. |
| `--exact-version <major>` | Alias for one exact version. |
| `--latest-only` | Test current builds only. |
| `--headless` | Hide browser windows. Browsers are headed by default. |
| `--step-size <number>` | Major-version interval before binary search. Default: `10`. |
| `--timeout <ms>` | Per-page navigation/readiness timeout. Default: `30000`. |
| `--wait-until <event>` | `domcontentloaded` or `load`. Default: `domcontentloaded`. |
| `--http-cache` | Enable the browser HTTP cache. It is disabled by default for scan accuracy. |
| `--hold-open <seconds>` | Keep a headed browser open after checks. Default: `2`. |
| `--readiness-selector <css>` | Required CSS selector. May be repeated. |
| `--readiness-mode <mode>` | `any` or `all`. Default: `any`. |
| `--min-confidence <level>` | Minimum feature confidence that can cause failure: `high`, `medium`, `low`, or `unknown`. Default: `low`. |
| `--format <list>` | `json`, `markdown`, or both. Default: both. |
| `-o, --output <dir>` | Report directory. Default: `./reports`. |
| `-v, --version` | Print the installed version. |
| `-h, --help` | Print CLI help. |

## Library API

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

`scan()` returns a `ScanResult`; it does not write the JSON or Markdown summary automatically. The CLI writes both by default. Failure screenshots, traces, and logs are generated during checks under the configured output directory.

### Custom readiness function

A page can override the top-level readiness rule:

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

### Main configuration fields

```ts
interface ScanConfig {
  urls: (string | PageSpec)[];
  engines?: ('chromium' | 'firefox' | 'webkit')[];
  siteName?: string;

  search?: {
    strategy?: 'binary' | 'step-down' | 'latest' | 'explicit';
    stepSize?: number;
    floor?: Partial<Record<EngineName, number>>;
    explicitVersions?: Partial<Record<EngineName, string[]>>;
  };

  readiness?: {
    selectors: string[];
    mode?: 'any' | 'all';
  };

  checks?: {
    navigation?: boolean;
    javascript?: boolean;
    console?: boolean;
    network?: boolean;
    rendering?: boolean;
    readiness?: boolean;
  };

  network?: {
    ignoredPatterns?: (RegExp | string)[];
    criticalResourceTypes?: ResourceType[];
  };

  analysis?: {
    minConfidence?: 'high' | 'medium' | 'low' | 'unknown';
  };

  timeout?: number;
  headed?: boolean;
  retries?: number;
  viewport?: { width: number; height: number };
  waitUntil?: 'domcontentloaded' | 'load';
  disableHttpCache?: boolean;
  holdOpenSec?: number;

  output?: {
    format?: ('json' | 'markdown')[];
    directory?: string;
  };

  cache?: {
    directory?: string;
  };
}
```

See the exported TypeScript declarations for `PageSpec`, hooks, custom providers, progress events, and result types.

## Reports and artifacts

The default report directory contains:

```text
reports/
├── compatibility.json
├── compatibility.md
└── artifacts/
    ├── screenshots/
    ├── traces/
    └── logs/
```

Reports can include target URLs, request URLs, console output, and errors from the tested site. Review them before sharing.

## CI

Use headless mode and usually test current builds for a fast compatibility gate:

```bash
npx browser-boundary https://staging.example.com \
  --strategy latest \
  --headless \
  --output ./browser-reports
```

Exit codes:

| Code | Meaning |
| --- | --- |
| `0` | Scan completed without a verified compatibility failure. |
| `1` | At least one verified compatibility failure was found. |
| `2` | Configuration is invalid. |
| `3` | Browser or host infrastructure failed. |

## Limitations

- Historical browser archives are incomplete. An unavailable version is reported as inconclusive rather than replaced with a different build.
- Old binaries may not start on modern Linux because of sandbox, ABI, or system-library incompatibilities.
- Firefox below 52 cannot be driven by the supported geckodriver path.
- WebKit is current-only and must not be interpreted as a Safari major version.
- Anti-bot and WAF behavior can prevent a result even when the site supports the browser.
- A passing scan verifies the configured pages and checks, not every route or feature in the application.

Only scan sites you own or are authorized to test.

## Development

```bash
npm install
npm run test
npm run typecheck
npm run build
npm run test:fixtures
npm run pack-check
```

The source is split into browser providers, automation controllers, compatibility checks, boundary search, and report generation. Site-specific selectors and workarounds belong in caller configuration or examples, not in the core.

## License

MIT © Amirhossein Mirzaei

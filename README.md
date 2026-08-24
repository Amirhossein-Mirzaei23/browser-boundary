<div align="center">

# browser-boundary

### Find the oldest real browser that can run your website.

[![npm version](https://img.shields.io/npm/v/browser-boundary?color=cb3837&logo=npm)](https://www.npmjs.com/package/browser-boundary)
[![CI](https://github.com/Amirhossein-Mirzaei23/browser-boundary/actions/workflows/ci.yml/badge.svg)](https://github.com/Amirhossein-Mirzaei23/browser-boundary/actions/workflows/ci.yml)
[![Node.js](https://img.shields.io/node/v/browser-boundary?logo=node.js&logoColor=white)](https://www.npmjs.com/package/browser-boundary)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Real browser binaries. Verified compatibility boundaries. No User-Agent spoofing.

[Quick start](#quick-start) · [How it works](#how-the-search-works) · [CLI reference](#cli-reference) · [Library API](#library-api) · [FAQ](#troubleshooting-and-faq)

</div>

---

Browser support should be measured, not guessed. `browser-boundary` launches your site in real browser builds, watches how it loads and renders, and finds the oldest version it can verify as passing.

Instead of returning a vague compatibility range, it reports two concrete points:

- `oldestVerifiedPassing`: the oldest version that actually passed
- `firstVerifiedFailing`: the first version that actually failed

Versions the scanner could not test remain inconclusive. They are never silently counted as passes or failures.

**Why this matters:** a support policy may claim "works on Chrome 90+," while a real scan can verify that Chrome 96 passes and Chrome 95 fails on the routes that matter to your application.

## Why browser-boundary?

| Aspect | browser-boundary |
| --- | --- |
| Browser identity | Launches the real binary; never changes only the User-Agent |
| Historical testing | Tests Chromium 67 to current and Firefox 52 to current |
| Search speed | Steps through releases, then binary-searches the pass/fail gap |
| Failure signals | Navigation, JavaScript, console, network, rendering, and app readiness |
| Evidence | JSON and Markdown reports, screenshots, traces, and logs |
| Automation | CLI exit codes plus a typed TypeScript API |

## Comparison to alternatives

BrowserStack and Sauce Labs provide broad cloud coverage across real devices, operating systems, and Safari releases. Use them when device coverage, hosted infrastructure, or cross-platform manual testing matters. `browser-boundary` is a focused, local or CI-friendly tool for finding a verified pass/fail boundary across browser versions you can launch from your own runner.

Browserslist and Can I Use answer a different question. They use declared targets and static feature-support data; they do not load your deployed application, exercise its routes, or observe its runtime failures. `browser-boundary` complements them by turning an expected support range into evidence from real execution.

## Browser coverage

| Engine | Coverage | Automation |
| --- | --- | --- |
| Chromium | Major 67 to current | WebDriver for historical Chromium snapshots; Playwright for current Chrome for Testing |
| Firefox | Major 52 to current | geckodriver/WebDriver with builds from archive.mozilla.org |
| WebKit | Current Playwright build | Playwright |

> [!IMPORTANT]
> WebKit results use `versionType: "playwright-revision"`. They are not Safari version claims. Historical Safari testing requires matching macOS releases or a device-testing service.

### Android WebView compatibility profiles

For a complete usage guide covering the CLI, TypeScript API, detection model,
version semantics, compatibility states, limitations, and future real-device
execution, see [ANDROID_WEBVIEW.md](./ANDROID_WEBVIEW.md).

Android WebView support is currently **identification and compatibility
modeling**, not browser execution. Android WebView is a runtime built on
Chromium/Blink; it is not a fourth rendering engine and it is not equivalent to
desktop Chrome.

Inspect a User-Agent without launching a browser:

```bash
browser-boundary identify \
  --user-agent "Mozilla/5.0 (Linux; Android 10; K; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/140.0.0.0 Mobile Safari/537.36" \
  --format json
```

Canonical default WebView User-Agents include the `wv` marker. The
`Chrome/140...` token supplies the observed Chromium/WebView build; the
`Version/4.0` token is a compatibility marker and is **not** WebView version 4.
Applications can replace their WebView User-Agent, so UA identification is
evidence with a confidence level, not authoritative attestation. Reduced
default UAs preserve the major but may expose `0.0.0` for lower components.
Identification has no arbitrary version floor. Direct WebView/Chromium/Blink
major mapping is used for modern version-numbered releases. Legacy Android 4.4
WebView is modeled specially: its runtime release is `4.4`, while the UA's
Chrome token supplies a separate Chromium/Blink milestone (for example 33).
Conflicting major-version evidence produces `unknown` compatibility rather than
a compatibility claim.

The TypeScript API keeps the layers separate:

```ts
import {
  createAndroidWebViewProfile,
  evaluateAndroidWebViewFeature,
} from 'browser-boundary';

const profile = createAndroidWebViewProfile({
  userAgent: process.env.WEBVIEW_USER_AGENT,
  // When an Android host can provide it, this is stronger version evidence:
  nativePackageVersion: process.env.WEBVIEW_PACKAGE_VERSION,
});

const result = evaluateAndroidWebViewFeature(profile, 'Optional chaining (?.)');
```

When a WebView major meets an existing Chromium threshold, the result is
`engine-compatible`: the shared Blink baseline is compatible. This does **not**
guarantee WebView runtime compatibility. Host `WebSettings`, Android
permissions, OEM/provider changes, native/AndroidX APIs, and WebView-specific
behavior remain separate constraints. Use feature detection inside the app when
possible.

`android-webview` is intentionally not accepted by `--engines`: the current
scanner cannot launch a real Android WebView. Running desktop Chromium with the
same major would not prove that Android WebView works. Real execution is future
work requiring an Android device/emulator, host APK, WebView provider/version
verification, ADB/Appium or WebView-debugging integration, and Android-specific
lifecycle management.

## Quick start

### 1. Install

You need Node.js 18 or newer and Playwright 1.40 or newer.

For local and manual use, install the CLI globally and download the current browser builds:

```bash
npm install -g browser-boundary playwright
browser-boundary install
```

If you do not want a global install, use `npx` instead:

```bash
npx browser-boundary install
npx browser-boundary https://www.whatsmybrowser.org/
```

For CI/CD or projects that need pinned dependency versions, install locally as development dependencies:

```bash
npm install --save-dev browser-boundary playwright
npx browser-boundary install
```

The install command downloads the current Playwright browser builds. Historical Chromium and Firefox builds are downloaded only when a scan needs them, then cached under `~/.cache/browser-boundary/`.

> [!IMPORTANT]
> `browser-boundary install` downloads Chromium, Firefox, and WebKit. Expect several hundred megabytes of downloads and allow a few minutes on a cold CI runner or slow connection. The exact size and time depend on the Playwright release, platform, and network. Historical scans download additional builds as needed, so cache the Playwright browser directory and `~/.cache/browser-boundary/` in CI when practical.

Historical scanning uses the package's optional `@puppeteer/browsers` and `selenium-webdriver` dependencies. If your package manager omits optional dependencies, install them manually:

```bash
npm install --save-dev @puppeteer/browsers selenium-webdriver
```

### 2. Scan a site

```bash
browser-boundary https://www.whatsmybrowser.org/
```

With the alternative non-global workflow, prefix the command with `npx`: `npx browser-boundary https://www.whatsmybrowser.org/`.

For a quick historical Chromium check that visibly reports the detected browser,
run the oldest supported Chromium major:

```bash
browser-boundary https://www.whatsmybrowser.org/ \
  --engines chromium \
  --versions 67
```

Browser windows are visible by default, making it easy to watch each test. Hide them in CI or automated runs:

```bash
browser-boundary https://www.whatsmybrowser.org/ --headless
```

The default scan checks Chromium, Firefox, and WebKit and writes its results to `./reports`.

### 3. Read the result

The terminal summary shows each engine's oldest verified pass and first verified failure. Full findings are written to `reports/compatibility.json` and `reports/compatibility.md`. Only versions shown as verified were used to determine the boundary.

An illustrative terminal summary looks like this:

```text
Summary
-------
  engine     oldestVerifiedPassing  firstVerifiedFailing
  chromium   109                    108
  firefox    102                    101
  webkit     pw-1234                n/a
```

The generated `compatibility.md` records the same boundary with the evidence attached:

```markdown
## Chromium

- Latest tested: **124**
- Oldest verified passing: **109**
- First verified failing: **108**
- Boundary confidence: **high**

**Result:**

- verified PASS >= 109; verified FAIL at 108
```

These values are illustrative, not claims about `www.whatsmybrowser.org`. Your results depend on the target pages, enabled checks, available binaries, and host environment.

<!-- TODO: add terminal recording/screenshot -->

Want visible proof that the tool launches real builds? Scan a page that displays its own browser version:

```bash
browser-boundary https://www.whatsmybrowser.org/ --engines chromium
```

## Common recipes

### Pick browser engines

```bash
browser-boundary https://www.whatsmybrowser.org/ --engines chromium,firefox
```

### Run a fast current-browser check

```bash
browser-boundary https://www.whatsmybrowser.org/ --strategy latest --headless
```

`--latest-only` is a shortcut for the same search mode:

```bash
browser-boundary https://www.whatsmybrowser.org/ --latest-only --headless
```

### Test exact browser majors

```bash
browser-boundary https://www.whatsmybrowser.org/ \
  --engines chromium \
  --versions 120,115,110
```

Historical Chromium snapshots use a matching snapshot ChromeDriver by default:

```bash
browser-boundary https://www.whatsmybrowser.org/ --engines chromium --versions 83 \
  --chromium-controller auto
```

Use `--chromium-controller playwright` only for diagnosis; modern Playwright may
send CDP commands that old Chromium does not implement. `webdriver` forces the
matching-driver path for snapshot-era Chromium (60–112) and is rejected for
current/Chrome-for-Testing builds. The launched browser's runtime major is
verified before a result is attributed to the requested version.

Use `--exact-version` when you need only one:

```bash
browser-boundary https://www.whatsmybrowser.org/ \
  --engines firefox \
  --exact-version 115
```

Exact-version mode has a few deliberate constraints:

- choose exactly one engine;
- use Chromium 67 to current or Firefox 52 to current;
- provide one URL only;
- versions run sequentially in the order given;
- in headed mode, each browser stays open until you close it.

WebKit does not support exact historical versions.

### Scan several routes

```bash
browser-boundary https://www.whatsmybrowser.org/ \
  --pages /,/login,/dashboard \
  --base-url https://www.whatsmybrowser.org/
```

The positional URL is included in the scan. `--pages` accepts relative paths and full URLs.

### Wait for real app readiness

A page loading is not always the same as an app being ready. Require one or more CSS selectors before the scan passes:

```bash
browser-boundary https://www.whatsmybrowser.org/ \
  --readiness-selector '#app' \
  --readiness-selector '[data-hydrated]' \
  --readiness-mode all
```

`--readiness-mode any` passes when one selector appears. `all` requires every selector.

### Choose report formats and location

```bash
browser-boundary https://www.whatsmybrowser.org/ \
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
| `identify --user-agent <ua>` | Identify/model an Android WebView UA without launching it. |
| `--format text\|json` with `identify` | Select human-readable or JSON identification output. |
| `--pages <list>` | Additional comma-separated paths or URLs. |
| `--base-url <url>` | Base URL for relative `--pages` values. |
| `--strategy <name>` | `binary`, `step-down`, or `latest`. |
| `--versions <list>` | Exact major versions; requires one engine. |
| `--exact-version <major>` | Alias for one exact major version. |
| `--latest-only` | Test current builds only. |
| `--headless` | Hide browser windows. Browsers are headed by default. |
| `--chromium-controller <mode>` | `auto`, `playwright`, or `webdriver`. Default: `auto`; historical snapshots use matching ChromeDriver. |
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
browser-boundary --help
browser-boundary --version
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
      'https://www.whatsmybrowser.org/',
      {
        url: 'https://your-app.test/dashboard',
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
      url: 'https://your-app.test/dashboard',
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
  urls: ['https://www.whatsmybrowser.org/'],
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

Current-browser checks are a practical fast gate for pull requests. CI uses the pinned per-project install described above, so invoke its local CLI with `npx`:

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

### Sandboxing and containers

You do not need root or a privileged container to run a scan. Chromium launches with `--no-sandbox` and `--disable-dev-shm-usage` for compatibility with common CI containers. Because disabling Chromium's sandbox reduces process isolation, run scans in an isolated, short-lived CI worker and avoid exposing secrets to the browser process.

Install browser system libraries during image construction rather than elevating the test job at runtime:

```dockerfile
FROM node:20-bookworm

WORKDIR /app
COPY package*.json ./
RUN npm ci \
  && npx playwright install-deps \
  && npx browser-boundary install
```

Pin the image and Playwright/package versions for repeatable current-browser runs. Historical binaries may still require libraries or ABI versions absent from a modern base image. If one cannot launch, use a compatible older image or VM for that range, or leave the result inconclusive. Do not grant `--privileged` merely to turn an infrastructure error into a compatibility verdict.

## Troubleshooting and FAQ

### Why does an old browser fail to launch on modern Linux?

Historical binaries were built against the libraries and kernels available when they shipped. A current Linux runner may have incompatible glibc/GTK/NSS libraries, a different sandbox setup, or no virtual display for headed mode.

Try these in order:

1. Run with `--headless` on CI.
2. Install Playwright's system dependencies with `sudo npx playwright install-deps` on a disposable runner, or run that command as root while building a container image.
3. Check the reported executable directly with `ldd <executable-path>` for missing shared libraries.
4. Test the affected version in a container or VM whose Linux generation is closer to the browser release.
5. If the host cannot launch that binary reliably, keep the result inconclusive rather than treating it as a website failure.

Chromium already receives `--no-sandbox` and `--disable-dev-shm-usage`. Firefox historical builds use geckodriver and may have different library requirements. There is no single modern Linux image that can reliably launch every historical release.

Chromium snapshot scans download both `chrome-linux.zip` and the matching
`chromedriver_linux64.zip` on the first successful run. Later runs reuse a
validated manifest without contacting the bucket. Old manifests whose binary
reports a different major are ignored rather than producing a mislabeled result.

For Chromium 62–74, snapshot revisions may not publish a usable same-revision
driver. In that range browser-boundary falls back to an audited legacy
ChromeDriver compatibility matrix and uses the legacy JSON Wire session format
required by pre-75 drivers. A minimal legacy Fontconfig file is also supplied so
old Chromium can use installed fonts without parsing newer Fontconfig syntax.
The official archive is tried first; the npm mirror
is used when Google storage is geo-blocked. Some very old Chromium binaries may
still require obsolete host libraries such as `libgconf-2.so.4`; those versions
remain inconclusive on modern hosts unless run in a compatible older container
or VM.

### What should I do when many versions are inconclusive?

Read each result's `reason` in `compatibility.json` and check `reports/artifacts/` before changing the search range. A cluster of download or launch errors usually points to the runner; repeated navigation stalls may point to DNS, TLS, authentication, a WAF, or an unavailable test environment.

- Run `--strategy latest` first to verify the current browser and target site work on the same runner.
- Narrow the problem to one engine with `--engines chromium` or `--engines firefox`.
- Probe a few known majors with `--versions` instead of repeating a full boundary search.
- Increase `--timeout` when the page is slow, and add readiness selectors that identify actual app hydration.
- Confirm optional dependencies are installed for historical scans.
- Move the scan to a compatible runner when the reason is a missing library or browser launch failure.

Inconclusive versions do not establish either side of the boundary. Do not convert them to passes or failures in downstream automation.

### How large can `~/.cache/browser-boundary/` become?

Each historical browser build can consume hundreds of megabytes after extraction. A wide scan or several projects can grow the cache to multiple gigabytes. Check its current size with:

```bash
du -sh ~/.cache/browser-boundary/
```

The cache is disposable. Remove it when you need the space; later scans will download required builds again:

```bash
rm -rf ~/.cache/browser-boundary/
```

Do not clear the cache while a scan is running. In CI, use a cache key that includes the operating system, architecture, package version, and Playwright version to avoid restoring incompatible binaries.

### Does browser-boundary replace device-cloud testing?

No. It finds verified boundaries on the engines and host environments it can launch. Use BrowserStack, Sauce Labs, or physical devices for mobile hardware, operating-system integration, and historical Safari coverage.

## Limitations

- Historical browser archives are incomplete. Missing versions remain inconclusive.
- Chromium snapshot and matching-driver archives are best-effort; missing, pruned, or geo-blocked artifacts remain inconclusive.
- Old binaries may not start on modern Linux because of sandbox, ABI, or system-library differences.
- Firefox below 52 cannot be driven through the supported geckodriver path.
- WebKit is current-only and does not map to a Safari major version.
- Android WebView support is detection/modeling only; no Android WebView binary, APK, emulator, or device is launched.
- Chrome/Blink feature compatibility is a baseline, not proof of WebView-specific runtime behavior.
- Custom WebView User-Agents can cause false negatives, and spoofed WebView markers can cause false positives.
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

## Contributing

Bug reports and focused pull requests are welcome. Before opening a PR:

1. Create a branch from `main` and keep the change scoped to one problem.
2. Add or update tests for behavior changes. Documentation-only changes do not need synthetic tests.
3. Match the existing TypeScript style and keep site-specific rules out of the core scanner.
4. Run the same checks used by CI:

```bash
npm run test
npm run typecheck
npm run build
npm run pack-check
```

Run `npm run test:fixtures` when changing browser controllers, detection, readiness, or report behavior. In the PR description, explain the problem, the chosen approach, and how you verified it. Do not commit generated reports, downloaded browser binaries, caches, or credentials.

## License

[MIT](LICENSE) © Amirhossein Mirzaei
# browser-boundary

> Find the oldest browser version your website can actually run on.

Current release: **1.4.0**

`browser-boundary` is a **browser compatibility boundary detector** for real websites. It answers:

> What is the oldest real browser version that can successfully run this website?

It tests **Chromium**, **Firefox**, and **WebKit** using **real historical browser binaries** (Chrome-for-Testing driven by Playwright/CDP; Firefox from archive.mozilla.org driven by geckodriver/WebDriver) — it never fakes versions by changing the User-Agent.

## Try it on https://www.whatsmybrowser.org/

A great first test: [whatsmybrowser.org](https://www.whatsmybrowser.org/) renders the **actual** browser version, engine, and user-agent of whatever loads it. Point the tool at it and watch the reported version step down as the scan probes older binaries — visible proof that this tool runs *real historical browser builds*, not a faked User-Agent string:

```bash
npx mrz-browser-compat https://www.whatsmybrowser.org/ --headed
```

The page it loads literally tells you which Chrome/Firefox opened it. If the version you see on screen matches the version the scan is probing, the binary is genuine.

## What it is (and isn't)

- **It is** a tool that finds the verified compatibility *boundary* per browser engine: "oldest verified passing version" and "first verified failing version."
- **It is not** a Playwright alternative or a general browser-automation framework. It uses Playwright under the hood to drive real browsers.

## Why it's different from normal browser testing

Normal Playwright tests check that *your current browser* behaves correctly. This tool asks the inverse: given your site as-is, **which historical browser versions can still run it?** That reveals which ES/Web features your build is implicitly requiring, and gives you a data-backed Browserslist target — useful for deciding when it's safe to drop old-browser support.

## Installation

```bash
npm install -D browser-boundary
```

Playwright is a **peer dependency** — install browsers once:

```bash
npx browser-boundary install
# equivalent to: npx playwright install chromium firefox webkit
```

> Historical Chrome/Firefox binaries are downloaded **on demand at scan time**, never during `npm install`. `@puppeteer/browsers` is an optional dependency used only for historical Chrome.

`--versions` tests one exact major or a comma-separated list. It requires exactly
one engine via `--engines`. Supported ranges are Chromium 60–current and Firefox
52–current. WebKit supports only the current Playwright build, so specific WebKit
versions cannot be requested. `--exact-version` is an alias for a single version.
In headed mode, each requested browser stays open until you close its tab/window;
only then does the next requested version open. The `--hold-open` timer is ignored
for headed specific-version scans. Headless scans still close automatically.
Specific-version mode currently accepts exactly one URL; combining it with
multiple `--pages` is rejected so closing a browser always advances directly to
the next requested version.

## CLI usage

```bash
npx browser-boundary https://example.com
npx browser-boundary https://example.com --engines chromium,firefox
npx browser-boundary https://example.com --pages /,/dashboard --base-url https://example.com
npx browser-boundary https://example.com --strategy binary      # default: step-down + binary search
npx browser-boundary https://example.com --strategy latest      # probe current build only
npx browser-boundary https://example.com --engines chromium --versions 120
npx browser-boundary https://example.com --engines firefox --versions 120,115,110
npx browser-boundary https://example.com --latest-only
npx browser-boundary https://example.com --headed
npx browser-boundary https://example.com --headed --hold-open 8          # keep window open 8s after checks
npx browser-boundary https://example.com --format json --output ./reports
npx browser-boundary https://example.com --readiness-selector main --readiness-mode any
npx browser-boundary https://example.com --min-confidence high
npx browser-boundary https://example.com --wait-until load               # wait for full page load (default: domcontentloaded)
npx browser-boundary https://example.com --http-cache                   # re-enable browser cache (disabled by default for accuracy)
npx browser-boundary --help
```

Environment variables (`MRZ_*`, with legacy `BC_*` aliases) are also supported; flags take precedence.

## Library usage

```ts
import { scan } from 'browser-boundary';

const result = await scan({
  urls: ['https://example.com', 'https://example.com/about'],
  engines: ['chromium', 'firefox', 'webkit'],
  search: { strategy: 'binary', stepSize: 10 },
  readiness: { selectors: ['main'], mode: 'any' },
  network: { ignoredPatterns: [/google-analytics/, /googletagmanager/] },
  output: { format: ['json', 'markdown'], directory: './reports' },
});

for (const s of result.summaries) {
  console.log(`${s.engine}: ${s.resultLine} (confidence: ${s.boundaryConfidence})`);
}
```

Per-URL readiness (selector or custom function):

```ts
await scan({
  urls: [
    { url: 'https://app.com', readiness: { selectors: ['#app', '[data-hydrated]'], mode: 'all' } },
    { url: 'https://app.com/dash', readiness: async ({ page }) => {
      await page.waitForSelector('#dash', { timeout: 15000 });
      return true;
    } },
  ],
});
```

## Configuration

```ts
{
  urls: (string | PageSpec)[];
  engines?: EngineName[];            // default: all three
  search?: { strategy?, stepSize?, floor?, explicitVersions? };
  checks?: { navigation?, javascript?, console?, network?, rendering?, readiness? }; // all default true
  readiness?: { selectors: string[]; mode?: 'any' | 'all' };  // top-level default
  network?: {
    ignoredPatterns?: (RegExp | string)[];          // non-fatal failures
    criticalResourceTypes?: ResourceType[];         // fatal failures
  };
  analysis?: { minConfidence?: 'high' | 'medium' | 'low' | 'unknown' };
  hooks?: { beforeGoto?: (...) => Promise<void> };  // opt-in (e.g. anti-bot warm-up)
  waitUntil?: 'domcontentloaded' | 'load';  // default: domcontentloaded (use 'load' for full page)
  disableHttpCache?: boolean;        // default true (cached 200 can mask real failures)
  holdOpenSec?: number;              // default 2 (hold window open N sec after checks; great in headed mode)
  timeout?: number;                  // default 30000
  headed?: boolean;                  // default true
  retries?: number;                  // default 3 (transient only)
  output?: { format?: ('json' | 'markdown')[]; directory?: string };
  cache?: { directory?: string };    // default ~/.cache/browser-boundary
}
```

The core has **no** hardcoded knowledge of any website — selectors, analytics hosts, and anti-bot behavior are all supplied through this config. (See `examples/tabdeal.ts` for a fully-configured real-world example.)

## Browser engines

| Engine | Real historical binaries? | How |
|---|---|---|
| Chromium | ✅ | Chrome-for-Testing via `@puppeteer/browsers`, driven by Playwright/CDP (CDP is native to every Chrome build) |
| Firefox | ✅ (≥52) | Real builds from archive.mozilla.org, driven by **geckodriver / W3C WebDriver** (not Playwright — see below) |
| WebKit | ⚠️ current-only | Playwright's patched WebKit build only — historical Safari is macOS-locked |

> **Why Firefox uses geckodriver, not Playwright:** Playwright can only drive its *own* patched Firefox build (which contains the Juggler instrumentation protocol). Vanilla release builds from `archive.mozilla.org` lack Juggler — they launch and exit immediately without responding. So historical Firefox is driven by geckodriver, which speaks **Marionette** (built into every Firefox ≥48). The tool downloads the right geckodriver per Firefox version from a vendored compatibility matrix. Firefox < 52 (geckodriver's floor) is reported **inconclusive**, never substituted.
>
> **Why WebKit stays current-only:** Safari is macOS-only and version-locked to macOS — there is no standalone historical Safari archive, and Playwright's WebKit patch only ships a current build. Historical Safari needs macOS hardware or a cloud-device service (not supported here).

## Version search algorithm

Per engine (Chromium/Firefox), over the descending version list:

1. **Latest first** — probe the current build.
2. **Step down** by `stepSize` (default 10) majors until a version FAILS.
3. **Binary search** the gap between the last pass and first fail to pin the exact boundary.
4. **Skip** everything the boundary implies (no exhaustive scan).
5. `--strategy latest` short-circuits to step 1; `--strategy explicit` tests only the versions you list.

Honesty contract: results describe **verified** boundaries only. The tool never claims "all versions below X are unsupported" for untested versions. See `boundaryConfidence` (`high` after binary search, `low` for a single probe).

## Compatibility checks

A version **passes** only if all enabled checks succeed:

1. **Navigation** — `page.goto` resolves without DNS/TLS/timeout/crash.
2. **JavaScript** — no uncaught `pageerror`. (Console errors fail only when mapped to a known feature; warnings never fail.)
3. **Network** — app-critical JS/CSS/API/font requests succeed. Analytics/tracking failures are non-fatal (configurable).
4. **Rendering** — the page renders (verified via readiness).
5. **Readiness** — configurable selectors (`any`/`all`) or a custom predicate become true within the timeout.

A version is **fail** on a real compatibility problem; **inconclusive** if it couldn't be determined (e.g. anti-bot stall); **error** on infrastructure failure (browser wouldn't launch) — these are kept distinct so CI doesn't conflate infra problems with compat problems.

## Error analysis & confidence

Failures are mapped to ES/Web features **with a confidence level**, not false certainty:

- `high` — a SyntaxError uniquely identifying missing syntax (e.g. `Unexpected token '?.'` → Optional chaining).
- `medium` — a named API missing (e.g. `structuredClone is not defined`).
- `low` — a method-not-found that *could* be a missing polyfill.
- `unknown` — a generic runtime error (e.g. `Cannot read properties of undefined`) is **almost always an app bug**, not a compat issue. It is NOT attributed to a feature. (`--min-confidence` controls the FAIL threshold.)

## Reports

- `reports/compatibility.json` — full machine-readable scan.
- `reports/compatibility.md` — human report: verified boundary, reasons, ES/Web findings table, suggested Browserslist target.
- `reports/artifacts/` — failure screenshots, Playwright traces, `console-*.log`, `failed-requests-*.log`.

## CI usage

Exit codes distinguish outcomes:

| Code | Meaning |
|---|---|
| 0 | scan completed (no verified compat failure) |
| 1 | compatibility failure (a verified boundary failure was found) |
| 2 | configuration error |
| 3 | infrastructure / browser error |

```bash
npx browser-boundary https://staging.example.com --strategy latest
```

## Historical browser limitations

- Playwright ships **one build per engine per release**; `playwright install <engine>@N` is unsupported. Historical Chrome is fetched via Chrome-for-Testing (driven by Playwright/CDP); historical Firefox is fetched from archive.mozilla.org (driven by geckodriver/WebDriver).
- **A version that cannot be obtained is reported `inconclusive`, never substituted.** If a real historical binary for the requested version can't be downloaded or driven, the tool records `inconclusive` for that exact version — it never tests a *different* version (e.g. current) and reports it under the requested version's name. This applies to both Chrome and Firefox.
- **Firefox < 52** is below geckodriver's supported floor and cannot be driven. Below ~ESR 52, modern HTTPS may also fail (TLS/cipher support) even when drivable.
- Very old Chrome builds may not run on modern Linux (sandbox/ABI/glibc). Set `search.floor` to keep the search above realistic floors (defaults: chromium 60, firefox 60, webkit 13).
- User-Agent is **never** changed — that is not equivalent to running an older engine.

## WebKit limitations (historical testing)

Historical **Safari/WebKit cannot be tested** off Apple hardware. Safari is distributed only via macOS Software Update, is version-locked to macOS, and Apple does not publish standalone drivable historical binaries. Playwright's WebKit is a patched current build only.

So WebKit results are always the **current Playwright build** and are reported with `versionType: 'playwright-revision'`. They are **not** equivalent to a specific Safari version. Don't stringify them as "Safari N". The tool probes WebKit latest-only and notes the limitation in the report. (Historical Safari would require a macOS CI matrix with matching macOS images, or a cloud-device service such as BrowserStack.)

## Browser binary caching

Real historical binaries are cached under `~/.cache/browser-boundary/` (global, shared across projects; overridable via `cache.directory` or `MRZ_BROWSER_CACHE`). A manifest deduplicates downloads so a version isn't re-fetched.

## Security / privacy

- This tool drives a real browser to URLs **you** specify. Only use it against sites you own or are authorized to test.
- The opt-in `hooks.beforeGoto` is for legitimate anti-bot warm-ups (e.g. obtaining a session cookie your site issues); it uses the browser's real TLS fingerprint and does not spoof identity.
- Reports may contain request URLs and error text from the target site — review before sharing.

## Development

```bash
npm install
npm run typecheck      # tsc --noEmit
npm test               # unit tests (offline, fast)
npm run test:fixtures  # integration tests against local fixtures (needs Playwright)
npm run build          # tsup → dist/ (ESM + CJS + d.ts)
npm run pack-check     # verify npm pack contents/size
```

The unit test suite is deterministic and **never** touches external websites — it uses local fixtures under `tests/fixtures/`. See `examples/tabdeal.ts` for a real-world (network) example.

## Contributing

PRs welcome. Please:

- Keep **no site-specific knowledge** in `src/core`, `src/detection`, `src/analysis`, or `src/reporting` — site behavior belongs in config/examples.
- Add/extend unit tests for any logic change (version-search, analyzer, network classification are pure and fully testable).
- Preserve the honesty contract: verified boundaries only, confidence levels, WebKit Playwright-revision labeling.

## License

MIT © Amirhossein Mirzaei

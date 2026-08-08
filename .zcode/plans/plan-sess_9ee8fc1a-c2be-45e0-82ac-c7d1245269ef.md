# Tabdeal Browser Compatibility Tester — Build Plan

Scaffold a TypeScript + Playwright project at `/home/amir/projects/gitrepo/new/` that finds the oldest *real* browser engine version (Chromium / Firefox / WebKit) that can correctly load `https://tabdeal.org` and `https://tabdeal.org/buy-btc`, then produces JSON + Markdown reports.

## Confirmed scope (from question)
**Build + validate latest** — I will scaffold everything, install deps, install the 3 current Playwright browser builds, and run a **latest-only** probe for all 3 engines to prove the harness works end-to-end. The full historical step-down scan is implemented and runnable by you (`npm run scan`), but I won't run the heavy multi-version downloads myself.

## Target-site findings (real selectors, discovered from the live site)
The site is a Persian RTL SSR app (likely Nuxt/Next). Stable selectors I'll use:
- **Home** `/`: logo `a[href="/"]`, nav `a[href="/buy-cryptocurrency"]`, `a[href="/swap"]`, `a[href="/panel/trade"]`, CTA text "خرید آسان" / "شروع معامله".
- **/buy-btc**: `a[href="/buy-btc"]`, `a[href="/panel/trade/BTC_IRT"]`, `a[href="/swap?to-symbol=btc"]`, text "معامله بیت کوین", inputs by placeholder "تومان" / "روز".

Readiness = wait for the H1/nav anchor + key CTA to be visible (networkidle as secondary), not just `page.goto()` resolving.

## Core technical decision (the hard part of this task)
You cannot do `npx playwright install chromium@100` — Playwright only ships the build pinned to the installed Playwright version. I will **not fake versions via User-Agent**. Instead, real binaries are obtained by:
- **Latest**: current Playwright build via `npx playwright install chromium firefox webkit` (this is what I validate now).
- **Historical Chromium/Firefox**: `src/browser-installer.ts` uses `@puppeteer/browsers` (`chrome@<ver>`, `firefox@<ver>`) to download real historical binaries and passes them to Playwright's launch via `executablePath`.
- **Historical WebKit**: only Playwright's patched WebKit is drivable; historical Safari/WebKit binaries aren't installable. WebKit "versions" are therefore proxied by Playwright build revisions, clearly labeled in the report. This asymmetry is documented as a known limitation (honest, per the task's "explain the limitation" requirement).

## Project structure
```
new/
├── package.json              # @playwright/test, playwright, @puppeteer/browsers, tsx
├── tsconfig.json
├── playwright.config.ts      # 3 projects: chromium/firefox/webkit, screenshots+trace on failure
├── .gitignore                # node_modules, reports/, browser-cache/
├── src/
│   ├── config.ts             # URLs, timeout, headed, engines, version ranges — env-overridable
│   ├── types.ts              # Verdict (PASS/FAIL/INCONCLUSIVE), result/feature records
│   ├── browser-installer.ts  # get real binary path for (engine, version) via puppeteer-browsers / playwright
│   ├── compatibility-check.ts# run ONE (engine, version, page): the 5 check categories below
│   ├── error-analyzer.ts     # classify JS/network errors → ES/Web feature + min browser version
│   ├── browser-version-tester.ts # step-down + binary-search driver over the matrix
│   ├── report-generator.ts   # writes reports/compatibility.json + compatibility.md
│   └── run.ts                # CLI entrypoint: `npm run scan`
├── tests/
│   └── compatibility.spec.ts # thin Playwright-Test wrapper (3 projects) for headed/traces fans
├── reports/                  # generated: compatibility.json, .md, artifacts/{screenshots,traces,logs}/
└── README.md
```

## compatibility-check.ts — the 5 detection categories
For one (engine, version, page), using a real browser binary via `executablePath`:
1. **Navigation errors** — wrap `page.goto()`; catch DNS/TLS/timeout/`ERR_*`/crash → FAIL with reason.
2. **JavaScript errors** — `page.on('pageerror')` = critical; `page.on('console')` filtered to `error`/`warning`. Only `pageerror` + critical console errors fail the run; warnings are recorded, not fatal.
3. **Failed network requests** — `page.on('requestfailed')`; classify by URL: analytics/tracking (e.g. gtag, GA, snap.licdn) = non-fatal; app JS/CSS/API/fonts/images = important. A failed app JS/API request → FAIL.
4. **Rendering** — assert visible H1 + at least one site-specific selector (above) actually render.
5. **Application readiness** — `waitForSelector` on key elements + `networkidle`, configurable timeout (default 30s), to cover SSR hydration / async API / delayed render.

Each run returns `{ verdict, navigationError, jsErrors[], consoleErrors[], failedRequests[], rendered, readyMs, screenshotPath }`.

## error-analyzer.ts — ES/Web compatibility mapping
Baked-in table mapping error signatures → feature → min engine versions (caniuse/MDN-derived). Examples:
- `Unexpected token '?.'` → optional chaining → Chromium 80 / Firefox 74 / WebKit 13.1
- `Unexpected token '??'` → nullish coalescing → 80 / 72 / 13.1
- `Cannot read properties of undefined (reading 'at')` / `Array.at` → 92 / 90 / 15.4
- `structuredClone is not defined` → 98 / 94 / 15.4
- `Promise.allSettled` → 76 / 71 / 13
- private fields `#` SyntaxError → 74 / 90 / 14.1
- `globalThis` ReferenceError → 71 / 65 / 12.1

Maps each FAIL to the likely ES/Web requirement and emits the "ECMAScript / Web Platform Findings" table. Extensible data table, documented.

## browser-version-tester.ts — version-search algorithm
Per engine, over the configured version list (descending):
1. Test latest first.
2. Step down in large increments (default step = 10 majors, adjustable) until a FAIL.
3. Binary-search between last PASS and first FAIL to find the boundary.
4. Skip versions already implied by the boundary (no exhaustive scan).
5. `--latest-only` / `BC_LATEST_ONLY=1` short-circuits to step 1 only (used for my validation run).
Resilient: a download/launch error for one version → INCONCLUSIVE for that version (doesn't abort the scan).

## Outputs
- `reports/compatibility.json` — full machine-readable results per (engine, version, page) + summary.
- `reports/compatibility.md` — the report format from your spec (Latest tested / Oldest passing / First failing / SUPPORTED ≥ X / Reasons / ES findings table / Final recommendation / suggested Browserslist target).
- `reports/artifacts/` — failure screenshots, Playwright traces, `console-<engine>-<ver>.log`, `failed-requests-...log`.

## README.md covers the 10 required items
Install deps → install browsers → run all / Chromium-only / Firefox-only / WebKit-only → headed mode (`--headed`) → config version ranges (env + config.ts) → how the search algorithm works → known historical-browser limitations (Playwright single-pinned-build; WebKit; Firefox executablePath caveat).

## What I will actually run after scaffolding (validation)
1. `npm install`
2. `npx playwright install chromium firefox webkit`
3. `BC_LATEST_ONLY=1 npm run scan`
4. Show you the generated `reports/compatibility.md` (all 3 engines = latest version, expected PASS), proving navigation/JS/network/render/readiness checks, artifact saving, and report generation all work. The full historical scan remains one command away for you.

## Non-goals / honesty notes
- I won't fake versions, won't treat HTTP 200 as success, won't fail on analytics-only network errors.
- WebKit historical granularity is limited to Playwright build revisions — surfaced in the report, not hidden.
- `node_modules`, `reports/`, and a local `browser-cache/` are gitignored; this dir is not currently a git repo (I won't init one unless you ask).
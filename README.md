# Tabdeal Browser Compatibility Tester

Finds the **oldest real browser engine version** (Chromium / Firefox / WebKit)
that can correctly load `https://tabdeal.org` and `https://tabdeal.org/buy-btc`,
then writes a JSON + Markdown report.

It uses **actual historical browser binaries** (Chrome-for-Testing,
archive.mozilla.org) — it never fakes versions via User-Agent.

---

## What "compatible" means

A version is **PASS** only if *all* of these hold:

1. **Navigation** — `page.goto()` resolves without DNS / TLS / timeout / crash.
2. **JavaScript** — no uncaught `pageerror`; only critical console errors are fatal (warnings are recorded, not fatal).
3. **Network** — app-critical JS/CSS/API/font requests succeed. **Analytics/tracking failures are non-fatal.**
4. **Rendering** — site-specific selectors (discovered from the live site) are actually visible.
5. **Readiness** — selectors are waited for with a configurable timeout (covers SSR hydration / async API / delayed render).

A version is **FAIL** when any of 1–4 fails. **INCONCLUSIVE** means a real binary
for that version could not be obtained or launched (recorded, never silently ignored).

---

## Project structure

```text
browser-compatibility/
├── package.json
├── playwright.config.ts        # 3 engine projects for the optional `playwright test` runner
├── tsconfig.json
├── src/
│   ├── types.ts                # Verdict / result / feature records
│   ├── config.ts               # URLs, timeout, engines, version ranges — env-overridable
│   ├── error-analyzer.ts       # JS/network signals → ES/Web feature + min engine version
│   ├── browser-installer.ts    # REAL historical binaries via Chrome-for-Testing / Firefox archive
│   ├── compatibility-check.ts  # one (engine, version, page) run: the 5 categories
│   ├── browser-version-tester.ts # step-down + binary-search driver
│   ├── report-generator.ts     # writes reports/compatibility.{json,md}
│   └── run.ts                  # CLI entrypoint
├── tests/
│   └── compatibility.spec.ts   # thin Playwright-Test wrapper
├── reports/                    # generated (gitignored)
│   ├── compatibility.json
│   ├── compatibility.md
│   └── artifacts/{screenshots,traces,logs}/
└── README.md
```

---

## 1. Install dependencies

```bash
npm install
```

## 2. Install Playwright browsers

```bash
npx playwright install chromium firefox webkit
```

(WebKit historical binaries aren't separately installable — see *Known limitations*.)

## 3. Run the full scan (all engines)

```bash
npm run scan
```

## 4. Run only Chromium

```bash
npm run scan:chromium
# equivalent to: BC_ENGINES=chromium npm run scan
```

## 5. Run only Firefox

```bash
npm run scan:firefox
```

## 6. Run only WebKit

```bash
npm run scan:webkit
```

> For the standard `playwright test` runner (per-engine projects, HTML reports),
> use `npx playwright test --project=chromium` (or `firefox` / `webkit`).

## 7. Headed mode

Set `HEADED=1` (or `BC_HEADED=1`):

```bash
HEADED=1 npm run scan
# or via the test runner:
npm run test:headed
```

## 8. Configure the version range

All knobs are env-overridable — no code edits required:

| Variable | Default | Meaning |
|---|---|---|
| `BC_ENGINES` | `chromium,firefox,webkit` | Comma-sep engines to scan |
| `BC_PAGES` | `home,buy-btc` | Comma-sep page labels |
| `BC_TIMEOUT_MS` | `30000` | Per-page readiness/navigation timeout |
| `BC_LATEST_ONLY` | `0` | Probe only the current build per engine (smoke run) |
| `BC_STEP_SIZE` | `10` | Major-version step used before binary-searching |
| `BC_FLOOR_CHROMIUM` | `60` | Don't search below this Chrome major |
| `BC_FLOOR_FIREFOX` | `60` | Don't search below this Firefox major |
| `BC_FLOOR_WEBKIT` | `13` | Safari/WebKit floor |
| `HEADED` / `BC_HEADED` | `0` | Show browser windows |
| `BC_REPORTS_DIR` | `./reports` | Output directory |
| `BC_BROWSER_CACHE` | `./browser-cache` | Where historical binaries are cached |

Edit the static floors/selectors in `src/config.ts` for permanent changes.

## 9. How the version-search algorithm works

Per engine:

1. **Latest first.** Probe the current Playwright-managed build.
2. **Step down** by `BC_STEP_SIZE` (default 10) major versions. Keep going older while the version PASSES.
3. **On first FAIL**, stop stepping.
4. **Binary-search** the range `[firstFail, lastPass]` to pin the exact boundary.
5. **Skip** everything the boundary already implies (no exhaustive scan).
6. **INCONCLUSIVE** versions (binary unavailable / wouldn't launch) are recorded and worked around, never abort the scan.

```
Latest(124) PASS → 114 PASS → 104 PASS → 94 PASS → 84 FAIL
   → binary search [84 .. 94] → 89 PASS, 88 FAIL
   → oldest passing = 89, first failing = 88
   → everything < 88 and > 94 skipped
```

Use `BC_LATEST_ONLY=1` (or `npm run scan:latest`) to short-circuit to step 1 —
useful for proving the harness works without the heavy historical downloads.

## 10. Known limitations of testing historical browser versions with Playwright

- **Playwright pins one build per engine per release.** `npx playwright install chromium@100` is **not** supported. This tool fetches real historical **Chrome-for-Testing** builds (via `@puppeteer/browsers`) and real **Firefox** release archives (from `archive.mozilla.org`), passing them to Playwright through `executablePath`.
- **WebKit cannot be sourced historically.** Only Playwright's patched WebKit build is CDP-drivable; Apple does not publish standalone, drivable historical Safari/WebKit binaries. WebKit results are therefore **current-only** and clearly labelled as such in the report.
- **Some very old Chrome/Firefox builds won't run on modern Linux** (missing sandbox/ABI/glibc symbols). Use `BC_FLOOR_*` to keep the search above realistic floors (defaults 60/60). Such versions come back **INCONCLUSIVE**, not falsely PASS/FAIL.
- **User-Agent is never changed.** Changing the UA is not equivalent to running an older engine; this tool does not do it.
- **Analytics failures are non-fatal.** gtag/GA/etc. failing in old browsers is expected and irrelevant; only app-critical JS/CSS/API/font failures fail a version.

---

## Output

- `reports/compatibility.json` — full machine-readable scan (every version, every page, every signal).
- `reports/compatibility.md` — the report format from the task spec: latest tested / oldest passing / first failing / SUPPORTED ≥ X / failure reasons / ES+Web findings table / final recommendation / suggested Browserslist target.
- `reports/artifacts/screenshots/` — PNG captured on FAIL.
- `reports/artifacts/traces/` — Playwright trace ZIP on FAIL (open with `npx playwright show-trace <file>`).
- `reports/artifacts/logs/` — `console-*.log` and `failed-requests-*.log`.

## Selectors used (discovered from the live site)

The site is a Persian RTL SSR app (Nuxt/Next-style). Selectors are stable
nav hrefs + visible CTAs — kept resilient to minor markup churn.

- **home** `/`: `a[href="/"]`, `a[href="/buy-cryptocurrency"]`, `a[href="/swap"]`
- **buy-btc** `/buy-btc`: `a[href="/buy-btc"]`, `a[href="/panel/trade/BTC_IRT"]`, `a[href="/swap?to-symbol=btc"]`

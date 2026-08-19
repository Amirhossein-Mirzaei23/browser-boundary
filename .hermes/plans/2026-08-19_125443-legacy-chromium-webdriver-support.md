# Legacy Chromium WebDriver Support Implementation Plan

> **For Hermes:** Implement this plan task-by-task using test-driven development. Do not commit unless the user asks.

**Goal:** Add a selectable legacy Chromium automation path that can run Chromium 85 and older without relying on a modern Playwright client's incompatible CDP commands, while preserving honest version reporting and cache-first/offline behavior.

**Architecture:** Keep Playwright as the normal controller for current Chromium and add Chromium support to the existing Selenium/WebDriver controller. Add a `--chromium-controller auto|playwright|webdriver` option. In `auto`, historical Chromium snapshots use a ChromeDriver downloaded from the exact same snapshot revision; Playwright-managed/current builds continue to use Playwright. Explicit overrides remain available for diagnostics. Store the selected controller and matching driver path on `BrowserBinary`, so controller selection remains provider-driven.

**Tech Stack:** TypeScript, Node.js, Playwright, `selenium-webdriver`, Chromium snapshot storage, Node test runner.

---

## Current evidence and root cause

The failure is reproducible from the source checkout:

- `npm run scan -- https://google.com/ --engines chromium --versions 83 --headless --timeout 10000`
- Current result: `browser.newContext: Protocol error (Browser.setDownloadBehavior): 'Browser.setDownloadBehavior' wasn't found`.
- The cached binary starts independently and exposes a DevTools endpoint, so this is not primarily a missing-library or executable failure.
- Installed Playwright is `1.62.1`; `src/controllers/playwright.ts:29-31` launches every historical Chromium through that modern Playwright client and fails while creating the context.
- Playwright documents custom `executablePath` as best-effort; its client and bundled browser are version-coupled. A modern client should not be treated as a reliable driver for Chromium 85 and older.

A second correctness bug must be fixed before claiming exact-version support:

- The cache manifest requested as Chromium 83 launches as `Chromium 80.0.3957.0`.
- Other sampled mappings are similarly shifted: requested 85 launches Chromium 81, requested 89 launches Chromium 85, requested 111 launches Chromium 105.
- `src/browsers/chromium-snapshots.ts:175-228` therefore does not currently map milestones to the claimed browser majors.
- Known reference revisions include Chromium 83 `r756035` and Chromium 85 `r782078`; the current table assigns `r711868` and `r734203` respectively.

The implementation must address both issues. Merely changing the controller would still produce dishonest reports under the requested major.

## Chosen option and tradeoffs

Add `--chromium-controller auto|playwright|webdriver`:

- `auto` (default): use matching ChromeDriver/WebDriver for historical snapshot Chromium; use Playwright for current/Playwright-managed Chromium.
- `playwright`: retain the existing path for troubleshooting and for versions known to work, but report protocol incompatibility honestly.
- `webdriver`: require a matching ChromeDriver and fail inconclusively if it cannot be obtained; never silently fall back to another browser or driver version.

Use the `chromedriver_linux64.zip` artifact from the same Chromium snapshot revision when available. This is safer than pairing an arbitrary stable ChromeDriver with a tip-of-tree snapshot because ChromeDriver compatibility depends on the browser build line, not only the major.

Do not solve this by pinning/dynamically installing many old Playwright versions. That would introduce multiple package runtimes, browser-client lookup tables, subprocess/RPC complexity, and the same version-coupling problem for every milestone.

---

### Task 1: Correct and verify snapshot milestone metadata

**Objective:** Ensure a request for Chromium major N resolves to a binary whose runtime major is actually N.

**Files:**
- Modify: `src/browsers/chromium-snapshots.ts:24-30,165-228`
- Modify: `tests/unit/chromium-snapshots.test.ts`
- Modify: `tests/unit/chromium-provider.test.ts`

**Steps:**

1. Add a failing table-driven test for representative milestones, including 83 → `756035` and 85 → `782078`, rather than only asserting that revisions are numeric.
2. Replace the unverified arithmetic-looking revision table with curated, source-backed milestone revisions. Document the source beside each range or in a structured provenance comment.
3. Add a runtime validation helper that executes a newly acquired/cached Chromium binary with `--version`, parses its actual major, and rejects a mismatch before writing the completion manifest.
4. On cache read, validate the executable still exists and that its parsed runtime major equals the requested major. Treat old mismatched manifests as invalid cache entries so the current incorrect Chromium-83 cache cannot be reused.
5. Return a typed `HistoricalUnavailableError` on mismatch, including requested major, actual major, and revision; do not report compatibility evidence under the wrong version.
6. Run `node --test --import tsx tests/unit/chromium-snapshots.test.ts tests/unit/chromium-provider.test.ts` and confirm the new assertions pass.

**Acceptance criteria:**

- Chromium 83 never resolves to the currently cached Chromium 80 binary.
- Every accepted cache manifest has a verified actual browser major.
- No manifest is written until executable existence, executable permission, and runtime major validation succeed.

---

### Task 2: Add Chromium controller policy to config and CLI

**Objective:** Expose a user-selectable controller without leaking CLI concerns into controller implementations.

**Files:**
- Modify: `src/config/schema.ts`
- Modify: `src/config/resolve.ts`
- Modify: `src/cli/options.ts`
- Modify: `tests/unit/config.test.ts`
- Modify: `tests/unit/cli-options.test.ts`

**Steps:**

1. Add a config type such as `chromiumController?: 'auto' | 'playwright' | 'webdriver'`, defaulting to `auto`.
2. Add CLI parsing for `--chromium-controller <mode>` and environment support for `MRZ_CHROMIUM_CONTROLLER` (plus `BC_CHROMIUM_CONTROLLER` only if legacy aliases are kept consistently).
3. Reject unknown values with an actionable `ConfigError` listing the three valid choices.
4. Document in `HELP` that `auto` uses a matching WebDriver for historical snapshots and Playwright for current builds.
5. Add parsing/default/invalid-value tests.
6. Run `node --test --import tsx tests/unit/cli-options.test.ts tests/unit/config.test.ts`.

**Acceptance criteria:**

- Existing commands retain behavior through the `auto` default.
- The chosen policy reaches provider resolution through `ResolvedConfig` or an explicit provider-install options object; do not read environment variables in providers/controllers.

---

### Task 3: Acquire and cache the exact matching snapshot ChromeDriver

**Objective:** Pair each historical Chromium snapshot with a driver from the same revision and preserve cache-first operation.

**Files:**
- Modify: `src/browsers/chromium-provider.ts:52-98,175-259`
- Modify: `src/browsers/chromium-snapshots.ts`
- Modify: `src/browsers/types.ts:13-35`
- Modify: `src/browsers/util.ts` only if shared executable/manifest validation needs extension
- Modify: `tests/unit/chromium-provider.test.ts`
- Modify: `tests/unit/chromium-snapshots.test.ts`

**Steps:**

1. Extend snapshot probing to verify both `chrome-linux.zip` and `chromedriver_linux64.zip` for WebDriver mode. A revision is usable in `auto/webdriver` only when the browser and matching driver artifacts exist.
2. Download/extract the driver under the same revision-scoped directory as the browser, for example `snapshots/chromium-83-756035/chromedriver/chromedriver`.
3. Mark the driver executable and validate it with `--version`.
4. Extend the manifest to persist requested major, actual browser version/major, snapshot revision, browser path, driver path, build label, platform, and controller. Keep backward-compatible reading only when old metadata can be safely revalidated; otherwise invalidate and reacquire.
5. Read and validate the complete manifest before any remote probe. Add a regression test where all network calls throw but a valid browser+driver cache returns successfully with zero network calls.
6. Download to incomplete/temp paths and write the manifest atomically only after both artifacts validate. Remove only revision-scoped partial state on failure.
7. If the matching driver is unavailable, throw `HistoricalUnavailableError` and produce INCONCLUSIVE; never pair a different revision or switch to a falsely labelled browser.
8. For explicit `playwright` mode, permit browser-only acquisition but still validate the actual major.
9. Run focused Chromium provider/snapshot tests.

**Acceptance criteria:**

- `auto` returns `controller: 'webdriver'` and a valid `driverPath` for Chromium snapshot versions.
- A valid cached browser+driver pair works without remote metadata or bucket access.
- Partial browser-only/driver-only downloads cannot become cache hits.

---

### Task 4: Generalize WebDriverController for Chromium

**Objective:** Reuse the existing WebDriver session contract for ChromeDriver without breaking historical Firefox.

**Files:**
- Modify: `src/controllers/webdriver.ts`
- Modify: `src/controllers/selenium-shim.d.ts`
- Modify: `src/browsers/types.ts`
- Create: `tests/unit/webdriver-controller.test.ts` if no controller-focused test file exists

**Steps:**

1. Add an explicit browser/engine discriminator to `BrowserBinary`; stop inferring controller behavior from `buildLabel` text.
2. Split `WebDriverController.launch` into engine-specific setup branches while sharing `WebDriverSession` behavior.
3. Keep the existing Firefox/geckodriver branch unchanged in behavior.
4. Add a Chromium branch that starts the supplied ChromeDriver on a free local port, configures `selenium-webdriver/chrome.Options`, sets the exact historical Chromium binary, adds `--no-sandbox` and `--disable-dev-shm-usage`, and adds headless arguments only in headless mode.
5. Generalize error messages from geckodriver/Firefox to the selected engine and driver.
6. Update the ambient Selenium shim for `selenium-webdriver/chrome`, the builder's Chrome option method, and any capability methods actually observed in the installed package.
7. Preserve lifecycle behavior: headed explicit mode polls until tab/window/session closure; headless mode closes automatically; child-driver shutdown checks process exit rather than `ChildProcess.killed`.
8. Add mocked tests proving Chromium selects Chrome options, exact binary and supplied driver, while Firefox still selects Firefox options.
9. Run the new focused controller tests plus `tests/unit/exact-version-lifecycle.test.ts`.

**Acceptance criteria:**

- Chromium WebDriver sessions satisfy the existing `ControllerSession` interface.
- Historical Firefox behavior is unchanged.
- No controller guesses the engine from display labels.

---

### Task 5: Preserve compatibility signal collection on the legacy path

**Objective:** Ensure the WebDriver fallback still produces useful navigation, JavaScript, console, rendering, and request evidence.

**Files:**
- Modify: `src/controllers/webdriver.ts:104-297`
- Modify: `src/controllers/selenium-shim.d.ts`
- Create/modify: `tests/unit/webdriver-controller.test.ts`
- Modify: `src/config/schema.ts` documentation if custom readiness differs by controller

**Steps:**

1. Configure Chrome browser/performance logging capabilities where supported by the matching legacy ChromeDriver.
2. Parse browser log entries into the existing `SignalSinks` callbacks.
3. Parse performance log CDP envelopes for request/response/loading-failed events when available; degrade to fewer network signals rather than failing the whole scan when an old driver does not support performance logs.
4. Preserve CSS-selector and no-readiness checks through `executeScript`.
5. Explicitly document that API-supplied readiness callbacks currently receive a Playwright `Page` and therefore cannot be used on WebDriver; either reject this combination during config resolution or introduce a controller-neutral readiness callback in a separate follow-up. Do not silently report success for an unexecuted custom readiness function.
6. Add tests for console error forwarding, navigation errors, selector readiness, missing performance logs, and unsupported custom readiness behavior.

**Acceptance criteria:**

- WebDriver mode does not turn absent optional logs into infrastructure errors.
- Unsupported checks are reported honestly, not silently treated as passes.

---

### Task 6: Improve protocol/controller error classification

**Objective:** Make forced Playwright failures actionable and keep them separate from website compatibility verdicts.

**Files:**
- Modify: `src/core/compatibility-checker.ts:64-170`
- Modify: `src/controllers/playwright.ts:23-33`
- Modify/create: controller/checker unit tests

**Steps:**

1. Detect Playwright/CDP protocol incompatibility errors such as missing `Browser.setDownloadBehavior` during launch/context creation.
2. Return an infrastructure error explaining that the browser launched but the selected Playwright client is incompatible, and recommend `--chromium-controller auto` or `webdriver`.
3. Ensure a partially launched browser is closed if `browser.newContext()` fails; currently `launch()` loses the browser handle before returning a session, which can leak the process.
4. Add a test where browser launch succeeds but context creation throws, asserting browser cleanup and the actionable reason.
5. Keep verdict `error`/summary INCONCLUSIVE; never classify controller protocol failure as a website fail.

---

### Task 7: End-to-end legacy Chromium regression coverage

**Objective:** Prove sequencing and reporting through the public scanner path.

**Files:**
- Modify: `tests/unit/providers.test.ts` or create a focused scanner integration-style unit test
- Modify: `tests/unit/version-search.test.ts` if binary/step-down policy needs coverage
- Modify: `tests/unit/exact-version-lifecycle.test.ts`

**Steps:**

1. Add a public-path test resolving a historical Chromium binary in `auto` mode and assert the scanner selects WebDriver.
2. Add a forced-Playwright test that stays inconclusive on protocol incompatibility.
3. Add sequencing coverage confirming requested version N+1 does not start until the Chromium WebDriver session for N is closed.
4. Add a mismatched-major fixture and assert it is rejected before a check result can be attributed to the requested version.
5. Add a valid-cache/network-down fixture and assert zero network calls.

---

### Task 8: Documentation and migration notes

**Objective:** Make the option and its limitations discoverable.

**Files:**
- Modify: `README.md:167-197,304-318,489-518,540-545`
- Modify: `CHANGELOG.md`
- Modify: `src/cli/options.ts:204-260`

**Steps:**

1. Document `--chromium-controller auto|playwright|webdriver` with examples for Chromium 83/85.
2. Explain that exact-version support verifies the launched browser's actual major.
3. Explain first-download network requirements for both snapshot browser and matching ChromeDriver, and offline reuse after a valid manifest is cached.
4. Explain that a missing matching driver, unsupported OS/ABI, or controller protocol mismatch remains INCONCLUSIVE.
5. Correct broad claims such as “Chromium 60–current” if the verified mapping/driver audit reveals gaps; list gaps rather than overstating support.
6. Note that stale manifests created before runtime-major validation will be invalidated and reacquired.

---

## Verification checklist

Run in order:

1. `npm run test`
2. `npm run typecheck`
3. `npm run build`
4. `npm run pack-check`
5. Confirm `git status --short` contains only intended source, tests, docs, and plan changes.
6. Remove or invalidate the stale Chromium-83 manifest, then run:
   - `npm run scan -- https://google.com/ --engines chromium --versions 83 --chromium-controller auto --headless --timeout 10000`
   - Expected: actual launched browser major is 83; no Playwright `Browser.setDownloadBehavior` error; result is application-level PASS/FAIL or a clearly identified external/network inconclusive.
7. Run headed explicit mode:
   - `npm run scan -- https://google.com/ --engines chromium --versions 83,85 --chromium-controller auto`
   - Expected: Chromium 83 opens first, Chromium 85 does not open until the user closes 83, and both build labels include verified actual versions/revisions.
8. Disable network access or stub fetch after a successful acquisition and rerun Chromium 83.
   - Expected: valid browser+driver cache is used with zero remote calls.
9. Force `--chromium-controller playwright` for Chromium 83.
   - Expected: if incompatible, actionable infrastructure error and INCONCLUSIVE; no leaked Chromium process.

## Risks and open questions

- Snapshot availability is best-effort. Browser and matching ChromeDriver must both exist for WebDriver mode; unsupported revisions must remain INCONCLUSIVE.
- The current milestone table needs a full audit, not only corrections for 83 and 85. Shipping only two corrected rows would leave dishonest results elsewhere.
- Modern `selenium-webdriver` may emit capabilities unsupported by very old ChromeDriver versions. If session creation proves incompatible, isolate a minimal W3C capabilities payload or a small direct WebDriver HTTP client rather than substituting versions.
- ChromeDriver storage is geo-restricted from the current runner (observed HTTP 403 for legacy official driver URLs). Cache-first behavior and a useful first-download/VPN message are required, and live validation may need a reachable network or pre-seeded artifacts.
- Historical Chromium binaries may still fail on modern Linux because of ABI/sandbox/display constraints. Controller fallback fixes CDP compatibility, not OS compatibility.
- Supporting custom Playwright `Page` readiness callbacks in WebDriver mode requires an API redesign; reject or clearly mark it unsupported in this feature rather than faking success.
- Platform support should match actual snapshot artifacts. The current provider hardcodes `Linux_x64`; do not advertise this WebDriver path on macOS/Windows until platform-specific browser and driver acquisition is implemented and tested.

## Definition of done

- Chromium 83/85 resolve to binaries whose runtime majors are verified as 83/85.
- Default `auto` mode drives historical snapshots through an exact-revision ChromeDriver and current Chromium through Playwright.
- Valid browser+driver caches run with zero network calls.
- Protocol, download, driver, ABI, and version-mismatch failures stay INCONCLUSIVE and actionable.
- Focused tests, full unit suite, typecheck, build, pack check, and at least one real Chromium 83 or 85 CLI run pass.
- No commit or push is performed without explicit user instruction.

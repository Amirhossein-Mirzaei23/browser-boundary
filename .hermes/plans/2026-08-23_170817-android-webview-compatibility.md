# Android WebView Compatibility Support Implementation Plan

> **For Hermes:** Implement this plan task-by-task using strict red-green-refactor TDD. Do not add real/historical Android WebView execution in the first milestone. Do not commit unless the user asks.

**Goal:** Add an additive Android WebView identification and compatibility-modeling layer that treats Android WebView as a Chromium/Blink-based runtime target, not as a fourth rendering engine and not as desktop Chrome.

**Architecture:** Preserve the existing executable scan API and its `chromium | firefox | webkit` engine-family selectors unchanged. Add a separate public runtime-profile layer in which `android-webview` maps to Blink/Chromium compatibility data with explicit provenance, confidence, and WebView-specific capability overrides. The first milestone identifies and models WebView versions; it must not launch desktop Chromium and label that execution as Android WebView.

**Tech stack:** TypeScript, Node.js built-in test runner, existing project modules, small in-repository UA parser, existing Chromium feature data. No new runtime dependency is recommended for milestone 1.

---

## Scope and Non-Goals

Initial scope:

- Identify canonical Android WebView user agents and distinguish them from Android Chrome and desktop Chrome.
- Normalize the WebView/Chromium version exposed in the UA or explicitly supplied by an API caller.
- Produce a compatibility profile containing separate runtime, rendering-engine, and WebView-capability dimensions.
- Reuse existing Chromium compatibility information only as a Blink baseline, with a result that does not claim full WebView runtime compatibility.
- Expose the model through an additive TypeScript API and a non-executing CLI identification command.
- Preserve every existing scan, provider, controller, report, and public type contract.

Not in milestone 1:

- Launching an Android emulator, APK, or `android.webkit.WebView` host app.
- Treating a historical desktop Chromium binary as a historical WebView binary.
- Adding `android-webview` to `EngineName`, `ScanConfig.engines`, or `--engines`.
- Claiming that a desktop Chromium scan is proof of WebView compatibility.
- Building or maintaining a complete Chromium-to-WebView APK/revision archive.
- Replacing capability detection in application code with UA sniffing.

## Repository Inspection Basis

The plan was prepared against `main` at `3c35222`. Repository inspection covered source, tests, CLI, public declarations, examples, reports, configuration, package metadata, CI, and relevant Git history.

Baseline verification observed during inspection:

- `npm test`: 177/177 unit tests passed.
- `npm run typecheck`: passed.
- Working tree was clean before the plan file was created.

Relevant external sources:

- Chrome WebView overview: https://developer.chrome.com/docs/webview
- Chromium Android WebView source/docs: https://chromium.googlesource.com/chromium/src/+/HEAD/android_webview/
- Chromium WebView platform-compatibility policy: https://chromium.googlesource.com/chromium/src/+/HEAD/android_webview/docs/web-platform-compatibility.md
- Android `WebSettings` UA customization: https://developer.android.com/reference/android/webkit/WebSettings
- Android current WebView package/version guidance: https://developer.android.com/develop/ui/views/layout/webapps/managing-webview
- AndroidX runtime feature checks: https://developer.android.com/reference/androidx/webkit/WebViewFeature
- WebView UA reduction announcement: https://android-developers.googleblog.com/2024/12/user-agent-reduction-on-android-webview.html
- MDN BCD WebView Android metadata: https://github.com/mdn/browser-compat-data/blob/main/browsers/webview_android.json
- UAParser/uap-core recognition rules, used only as corroboration: https://github.com/ua-parser/uap-core/blob/master/regexes.yaml

The external facts and recommendations below should be rechecked when implementation starts because UA-reduction and release metadata can evolve.

---

# 1. Current Architecture

## 1.1 Public model and terminology

`src/reporting/types.ts:12-13` defines the public `EngineName` as:

- `chromium`
- `firefox`
- `webkit`

Despite its name, this union currently serves several roles at once:

- executable scan selector;
- browser-provider routing key;
- controller engine key;
- feature-database key;
- report grouping key;
- Browserslist recommendation key.

It is therefore closer to an existing scan/acquisition family than a clean rendering-engine taxonomy. There is no separate runtime/browser-target type, and no Blink or Gecko type.

`src/reporting/types.ts:42` defines only two version semantics:

- `real-major`
- `playwright-revision`

The result model (`CheckResult`, `EngineSummary`, `ScanResult`) has `engine` and `version`, but no separate runtime, runtime version, engine version, detection confidence, or capability provenance.

## 1.2 Configuration and CLI

`src/config/schema.ts:31-120` defines `ScanConfig`. Its selection surface is `engines?: EngineName[]` and its search maps (`floor`, `explicitVersions`) are keyed by `EngineName`.

`src/config/schema.ts:122-143` defines defaults:

- default engines: Chromium, Firefox, WebKit;
- Chromium floor: 67;
- Firefox floor: 60 for boundary search, while explicit validation permits 52;
- WebKit floor: 13, but WebKit is current-only in practice.

The Chromium 67 floor is derived from the repository's executable historical-browser architecture, not from an Android WebView support policy.

`src/config/resolve.ts:142-146` and `src/cli/options.ts:185-199` duplicate the valid-engine list. Adding WebView there would make it an engine and route it into binary execution, which violates the required architecture.

The CLI is a thin layer over `scan()` (`src/cli/index.ts:49-99`). Existing commands are scan-by-default, `install`, `help`, and `version`. Exact versions use one `--engines` value plus `--versions` or `--exact-version` (`src/cli/options.ts:201-233`).

There is no `--browser`, `--runtime`, `--target`, UA input, UA parsing, mobile/device selector, Android selector, or non-executing compatibility-profile command.

## 1.3 Browser providers and historical version handling

The provider contract is engine-keyed:

- `BrowserBinary`: `src/browsers/types.ts:28-42`
- `BrowserVersion`: `src/browsers/types.ts:45-50`
- `BrowserProvider`: `src/browsers/types.ts:52-69`

`DefaultBrowserProvider.for()` in `src/browsers/provider.ts:25-33` routes:

- `chromium` to `ChromiumProvider`;
- `firefox` to `FirefoxProvider`;
- `webkit` to `WebKitProvider`.

`ChromiumProvider` (`src/browsers/chromium-provider.ts`) provides desktop/host Chromium-family executables:

- current Playwright-managed Chromium;
- Chrome for Testing for majors 113+;
- Chromium continuous snapshots for older majors;
- matching or audited ChromeDriver paths for historical snapshots.

It validates the launched binary's actual major (`verifyChromiumMajor`, `src/browsers/chromium-provider.ts:412-435`) and follows an honesty contract: unavailable versions become inconclusive, never substituted.

This code is reusable as Chromium/Blink version knowledge and as an example of honest version attribution. It is not an Android WebView provider and must not be reused to claim WebView execution.

## 1.4 Automation controllers

`AutomationController` and `ControllerSession` live in `src/controllers/types.ts:50-80`. `controllerFor()` selects Playwright or WebDriver from `BrowserBinary.controller`.

`PlaywrightController` (`src/controllers/playwright.ts`) launches host browser types. Its Chromium branch adds desktop/container arguments and creates a normal Playwright browser context and page.

`WebDriverController` (`src/controllers/webdriver.ts`) supports Firefox and Chromium desktop binaries with geckodriver/ChromeDriver. It has no Android, emulator, Appium, ADB, package, activity, device, or WebView-context handling.

Consequently, the current controller architecture cannot naturally execute Android WebView. Treating `android-webview` as a provider alias for `ChromiumProvider` would produce mislabeled evidence.

## 1.5 Scanner and compatibility checks

`BrowserCompatibilityScanner` in `src/core/scanner.ts` orchestrates:

`ScanConfig -> resolveConfig -> provider.getLatest/install -> versionRange/searchBoundary -> runCheckWithRetry -> result aggregation`.

The scanner loops over `cfg.engines` (`src/core/scanner.ts:60`) and obtains binaries by engine. `probe()` (`src/core/scanner.ts:218-259`) attributes every result to the requested engine/version.

`searchBoundary()` in `src/core/version-search.ts` is engine-agnostic and reusable for any genuinely executable target. Its honesty contract is important: it reports only observed points and does not infer untested ranges.

`runCheck()` in `src/core/compatibility-checker.ts` collects navigation, JS, console, network, rendering, and readiness signals. Artifacts use `${engine}-${version}-${page.label}` (`src/core/compatibility-checker.ts:54`), which would collide if Chrome/Chromium and WebView shared engine/version without a runtime dimension.

Milestone 1 should not change this execution pipeline. A future WebView executor will need target-aware artifact names and lifecycle semantics.

## 1.6 Compatibility data and rules

`src/analysis/feature-database.ts` contains a small static `FEATURE_TABLE`. `FeatureRow.minVersions` is keyed by the existing `EngineName`; Chromium values currently stand in for Chromium/Blink support thresholds.

`src/analysis/error-analyzer.ts:37-63` matches observed errors to this table and formats engine minimums. `aggregateFeatureFindings()` also iterates the three existing names.

The database is not a general static compatibility query service. It recognizes likely causes after a real run. It has no browser-runtime overrides and no Android/WebView capability table.

The reusable part is the Chromium minimum as a Blink baseline. The non-reusable assumption is that one Chromium number completely describes every Chromium-based runtime.

## 1.7 Reporting

`src/reporting/markdown.ts` hard-codes output order as Chromium, Firefox, WebKit (`:33`) and maps them to Browserslist `chrome`, `firefox`, and `safari` (`:124-132`). It explicitly handles the WebKit-versus-Safari distinction.

That WebKit honesty precedent is useful: a Playwright WebKit revision is not called a Safari version. Android WebView should receive the same strict provenance treatment: a Blink-compatible baseline is not a real WebView execution result.

Existing JSON output serializes `ScanResult` directly (`src/reporting/json.ts`). Adding required fields to existing result types would be a public API break; milestone 1 should use a separate runtime-profile output type.

## 1.8 Tests and documentation

Unit tests use Node's built-in test runner via `npm test` (`package.json:52`). Integration fixtures run through Playwright (`tests/integration/fixtures.test.ts`).

Relevant regression suites include:

- `tests/unit/cli-options.test.ts`
- `tests/unit/config.test.ts`
- `tests/unit/providers.test.ts`
- `tests/unit/chromium-provider.test.ts`
- `tests/unit/chromium-snapshots.test.ts`
- `tests/unit/chromedriver-matrix.test.ts`
- `tests/unit/webdriver-controller.test.ts`
- `tests/unit/version-search.test.ts`
- `tests/unit/reporting.test.ts`
- `tests/unit/exact-version-lifecycle.test.ts`

`README.md` is the main user documentation. It repeatedly promises real binaries and no UA spoofing, documents Chromium 67-current, Firefox 52-current, WebKit current-only, CLI/API usage, and device-cloud limitations. `CHANGELOG.md` records public behavior changes. Examples are TypeScript programs under `examples/`.

No Android, mobile-browser, WebView, UA detector, emulator, ADB, or Appium implementation exists. The only mobile-like setting is a configurable viewport; it does not create a mobile runtime.

---

# 2. Current Gaps

1. No separation between rendering engine and browser/runtime target.
2. No `Blink` or `Gecko` representation; the current `EngineName` combines engine family, executable provider, and reporting identity.
3. No `android-webview` runtime/target name.
4. No UA or User-Agent Client Hints input model.
5. No Android WebView detector.
6. No distinction between Android Chrome and Android WebView.
7. No detection confidence, evidence, or false-positive/false-negative metadata.
8. No normalized full-version/major-version representation for WebView.
9. No compatibility-profile API that distinguishes runtime version from Blink/Chromium baseline version.
10. No WebView-specific capability/override registry.
11. No compatibility result state meaning “Blink-compatible but not WebView-runtime-verified.”
12. No maintained Android WebView release metadata in the repository.
13. No CLI command for identifying/modeling a supplied runtime without launching it.
14. Existing `--engines` cannot accept WebView without incorrectly treating it as an engine and attempting desktop execution.
15. Existing report and artifact keys have no runtime dimension.
16. No Android emulator/device controller, WebView host APK, ADB lifecycle, WebView debugging, context selection, or package-version collection.
17. No WebView UA fixtures or detector tests.
18. No documentation explaining the difference between Chrome, Chromium, Blink, Android System WebView, and an app-embedded WebView.

---

# 3. Proposed Architecture

## 3.1 Architecture diagram

```text
Rendering engines                     Runtime / browser targets
─────────────────                     ─────────────────────────
Blink  <────────────────────────────  Chrome / Chromium scan family
  │
  └─────────────────────────────────  Android WebView
                                         │
                                         ├─ Blink compatibility baseline
                                         ├─ WebView-specific capabilities
                                         └─ host-app / Android / OEM constraints

Gecko  <─────────────────────────────  Firefox

WebKit <─────────────────────────────  Playwright WebKit
                                      (Safari remains a distinct browser claim)
```

Compatibility resolution for Android WebView:

```text
Input UA / explicit version
        │
        ▼
Android WebView identification
  runtime = android-webview
  confidence + evidence + limitations
        │
        ▼
Version normalization
  runtimeVersion = Chrome token/package version
  chromiumVersion = same observed build version
  renderingEngine = blink
  blinkVersion = normalized Chromium major
        │
        ▼
Blink baseline lookup
        │
        ├─ version below Blink minimum -> engine-incompatible
        │
        └─ version meets Blink minimum -> engine-compatible only
                                      │
                                      ▼
                         WebView capability override/constraint
                                      │
                                      ├─ verified override -> supported/unsupported
                                      └─ no override -> not-runtime-verified
```

## 3.2 Additive type model

Create a separate model rather than widening `EngineName`:

- `RenderingEngineName = 'blink' | 'gecko' | 'webkit'`
- `RuntimeTargetName = 'android-webview'` for milestone 1; the type should be extensible without pretending all existing scan engines have already been migrated.
- Canonical public target string: `android-webview`.
- Do not use bare `webview` as the canonical name because it is ambiguous across Android WebView, iOS WKWebView, Electron views, and Windows WebView2.
- A CLI-only alias `webview` is not recommended in milestone 1. If added later, normalize it immediately to `android-webview` and never serialize the alias.

Keep `EngineName` unchanged and document it as the legacy executable scan-family selector. Do not deprecate or rename it in this feature; such a migration would be larger than necessary.

Recommended new modules:

- `src/runtimes/types.ts`
- `src/runtimes/android-webview.ts`
- `src/runtimes/version.ts`
- `src/runtimes/compatibility.ts`
- `src/runtimes/webview-capabilities.ts`
- `src/runtimes/index.ts`

Recommended primary API concepts:

- `detectAndroidWebView(input)` — pure identification.
- `normalizeRuntimeVersion(value)` — pure version parser/normalizer.
- `createAndroidWebViewProfile(input)` — combines detection/version into a runtime profile.
- `evaluateAndroidWebViewCompatibility(profile, requirement)` — resolves Blink baseline plus WebView override with provenance.

No production function should require a live browser or Playwright page in milestone 1.

## 3.3 Identification contract

A detector result should include:

- canonical runtime target or `unknown`;
- `isAndroidWebView` boolean;
- confidence: `high | medium | low | unknown`;
- evidence codes, not only a free-form reason;
- raw full version if present;
- normalized major;
- rendering engine `blink` only when the Chromium/WebView evidence is valid;
- whether UA was default-like or appears customized;
- limitations/warnings.

Strong default-UA evidence:

1. Android platform marker.
2. Valid `Chrome/<major>[.<minor>...]` token.
3. `; wv)` marker.

Secondary legacy/default-like evidence:

- `Version/4.0` before the `Chrome/...` token on Android.

Recommended confidence:

- High: Android + `wv` + valid Chrome token.
- Medium: Android + `Version/4.0` + valid Chrome token but no `wv`.
- Unknown/not WebView: Android Chrome UA without `wv` or WebView-specific legacy pattern.
- Unknown: malformed or missing Chrome version, even if a `wv` token is present; preserve the WebView identity evidence but do not invent a version.

The parser must be bounded and deterministic. A small local parser is sufficient; no large dependency is justified for two stable marker families. Corroborate test cases against uap-core/UAParser behavior, but keep browser-boundary's result vocabulary and confidence rules explicit.

UA detection alone is not fully reliable:

- Apps can call `WebSettings.setUserAgentString()` and remove, add, or copy markers.
- A non-WebView client can spoof `wv`.
- Custom wrappers and in-app browsers may embed WebView while presenting an app-specific UA.
- UA reduction preserves the `wv` token for default UAs, but reduces OS/device and minor/build/patch details.
- UA Client Hints are available in WebView 116+ only when the default UA is used, and client hints do not eliminate custom-UA ambiguity.

Therefore detection is evidence with confidence, not authoritative proof. When native app integration is available, `WebView.getCurrentWebViewPackage()`/`WebViewCompat.getCurrentWebViewPackage()` and `PackageInfo.versionName` are stronger version evidence than a UA string.

## 3.4 CLI/API recommendation

Do not add either of these in milestone 1:

- `--engines android-webview`
- `--browser android-webview` on the existing scan command

The existing scan command means “launch and test the real requested runtime.” The repository cannot currently fulfill that promise for WebView. Accepting the flag and launching desktop Chromium would violate the package's central honesty contract.

Recommended additive API:

```text
identifyRuntime({ userAgent, clientHints? })
createAndroidWebViewProfile({ userAgent?, version?, nativePackageVersion? })
evaluateAndroidWebViewCompatibility(profile, requirement)
```

Recommended additive CLI command:

```text
browser-boundary identify --user-agent "<ua>" [--format json|text]
```

The output should say, for example, that the input is Android WebView, its observed WebView/Chromium major is 140, its rendering engine is Blink 140, and Blink-derived compatibility is not proof of WebView-specific behavior.

This command is explicitly identification/modeling, not a website scan. It should not accept URLs, create `ScanResult`, produce scan exit code 1, or write compatibility reports/artifacts.

If product requirements demand explicit target creation without a UA, support it in the API through `createAndroidWebViewProfile({ version: '140' })`. A future CLI may add a `profile --target android-webview --version 140` command, but that is optional and should not block the first milestone.

---

# 4. Data and Version Model

## 4.1 Verified runtime relationship

Android WebView is a distinct Android runtime/system component implemented on Chromium. Modern WebView and Chrome for Android share substantial Chromium/Blink code, but WebView has its own embedding layer, feature configuration, Android APIs, storage/profile behavior, permissions, lifecycle, network/header behavior, and host-app controls.

MDN BCD currently models `webview_android` as:

- name: `WebView Android`;
- type: mobile;
- upstream: `chrome_android`;
- modern releases using engine `Blink` with matching engine-major numbers.

This supports reusing Chromium/Blink web-platform baseline data, but not treating Chrome runtime behavior as complete WebView behavior.

## 4.2 Version fields

Recommended profile fields:

- `runtime: 'android-webview'`
- `runtimeVersion.raw: string | null`
- `runtimeVersion.major: number | null`
- `runtimeVersion.source: 'user-agent' | 'client-hints' | 'native-package' | 'explicit' | 'unknown'`
- `chromiumVersion.raw: string | null`
- `chromiumVersion.major: number | null`
- `renderingEngine: 'blink'`
- `engineVersion.major: number | null`
- `versionConfidence`
- `warnings: string[]`

For canonical modern WebView UAs, the `Chrome/x.y.z.w` token identifies the underlying Chromium/WebView build. `Version/4.0` is a compatibility marker and must never be exposed as WebView version 4.0.

When the version comes from `WebView.getCurrentWebViewPackage()` or `WebViewCompat.getCurrentWebViewPackage()`, preserve the full package `versionName` and derive its major. That source should outrank UA and client hints if values conflict, while retaining a mismatch warning.

## 4.3 Are WebView and Chromium versions interchangeable?

They are aligned enough for a baseline in modern releases: the installed WebView package version and the UA's Chrome token identify the Chromium milestone from which WebView is built, and BCD records matching Blink engine majors for modern WebView releases.

They must still be represented independently because:

- runtime identity is Android WebView, not Chromium or Chrome;
- the WebView package can update independently of the host application;
- Android 7-9 may use a Chrome APK as the WebView provider but still does not turn embedded WebView into the Chrome browser runtime;
- OEM/AOSP providers can differ;
- host app settings and Android permissions affect capabilities;
- a custom UA can claim a version different from the installed package;
- Chrome-specific product features are absent from WebView;
- WebView intentionally has platform divergences documented by Chromium.

The mapping rule for a trustworthy modern observation is therefore:

```text
observed WebView package/UA Chromium major N
  -> runtime android-webview N
  -> Chromium milestone N
  -> Blink baseline N
```

This is a same-build relationship with separate semantic fields, not a statement that the runtimes are interchangeable.

## 4.4 Normalization

Rules:

1. Preserve raw input.
2. Accept one to four numeric components, with no signs, exponents, whitespace inside components, or negative values.
3. Normalize the major as an integer.
4. Do not coerce malformed strings, `latest`, `current`, empty strings, or partial nonnumeric tokens into a version.
5. Treat a reduced `Chrome/140.0.0.0` UA as reliable for major 140 but not for exact patch/build comparison.
6. If client hints provide full version information, preserve it as a separate source; do not silently overwrite conflicting UA data.
7. If native package version, client hints, and UA disagree, select source precedence explicitly and emit all mismatches.
8. Unknown version retains detected runtime identity but yields unknown compatibility.

## 4.5 Compatibility states

Do not return a plain boolean when using inherited Blink data. Recommended statuses:

- `supported` — a WebView-specific rule or real WebView evidence establishes support.
- `unsupported` — a WebView-specific rule establishes absence/constraint.
- `engine-compatible` — Blink baseline meets the requirement, but WebView runtime support is not separately verified.
- `engine-incompatible` — the underlying Blink version predates the feature baseline.
- `unknown` — missing/invalid version, missing baseline data, conflicting evidence, or unresolved runtime capability.

Every result should carry:

- source/provenance: `webview-override | chromium-baseline | observed-webview | unknown`;
- runtime target and version;
- Blink/Chromium baseline version;
- caveat explaining that Chrome/Blink compatibility does not guarantee WebView runtime compatibility.

## 4.6 WebView-specific capability data

Create a small explicit override registry, not a complete fork of `FEATURE_TABLE`. Entries should exist only for sourced, known WebView-specific differences and contain:

- stable capability identifier;
- affected WebView version range when known;
- status or constraint;
- source URL;
- notes about Android API level, host permission, app setting, or AndroidX requirement;
- date/source version reviewed.

Keep these categories distinct:

1. Web-platform feature baseline inherited from Blink.
2. WebView embedding/runtime capability.
3. Android framework/AndroidX API capability.
4. Host-application configuration or permission.

For example, `WebViewFeature.isFeatureSupported()` is a native runtime feature check and must not be conflated with a JavaScript Web API support threshold.

## 4.7 Dataset and dependency decision

No maintained milestone mapping dataset is required merely to parse a canonical modern UA: the Chrome token already exposes the Chromium/WebView build major.

Do not add `ua-parser-js` solely for WebView detection in milestone 1. It is broader than needed and would not solve custom-UA spoofing or source-confidence semantics.

Do not add all of `@mdn/browser-compat-data` solely for release validation in milestone 1. It is valuable authoritative metadata but much larger than the detector needs. Prefer:

- a small parser with realistic fixtures;
- documented source links;
- optionally a tiny reviewed metadata file only if implementation needs a stable supported-range assertion;
- a future build/update script if broader BCD-backed feature support becomes a product requirement.

Browserslist/caniuse-lite is not a reliable WebView runtime identity source. Browserslist commonly exposes Android Chrome as `and_chr`; it should not be used to pretend that Android WebView and Android Chrome are the same target. The generated Browserslist recommendation in `src/reporting/markdown.ts` should remain unchanged in milestone 1.

## 4.8 Version support policy

Do not reuse the Chromium executable floor of 67 as a detector floor. That floor describes what this repository can currently download and launch on the host, not which Android WebView UAs can be identified.

Recommended policy:

- Identification: no arbitrary floor. Parse any syntactically valid WebView version and report what was observed.
- Blink inheritance: available when the observed WebView release has a trustworthy Chromium/Blink milestone. For the modern version-numbered line, use the observed major directly.
- Legacy Android 4.4: treat specially. BCD uses Android/WebView release labels such as 4.4 with Blink engine versions 30/33; do not force these into a fake WebView major 4.
- Initial compatibility guarantee: document modern Chromium-based WebView only. The exact minimum should be derived from the first release for which the implementation's fixture/data policy can establish direct major alignment, not copied from desktop acquisition code.
- Execution support: none in milestone 1.

Before coding a hard range, maintainers must choose one of these policies:

A. Recommended: no hard detector range; profile any valid major and mark unsupported/unverified data as `unknown`.
B. Stricter: publish a reviewed metadata range sourced from MDN BCD and update it with releases.

Policy A avoids creating a continuously stale release table and best matches the existing honesty principle.

---

# 5. Implementation Tasks

## Task 1: Freeze the public contracts and terminology with type-level tests

**Objective:** Establish the additive engine/runtime/version/result vocabulary without changing existing `EngineName` behavior.

**Files/modules likely affected:**

- Create `src/runtimes/types.ts`
- Create `tests/unit/runtime-types.test.ts`
- Later export through `src/runtimes/index.ts` and `src/index.ts`

**Implementation details:**

- Define `RenderingEngineName` with Blink, Gecko, and WebKit.
- Define canonical `RuntimeTargetName` for `android-webview`.
- Define detection confidence/evidence types, version source, normalized version, runtime profile, compatibility status, and provenance.
- Keep `EngineName` in `src/reporting/types.ts` unchanged.
- Do not add required fields to `CheckResult`, `EngineSummary`, `ScanResult`, `BrowserBinary`, or `ScanConfig`.
- Document in type comments that existing `EngineName` is the executable scan-family key and the new rendering-engine type is the semantic engine model.

**Dependencies:** None.

**Tests required:**

- Compile-time/type assertions that `android-webview` is a runtime target.
- Compile-time/type assertions that it is not assignable to existing `EngineName`.
- Runtime serialization fixture showing separate `runtime`, `renderingEngine`, `runtimeVersion`, and `engineVersion`.

**Acceptance criteria:**

- Existing consumers compiling against `EngineName` see no changed union members.
- New public model can represent Android WebView over Blink without calling it an engine.
- Focused test fails before implementation and passes afterward.

## Task 2: Add realistic Android WebView and Chrome UA fixtures

**Objective:** Establish a reviewed, reusable fixture corpus before implementing detection.

**Files/modules likely affected:**

- Create `tests/fixtures/user-agents/android-webview.json`
- Create `tests/fixtures/user-agents/non-webview-chrome.json`
- Create `tests/unit/android-webview-detection.test.ts`

**Implementation details:**

Include sourced/realistic fixtures for:

- Android 5-era WebView with `wv`, `Version/4.0`, and Chrome 43.
- Several modern versions, including 67, 80, 100, 116, 140, and current project-era examples.
- Android tablet and phone forms.
- Reduced UA with generic `Linux; Android 10; K; wv` and `Chrome/N.0.0.0`.
- Android Chrome UA with no `wv`.
- Desktop Chrome UA.
- Chromium UA.
- malformed Chrome token;
- `wv` with no version;
- `Version/4.0` with no Chrome token;
- custom UA that removes WebView markers;
- spoofed/custom UA that adds `wv`;
- app-specific suffix after the normal WebView UA.

Each fixture should record expected runtime identity, confidence, raw/full version, major, and warnings. Record source URLs or provenance in fixture metadata/comments.

**Dependencies:** Task 1.

**Tests required:** All fixtures are loaded and validated by one table-driven test, which initially fails because the detector does not exist.

**Acceptance criteria:**

- Android Chrome and desktop Chrome negative fixtures are present.
- At least one reduced-UA fixture proves major-only handling.
- Custom-UA ambiguity is represented as a limitation rather than hidden.

## Task 3: Implement the pure Android WebView detector

**Objective:** Identify default-like Android WebView UAs with explicit confidence and evidence while avoiding Chrome false positives.

**Files/modules likely affected:**

- Create `src/runtimes/android-webview.ts`
- Modify `tests/unit/android-webview-detection.test.ts`

**Implementation details:**

- Require an Android marker for Android WebView classification.
- Parse a bounded `Chrome/<version>` token.
- Give `wv` the strongest WebView marker status.
- Recognize the legacy/default-like `Version/4.0 ... Chrome/...` pattern at lower confidence.
- Ensure ordering classifies WebView before generic Chrome if a future general runtime detector is added.
- Return evidence codes such as `android-platform`, `wv-marker`, `version-4-marker`, `chrome-version`, `custom-or-ambiguous`.
- Never treat `Version/4.0` as the runtime version.
- Never mutate or globally cache regex state.
- Do not infer native package identity, Android API level, device model, OEM, or host app.

**Dependencies:** Tasks 1-2.

**Tests required:**

- High-confidence canonical WebView.
- Medium-confidence legacy form.
- Android Chrome false-positive regression.
- Desktop Chrome false-positive regression.
- malformed/unknown version.
- custom and spoofed marker behavior.
- app-specific suffix preservation.

**Acceptance criteria:**

- Canonical WebView fixtures are identified.
- Android Chrome and desktop Chrome fixtures are not identified as WebView.
- Every positive result contains evidence and confidence.
- Missing version never becomes version 0, 4, latest, or current.

## Task 4: Implement version normalization and source precedence

**Objective:** Represent WebView, Chromium, and Blink versions separately without losing their modern same-build relationship.

**Files/modules likely affected:**

- Create `src/runtimes/version.ts`
- Create `tests/unit/runtime-version.test.ts`
- Modify `src/runtimes/android-webview.ts`

**Implementation details:**

- Parse valid numeric version forms and preserve raw values.
- Normalize the major.
- Represent precision so `140.0.0.0` from a reduced UA is not treated as an exact patch build.
- Support evidence inputs from UA, optional client hints, explicit API value, and native package version.
- Apply documented precedence: native package > client hints full version > explicit value (when caller intentionally chooses it) > UA; if the product team prefers explicit over native, decide before coding and document it.
- Preserve conflicts as warnings with both values.
- Map a trustworthy modern WebView major N to separate Chromium N and Blink N fields.
- Add a legacy-state path for Android 4.4 where WebView release label and Blink engine version are not the same numbering scheme.

**Dependencies:** Tasks 1 and 3.

**Tests required:**

- one-, two-, three-, and four-component versions;
- reduced UA precision;
- invalid, empty, negative, exponent, `latest`, and mixed versions;
- missing version;
- native/UA agreement;
- native/UA mismatch;
- full version and major preservation;
- legacy release-label handling.

**Acceptance criteria:**

- Users can see both WebView runtime version and Blink baseline version.
- Matching majors do not collapse semantic fields into one property.
- Unknown/conflicting versions produce no compatibility claim.

## Task 5: Build the Android WebView runtime profile

**Objective:** Combine detector and version evidence into one stable public profile.

**Files/modules likely affected:**

- Modify `src/runtimes/android-webview.ts`
- Create `tests/unit/android-webview-profile.test.ts`

**Implementation details:**

- Provide `createAndroidWebViewProfile()` for UA-driven and explicit/native-driven inputs.
- Set `runtime: android-webview` and `renderingEngine: blink` only when identity/version evidence warrants it.
- Include separate `chromiumVersion` and `engineVersion` values.
- Include warnings for custom UA, missing exact version, source mismatch, and detection uncertainty.
- Keep the function pure; callers supply all information.
- Do not reach into `navigator`, process environment, ADB, or Android APIs from Node.

**Dependencies:** Tasks 3-4.

**Tests required:**

- canonical UA profile;
- explicit version profile without UA;
- native package profile;
- uncertain identity;
- detected WebView with unknown version;
- conflict propagation.

**Acceptance criteria:**

- The profile accurately represents runtime and engine as separate concepts.
- It is possible to model WebView 140 / Chromium 140 / Blink 140 without saying Chrome 140 was executed.

## Task 6: Add Blink-baseline compatibility resolution

**Objective:** Reuse existing Chromium feature thresholds without treating them as complete WebView guarantees.

**Files/modules likely affected:**

- Create `src/runtimes/compatibility.ts`
- Create `tests/unit/android-webview-compatibility.test.ts`
- Reuse `src/analysis/feature-database.ts` without changing its public shape in milestone 1

**Implementation details:**

- Add an adapter that reads the existing `FeatureRow.minVersions.chromium` as a Blink baseline for an Android WebView profile.
- Do not rename `FeatureRow.minVersions.chromium` in this milestone; that would ripple through public `FeatureFinding` output and reporters.
- Return `engine-incompatible` below the threshold.
- Return `engine-compatible`, not `supported`, when the Blink threshold is met and no WebView-specific evidence exists.
- Return `unknown` for unknown versions or missing feature data.
- Include provenance and a standard caveat.
- Do not change observed scan verdicts (`pass`, `fail`, etc.); this is a separate static/modeling result type.

**Dependencies:** Task 5.

**Tests required:**

- WebView 79 versus optional chaining baseline 80 -> engine-incompatible.
- WebView 80 versus optional chaining -> engine-compatible, not fully supported.
- unknown WebView version -> unknown.
- feature with no Chromium baseline -> unknown.
- existing `matchFeature()` and report behavior unchanged.

**Acceptance criteria:**

- Existing Chromium data is reused without duplication.
- No compatibility result equates passing a Chrome threshold with guaranteed WebView runtime support.

## Task 7: Add a sourced WebView capability override registry

**Objective:** Represent known WebView-specific behavior separately from Blink compatibility.

**Files/modules likely affected:**

- Create `src/runtimes/webview-capabilities.ts`
- Create `tests/unit/webview-capabilities.test.ts`
- Modify `src/runtimes/compatibility.ts`

**Implementation details:**

- Define the registry schema first; add only a minimal number of well-sourced entries needed to prove override mechanics.
- Require each entry to state whether it is a web-exposed feature, AndroidX/native API, host setting, permission, or product feature.
- Require source URL and applicability notes.
- Ensure WebView override results take precedence over inherited Blink baseline.
- For host-dependent capabilities, return `unknown` or `conditional`, not an unconditional supported status. If `conditional` is added, include it in Task 1's status union before implementation.
- Do not encode Chrome product features such as Sync as web-platform compatibility failures; classify them as runtime/product capabilities.

**Dependencies:** Task 6.

**Tests required:**

- explicit supported/unsupported override precedence;
- conditional host-setting capability;
- version-range applicability;
- unknown capability fallback to Blink baseline;
- source/provenance included in every override result.

**Acceptance criteria:**

- WebView-specific data is not added to `FEATURE_TABLE` as though it were a fourth engine column.
- Users can distinguish Blink support from WebView runtime constraints.

## Task 8: Export the additive API without changing scan behavior

**Objective:** Make the runtime model publicly usable while preserving all existing public exports.

**Files/modules likely affected:**

- Create `src/runtimes/index.ts`
- Modify `src/index.ts`
- Modify `tsup.config.ts` only if a separate package subpath is deliberately chosen; otherwise no build-config change is needed
- Create `tests/unit/public-api.test.ts`

**Implementation details:**

- Export runtime types and pure functions from the package root.
- Keep all current exports in `src/index.ts` intact.
- Do not add `android-webview` to `EngineName`, `DEFAULTS.engines`, provider routing, or controller switches.
- Build both ESM and CJS declarations and inspect `dist/index.d.ts` after `npm run build` during implementation.

**Dependencies:** Tasks 1-7.

**Tests required:**

- Import public APIs from `src/index.ts` in source tests.
- Package/build smoke test for ESM/CJS declarations.
- Type regression for existing `scan({ engines: ['chromium'] })`.

**Acceptance criteria:**

- Existing source and generated declaration contracts remain valid.
- New WebView API is additive and tree-shakeable.

## Task 9: Add a non-executing CLI identification command

**Objective:** Let CLI users identify/model a WebView UA without implying that browser-boundary executed WebView.

**Files/modules likely affected:**

- Modify `src/cli/options.ts`
- Modify `src/cli/index.ts`
- Create or extend CLI output helper under `src/cli/` if needed
- Modify `tests/unit/cli-options.test.ts`
- Create `tests/unit/cli-identify.test.ts`

**Implementation details:**

- Add `identify` as a command following existing command parsing conventions.
- Add required `--user-agent <string>` and optional `--format text|json`.
- Reject scan URL/search/engine/version flags when used with `identify` if they would be silently ignored.
- Print runtime, observed version, Chromium/Blink baseline, confidence, evidence, and limitations.
- Use configuration exit code 2 for missing/malformed command input.
- Identification success should return exit code 0 even when the runtime is unknown; unknown detection is data, not infrastructure failure. If maintainers want a nonzero “not WebView” code, decide and document it before coding.
- Do not add `android-webview` to `--engines` help.

**Dependencies:** Tasks 5 and 8.

**Tests required:**

- parse valid identify command;
- missing UA;
- JSON output shape;
- text output warnings;
- Android Chrome result is not WebView;
- existing scan, install, help, and version command parsing unchanged;
- `--engines android-webview` still fails with an explanation that WebView is a runtime target, not an executable engine.

**Acceptance criteria:**

- CLI users can inspect a UA explicitly.
- No browser is launched.
- Existing scan CLI remains backward compatible.

## Task 10: Add full regression and package validation

**Objective:** Prove Android WebView additions do not alter Chrome/Chromium, Firefox, WebKit, scan, or reporting behavior.

**Files/modules likely affected:**

- Existing regression suites listed below
- Possibly create `tests/unit/runtime-regression.test.ts`

**Implementation details:**

Run and retain assertions covering:

- `DEFAULTS.engines` remains exactly `chromium, firefox, webkit`.
- Existing `EngineName` union remains unchanged.
- Existing Chromium provider routes and support floor remain unchanged.
- Chrome-for-Testing and snapshot tests remain unchanged.
- Firefox historical support remains unchanged.
- WebKit remains current-only and not called Safari.
- Browserslist recommendation output remains unchanged.
- Existing report JSON shape remains unchanged for scans.
- Existing CLI flags and exit codes remain unchanged.

**Dependencies:** Tasks 1-9.

**Tests required:**

- `npm test`
- `npm run typecheck`
- `npm run build`
- `npm run pack-check`
- `npm run test:fixtures` if CLI/controller/detection integration changes touch shared paths

**Acceptance criteria:**

- All existing tests remain green.
- No generated scan reports or downloaded artifacts are committed.
- Package contents include new public declarations and required fixture-independent runtime code.

## Task 11: Document semantics, support range, and limitations

**Objective:** Explain exactly what milestone 1 does and does not prove.

**Files/modules likely affected:**

- Modify `README.md`
- Modify `CHANGELOG.md`
- Optionally create `docs/android-webview.md` only if maintainers want to split the already large README; if created, ensure `package.json.files` includes `docs` or link to repository-hosted docs knowingly
- Add/update an example under `examples/` only if it adds value beyond CLI docs

**Implementation details:** See Documentation Plan below.

**Dependencies:** Tasks 1-10 so documentation matches the implemented API.

**Tests required:**

- README command examples checked against actual `--help` output.
- Public names checked against generated `.d.ts`.
- Optional documentation link checker if the project adopts one; do not add a dependency only for this feature.

**Acceptance criteria:**

- Documentation never says WebView is a fourth engine.
- Documentation never says Chrome compatibility guarantees WebView compatibility.
- Documentation never implies historical WebView was executed.

---

# 6. Test Plan

## 6.1 Unit tests

### UA identification

Table-driven tests should cover:

- canonical `wv` WebView UAs;
- legacy/default-like `Version/4.0` pattern;
- reduced UAs;
- multiple WebView versions;
- invalid and missing versions;
- custom UA ambiguity;
- spoofed markers;
- case and token-boundary handling;
- excessively long/malformed input without catastrophic regex behavior.

### Version normalization

Cover valid precision, invalid syntax, major extraction, reduced-UA precision, source precedence, mismatches, and unknown values.

### Compatibility model

Cover Blink threshold below/equal/above, missing data, unknown runtime version, WebView override precedence, host-conditional capabilities, and provenance/caveats.

### Public types

Prove `android-webview` is a runtime and is not accepted as `EngineName`.

## 6.2 Integration tests

Milestone 1 does not need an Android emulator. Integration means composing real parser/profile/compatibility modules:

1. Realistic UA fixture.
2. Runtime profile creation.
3. Existing Chromium feature threshold lookup.
4. WebView compatibility result with correct status and provenance.

Do not add a Playwright project with only mobile emulation and call it WebView; viewport/device emulation is not runtime execution.

## 6.3 CLI tests

Use the existing `spawnSync(process.execPath, ['--import', 'tsx', 'src/cli/index.ts', ...])` style from `tests/unit/cli-options.test.ts`.

Cover:

- valid text output;
- valid JSON output;
- missing UA configuration error;
- unknown/non-WebView UA output;
- incompatible scan flags;
- unchanged scan command parsing and exit-code behavior.

## 6.4 API tests

Import from `src/index.ts`, not only internal modules. Verify the public API can:

- identify a WebView;
- expose runtime and Blink separately;
- preserve full and major versions;
- produce `engine-compatible` rather than unconditional `supported` from Chromium data;
- create a profile from native package/explicit version evidence.

## 6.5 Regression tests

Explicitly rerun and preserve:

- `tests/unit/chromium-provider.test.ts`
- `tests/unit/chromium-snapshots.test.ts`
- `tests/unit/chromedriver-matrix.test.ts`
- `tests/unit/firefox-provider.test.ts`
- `tests/unit/providers.test.ts`
- `tests/unit/config.test.ts`
- `tests/unit/cli-options.test.ts`
- `tests/unit/reporting.test.ts`
- `tests/unit/version-search.test.ts`
- `tests/unit/webdriver-controller.test.ts`
- `tests/unit/exact-version-lifecycle.test.ts`

## 6.6 Fixture provenance

Every UA fixture should identify one of:

- official documented format;
- captured real-world UA with identifying app/device data sanitized;
- deliberately synthetic negative/spoof case.

Do not present synthetic UAs as observed devices.

## 6.7 Optional dependency evaluation test

Before adding any UA dependency, run a short spike comparing its output against the fixture corpus, package size, license, ESM/CJS behavior, and client-hints support. The default decision is no dependency. Keep the spike out of production unless it demonstrates a material accuracy/maintenance advantage.

---

# 7. Documentation Plan

Update `README.md` with:

1. **Architecture terminology**
   - Blink, Gecko, WebKit are rendering engines.
   - Chrome/Chromium scan family, Firefox, Playwright WebKit, and Android WebView are runtimes/targets or executable families.
   - Explain why legacy `EngineName` remains unchanged for compatibility.

2. **What Android WebView support means**
   - identification and compatibility modeling in milestone 1;
   - no real WebView execution;
   - no UA spoofing used to claim execution.

3. **Chrome versus Android WebView**
   - common Chromium/Blink baseline;
   - separate embedding runtime;
   - missing Chrome product features;
   - host settings, permissions, Android APIs, update lifecycle, OEM/provider differences.

4. **UA detection**
   - canonical `wv` marker;
   - `Version/4.0` is not the WebView version;
   - Chrome token/package version semantics;
   - custom UA false negatives and spoof false positives;
   - UA reduction and major-only precision;
   - client-hints limitation.

5. **Compatibility calculation**
   - `engine-incompatible`, `engine-compatible`, WebView override, and unknown states;
   - why Blink/Chrome compatibility is necessary but not sufficient.

6. **Supported versions**
   - identification has no arbitrary desktop-execution floor;
   - modern direct-major mapping policy;
   - legacy Android 4.4 special case;
   - no executable WebView range in milestone 1.

7. **CLI**
   - `browser-boundary identify --user-agent ...`;
   - output examples;
   - clarify that `--engines android-webview` is intentionally unsupported.

8. **API**
   - detector, profile, compatibility evaluator examples;
   - native package version as stronger evidence when supplied by an Android host.

9. **Limitations and future execution**
   - Android emulator/device and host APK requirements;
   - package/version pinning challenges;
   - Appium/UiAutomator/WebDriver/CDP options;
   - OEM and Android version matrix.

Update `CHANGELOG.md` under Unreleased with additive API/CLI support and explicit non-execution semantics.

If a dedicated `docs/android-webview.md` is introduced, either add `docs` to `package.json.files` so npm users receive it or keep essential guidance in README. Do not create an unpublished doc and link to it from the npm README without checking package contents.

---

# 8. Backward Compatibility

## 8.1 Required invariants

The implementation must leave these unchanged:

- `EngineName = 'chromium' | 'firefox' | 'webkit'`.
- `ScanConfig.engines` type and defaults.
- `--engines` accepted values.
- `--versions` and `--exact-version` behavior.
- Chromium 67-current executable policy.
- Chromium provider, cache, snapshot, CFT, and ChromeDriver behavior.
- Firefox provider and geckodriver behavior.
- WebKit current-only behavior and Playwright-revision labeling.
- `CheckResult`, `EngineSummary`, `ScanResult`, and existing JSON/Markdown scan shapes.
- Existing feature-table values and `FeatureFinding` output.
- Existing Browserslist recommendations.
- Existing CLI exit codes for scan/install/help/version.

## 8.2 Public API strategy

All WebView APIs and types should be additive exports. No current parameter should become required. No current result field should change meaning.

A public API break is not required for milestone 1.

A future generalized scan-target migration may eventually introduce `targets` alongside `engines`, but it should use a staged path:

1. Add optional `targets` while keeping `engines`.
2. Normalize legacy `engines` internally.
3. Keep old report fields or add optional runtime metadata.
4. Deprecate only in a major release with migration docs.

That future migration is not needed to ship the identification/modeling milestone.

## 8.3 Why WebView is not added to existing engine switches

Adding it to `VALID_ENGINES`, provider `switch` statements, or Playwright browser-type routing would either fail exhaustiveness or route WebView to Chromium host binaries. Both outcomes are architecturally wrong. Keeping the new layer separate is the minimal backward-compatible design.

---

# 9. Risks and Edge Cases

## Android Chrome versus Android WebView

- Android Chrome normally has Android and Chrome tokens but no `wv` marker.
- Default WebView has `wv`; legacy/default-like forms also include `Version/4.0`.
- Detection order must test WebView-specific markers before generic Chrome classification.
- Do not classify all Android Chrome tokens as WebView.

## Custom WebView User-Agents

- Host apps can replace the UA completely using `setUserAgentString()`.
- Removing `wv` causes false negatives.
- Copying a Chrome UA makes WebView indistinguishable from Chrome using UA alone.
- Adding `wv` to another client can cause false positives.
- Result confidence and warnings are mandatory.

## UA reduction

- Reduced default UAs retain `wv`, so default WebView identity remains detectable.
- Minor/build/patch data may become `0.0.0`; only the major should be treated as meaningful.
- OS/device/build details become generic and must not drive version mapping.
- Client hints help only on supported WebViews using the default UA.

## Missing version information

- Preserve WebView identity if evidence exists.
- Set runtime/Chromium/Blink version to unknown.
- Compatibility status must be unknown.
- Never substitute installed desktop Chromium or the current project version.

## Chromium/WebView version mismatches

- A custom UA can claim a different Chrome version from the installed package.
- Native package version should be the strongest supplied evidence.
- Preserve both values and emit a mismatch warning.
- Do not silently “correct” one source using a maintained table.

## OEM/system WebView differences

- Some devices use Google WebView, Chrome as provider on certain Android releases, AOSP WebView, or OEM-supplied variants.
- The provider package can change independently and the app process may restart.
- A major-aligned Blink baseline does not capture OEM patches, disabled features, channel, or backports.
- Add provider/package identity to a future native evidence object; do not infer it from UA.

## WebView updates independent of the application

- Compatibility can change without an app release because the system WebView provider updates.
- Reports/profiles should record evidence source and observed timestamp when created by a native harness.
- A static application support statement should specify a minimum WebView major, not only an Android OS version.

## WebView-specific APIs and behavior

- Web platform API support, native `android.webkit` APIs, AndroidX WebKit features, and host settings are separate dimensions.
- JavaScript enablement, permissions, mixed content, file/content URLs, storage, multiple windows, downloads, navigation interception, and native bridges can differ by host configuration.
- Feature detection remains preferred inside the running app.

## False positives

Possible causes:

- spoofed `wv`;
- copied WebView UA from bots/testing tools;
- in-app browsers with WebView markers but additional behavior;
- malformed token ordering accepted too loosely.

Mitigations:

- require Android + valid Chrome token;
- bounded marker patterns;
- confidence/evidence;
- native package evidence when available.

## False negatives

Possible causes:

- fully custom UA;
- app removes `wv`;
- prestandard/legacy forms;
- OEM changes;
- missing UA input.

Mitigations:

- accept optional native package evidence;
- recognize sourced legacy pattern at lower confidence;
- return unknown rather than Chrome when ambiguous;
- document limits.

## Historical release numbering

Pre-modern WebView releases may be labeled by Android release rather than Chromium milestone. Android 4.4 initially used Blink/Chromium 30, with later 4.4 updates using other Chromium versions. Do not assume a simple `WebView 4.4 -> Blink 4` mapping.

## Existing code assumptions

- Artifact names currently omit runtime identity.
- `FeatureRow` keys call Chromium an engine.
- reporters hard-code three scan families.
- controller launch and lifecycle assumes host browser windows.
- custom readiness callbacks are Playwright-Page-specific.

These do not block milestone 1 because it stays outside executable scans, but they must be addressed before real WebView scanning.

---

# 10. Future Work

## 10.1 Real Android WebView execution

A truthful executor requires substantially different infrastructure:

1. Android SDK, emulator images, or connected physical devices.
2. A small versioned host APK containing `android.webkit.WebView` and a test protocol.
3. A way to select/pin/install a WebView provider package compatible with the Android image.
4. ADB lifecycle management and device readiness checks.
5. WebView debugging enabled by the host app.
6. Discovery and selection of the correct WebView debugging target/context.
7. Automation through Appium/UiAutomator, WebDriver, or a carefully scoped CDP bridge.
8. Native collection of `getCurrentWebViewPackage().packageName/versionName`.
9. App settings, Android permissions, network security config, and WebView configuration captured in results.
10. Device/API-level/provider/channel dimensions in cache and result keys.
11. Screenshot, console, network, readiness, crash, and lifecycle signal normalization into `ControllerSession`-like sinks.
12. Exact-version honesty: verify the installed provider package and renderer, and report unavailable/inconclusive when the requested APK cannot run on the selected Android image.

Historical execution is especially difficult because old WebView APKs depend on compatible Android releases, signatures, provider rules, system partitions, and host ABIs. APK management cannot be reduced to `playwright install chromium@N`.

## 10.2 Future scan-target abstraction

Once there is a real executor, introduce a target descriptor separate from engine:

- target/runtime name;
- rendering engine;
- version semantics;
- acquisition strategy;
- controller strategy;
- historical capability;
- host/device dimensions;
- supported readiness/hooks;
- artifact identity.

Then add `targets` to config and migrate `BrowserProvider`/scanner routing from `EngineName` to target descriptors while preserving legacy `engines` as aliases.

## 10.3 Native evidence bridge

Provide a small Android helper or documented JSON schema that apps can send to the Node API:

- package name;
- package version;
- Android API level;
- default/custom UA state;
- UA-CH metadata;
- WebViewFeature results;
- relevant WebSettings and permissions.

This would greatly improve accuracy without immediately requiring browser-boundary to own emulator execution.

## 10.4 Broader compatibility datasets

If static compatibility analysis grows beyond the current small feature table, evaluate:

- `@mdn/browser-compat-data`, which already models `webview_android` upstream of `chrome_android`;
- a generated, vendored subset with provenance and an update command;
- automated stale-data checks.

Do not silently merge BCD static claims with real scan verdicts; keep static/model-derived and observed results separate.

## 10.5 Other embedded runtimes

The same runtime/engine separation could later support:

- Android Chrome distinct from desktop Chromium;
- iOS WKWebView distinct from Safari;
- Windows WebView2 distinct from Edge;
- Electron distinct from Chrome;
- Custom Tabs distinct from embedded WebView.

Do not generalize these in milestone 1 beyond making the types extensible.

---

# 11. Recommended Task Order

Use vertical TDD slices. For each numbered item: write one focused failing test, run it and confirm the expected failure, implement the minimum behavior, rerun the focused test, then run the relevant regression subset before proceeding.

1. Add type-level tests for `RenderingEngineName`, `RuntimeTargetName`, profile fields, and the invariant that `android-webview` is not `EngineName`.
2. Add canonical and negative UA fixture files.
3. Add one failing high-confidence `wv` detector test, implement the minimal detector, and make it pass.
4. Add Android Chrome and desktop Chrome negative tests and tighten token requirements.
5. Add the legacy `Version/4.0` case at lower confidence.
6. Add malformed, missing, custom, and spoofed UA cases with evidence/warnings.
7. Add version-normalization tests and implementation.
8. Add source-precedence and mismatch tests for native package, client hints, explicit version, and UA.
9. Add runtime-profile composition tests and implementation.
10. Add one Blink-baseline compatibility test below threshold and implement `engine-incompatible`.
11. Add one at-threshold test and implement `engine-compatible` with caveat/provenance.
12. Add unknown-version and missing-data compatibility cases.
13. Add the WebView capability-registry schema and one sourced override tracer bullet.
14. Add override precedence, conditional host setting, and version-range tests.
15. Export the API and add root-import/public-declaration tests.
16. Add CLI parser tests for `identify --user-agent`.
17. Implement JSON identify output, then text output, each from a failing CLI test.
18. Add CLI conflict/error tests and scan-command regressions.
19. Run all provider, controller, config, scanner, version-search, and reporting regression suites.
20. Update README and CHANGELOG to match the final API and verified behavior.
21. Run `npm test`, `npm run typecheck`, `npm run build`, `npm run pack-check`, and `npm run test:fixtures` where shared detection/controller paths warrant it.
22. Inspect generated declarations and package contents; confirm no report, cache, browser binary, APK, or emulator artifact is included.

---

# Implementation Readiness

**Repository readiness:** Ready for the identification and compatibility-modeling milestone. The codebase has strong TypeScript types, a clean public API boundary, pure version-search logic, an honesty-oriented version model, extensive Chromium regression coverage, and an existing feature table that can supply a Blink baseline through an adapter.

**Not ready for real WebView execution:** There is no Android device/emulator, APK, ADB, Appium, WebView context, package-version, or Android lifecycle architecture. That work must remain a future phase.

**Unresolved questions requiring a maintainer decision before coding:**

1. Confirm `android-webview` as the only canonical serialized target name; recommended answer: yes.
2. Confirm that milestone 1 adds `identify --user-agent` rather than a misleading scan `--browser`/`--engines` flag; recommended answer: yes.
3. Confirm source precedence when an explicit version conflicts with native package evidence; recommended answer: native package wins, mismatch remains visible.
4. Confirm whether compatibility status needs a distinct `conditional` value for host-dependent capabilities; recommended answer: yes if capability overrides ship in milestone 1, otherwise use `unknown` plus conditions.
5. Confirm no hard minimum detector version; recommended answer: parse any valid version and return unknown when compatibility data is unavailable.
6. Confirm whether essential documentation remains in README or a packaged `docs/android-webview.md` is added.

**Architectural decisions that must not change:**

- Android WebView is a runtime/target over Blink, not a fourth engine.
- Existing `EngineName` and executable scan behavior remain unchanged.
- Chromium data is inherited with provenance as a Blink baseline.
- Chrome/Blink compatibility does not guarantee WebView runtime compatibility.
- No desktop Chromium binary is reported as a tested WebView.

**Recommended first task:** Create `src/runtimes/types.ts` and `tests/unit/runtime-types.test.ts` using a failing type/serialization test that proves `android-webview` and `blink` are separate fields while the existing `EngineName` union remains unchanged.

# Real Android WebView Execution — Feasibility and Product Value Assessment

Date: 2026-08-24
Repository: `browser-boundary` 1.5.2
Branch reviewed: `mrz/feature/android-webview`

## Executive decision

**Recommendation: MVP only, beginning with a time-boxed value-gate prototype; publish it as a separate opt-in workspace package only if the product-value and reliability gates pass. It must not enter the default `browser-boundary` scan path.**

The project should not attempt a historical Android WebView boundary scanner analogous to its Chromium 67–current and Firefox 52–current scanners. Real WebView execution has unique value, but most of that value comes from testing one controlled, currently installed WebView inside a known Android host configuration. The technically attractive CLI promise below is not currently supportable with the package's honesty standard:

```bash
browser-boundary https://example.com --runtime android-webview --version 120
```

A specific WebView major is not a portable standalone binary. Eligibility depends on the Android image's provider allowlist, package name, signing key, `targetSdkVersion`, version code, architecture, packaging generation (standalone/monochrome/Trichrome), installed profiles, and Android release. Google provides current Stable/Beta/Dev/Canary channels, not a Chrome-for-Testing-style, officially indexed historical WebView archive with a guaranteed install recipe. Third-party APK archives do not meet this project's provenance and reproducibility standard.

The useful MVP is therefore a **current-provider Android verification runner**:

```bash
npx @browser-boundary/android run https://example.com \
  --device emulator-5554
```

The prototype should connect to an already running emulator over ADB, install a pinned prototype host, verify and report the actually active WebView provider/version, run one URL through a named/versioned restrictive host profile, and return observed results. Publication is not yet justified: no Android execution, customer-demand validation, or representative incremental-value measurement was completed in this investigation. Emulator provisioning can be a later helper, not an npm install side effect and not part of the first execution core.

## 1. Existing architecture and exact fit

### Repository shape

The repository is a small TypeScript/Node package with 100 tracked files. It publishes ESM and CJS bundles plus declarations through `tsup`; its dry-run npm artifact is currently about 476 KB compressed and 1.91 MB unpacked. `playwright` is a required peer; `@puppeteer/browsers` and `selenium-webdriver` are optional runtime dependencies. CI runs on `ubuntu-latest` with Node 22, unit tests, typecheck, build, package dry-run, and a local Chromium fixture integration suite.

The current scan pipeline is:

```text
CLI / TypeScript scan()
        │
        ▼
resolveConfig()
        │
        ▼
BrowserCompatibilityScanner
        │
        ├── DefaultBrowserProvider
        │     ├── ChromiumProvider
        │     ├── FirefoxProvider
        │     └── WebKitProvider
        │
        ├── version search
        │     ├── latest
        │     ├── explicit
        │     ├── step-down
        │     └── binary
        │
        ▼
runCheckWithRetry()
        │
        ├── PlaywrightController
        └── WebDriverController
                │
                ▼
normalized signals → analyzer → CheckResult → reports
```

Important implementation points:

- `src/cli/options.ts` is a thin argument/environment/config adapter. It intentionally rejects `android-webview` under `--engines`.
- `src/core/scanner.ts` assumes every executable target is an `EngineName`, asks a `BrowserProvider` for a local browser binary, and then runs version search.
- `src/browsers/types.ts` models installation as `(engine, version) -> executablePath`; this is the wrong abstraction for an Android device + OS image + provider + host APK.
- `src/controllers/types.ts` is the most reusable seam. It already normalizes navigation, JavaScript, console, request-failure, readiness, screenshot, trace, and lifecycle operations. However, it is still coupled to `BrowserBinary`, `ResolvedConfig`, `EngineName`, and Playwright-specific callback types.
- `src/core/compatibility-checker.ts` owns signal classification and verdict analysis independently of Playwright/WebDriver. That logic is reusable after an Android runner normalizes equivalent signals.
- `src/reporting/types.ts` assumes `engine`, `versionType`, and browser executable paths. Real WebView evidence requires additive target/device/provider/Android/host-setting metadata rather than pretending the provider is a fourth engine binary.
- `src/runtimes/*` correctly keeps `android-webview` as a runtime on Blink. It models UA/package/Client-Hints/explicit evidence and separates Blink feature baselines from WebView-specific capabilities.
- The executable test suite is `node:test`; fixture integration uses a real current Chromium against local data URLs. There is no Android/Gradle project or Android CI today.

### Current WebView modeling

The current code correctly implements Level A:

```text
UA / explicit / Client Hints / native package version
                         │
                         ▼
          AndroidWebViewProfile
             ├── runtime version
             ├── Chromium version
             ├── Blink version
             ├── evidence/conflicts
             └── warnings
                         │
              ┌──────────┴──────────┐
              ▼                     ▼
       Blink feature baseline   WebView capability registry
```

It does not expose a unified override-first/Blink-fallback resolver, and its WebView capability registry contains only two entries. These static gaps can be improved cheaply and should not be confused with the case for real execution.

### Where real execution fits

Do **not** add WebView to `EngineName`, `BrowserProvider`, or `DefaultBrowserProvider`. A WebView test target is not a downloadable executable. It is a tuple:

```text
Android OS image/device
+ active WebView provider package/version/signature
+ host APK version and target SDK
+ WebSettings/permissions
+ target URL
```

The correct seam is a sibling `RuntimeRunner`/`AndroidWebViewRunner` that emits an additive `RuntimeCheckResult`, then optionally passes common signals through the existing analyzer. The existing scanner can consume runtime results only after its reporting model is generalized; the MVP need not redesign the core scanner first.

## 2. What “real WebView execution” means

### Level A — static model (already present)

Fast, deterministic, no Android infrastructure. It answers whether the observed Blink milestone meets known feature thresholds and whether sourced WebView rules impose additional constraints. It cannot attest host settings or observed behavior.

### Level A.5 — browser-side runtime probes in desktop Chromium

Load the target in desktop Chromium and run capability probes (`typeof`, syntax compilation, storage operations, etc.) under a mobile viewport/UA. This improves dynamic detection and costs seconds, but it is still **not WebView execution**. It cannot establish Android host, provider, permission, lifecycle, bridge, or WebView product behavior. It may be a useful independent feature, but must not be reported as Android WebView.

### Level A.75 — caller-provided Android evidence

Accept a JSON attestation produced by the user's app or CI containing active provider/package version, Android SDK, target SDK, relevant `WebSettings`, permissions, UA, and probe results. This avoids owning emulator lifecycle and gives high value to Android teams willing to instrument their host. It is a valuable intermediate product and could live in the main package as an additive import/evaluate API.

### Level B1 — controlled host, existing device/provider (recommended MVP)

Connect to an existing ADB device, install/launch the project's host APK, load one URL, execute fixed probes, capture native WebView callbacks, verify the active provider, and return structured results. This tests a real WebView but only the controlled host profile and actually installed provider.

### Level B2 — provisioned emulator/current provider

Additionally install SDK tools/system image, create/boot/wipe an AVD, then run B1. This is feasible but adds major download, disk, virtualization, timeout, caching, and CI concerns. Make it a later opt-in command/helper.

### Level B3 — historical WebView matrix

Resolve and install arbitrary old providers across Android images, match ChromeDriver/CDP, and search for a version boundary. This is not product-ready with authoritative public artifacts and should not be promised.

### Level B4 — real devices/OEM matrix

USB or device-farm execution across OEM hardware, provider configurations, and Android releases. This belongs to Appium/device-cloud products, not this package's MVP.

## 3. Technical options

### Environment choices

#### Android Emulator

Feasible and reproducible for a fixed API/system-image tuple. The command-line emulator supports headless operation; an AVD can be started without a window/audio/boot animation and readiness must be determined through ADB (for example, `sys.boot_completed`), not by process start alone. VM acceleration is essential for acceptable CI performance. Linux uses KVM; macOS and Windows use their platform hypervisors. Snapshots/Quick Boot improve warm startup but are invalidated by emulator, image, and AVD changes and enlarge/cache mutable state.

Advantages:

- disposable state and deterministic reset;
- no USB permissions or human device setup;
- fixed Android API/image/ABI;
- suitable for an isolated arbitrary-URL harness;
- parallelizable when CPU/RAM/disk permit.

Costs:

- SDK command-line tools, platform-tools, emulator, platform, and system image;
- a practical host recommendation of 16 GB RAM and 16 GB disk for Android Studio/emulator use, with each image/AVD/cache adding storage;
- KVM/nested-virtualization requirements in Linux/Docker;
- cold boot/provisioning measured in tens of seconds to minutes;
- system-image/provider coupling remains.

#### Real Android device

ADB can discover devices (`adb devices`), install/launch/force-stop the harness, forward sockets, and retrieve output. This provides real hardware and OEM/provider behavior.

It also introduces USB authorization, driver/udev setup, screen lock/battery/network state, user profiles, pre-existing app/data, device contention, OEM restrictions, and nondeterministic provider updates. Hosted CI rarely exposes USB devices. It is suitable as an explicitly selected advanced backend or device-farm integration, not the default or MVP acceptance environment.

### Automation comparison

| Technology | What it gives us | Advantages | Problems | Suitable? |
|---|---|---|---|---|
| ADB | Device discovery; install/uninstall; start/force-stop; shell commands; port forwarding; log/output retrieval; screenshots; emulator control | Already required by every local option; small conceptual surface; scriptable; no server | Not a browser protocol; result collection must be designed; Android-specific edge cases | **Yes — MVP orchestration layer** |
| Host APK native APIs | `loadUrl`, `evaluateJavascript`, `WebViewClient`, `WebChromeClient`, provider/version, renderer lifecycle | Captures WebView-specific host behavior directly; no driver matching; fixed audited settings | Requires maintaining Android code; early JS/network coverage needs care; not a generic DOM automation API | **Yes — MVP execution/collection layer** |
| ChromeDriver/WebDriver | Standard navigation, JS execution, DOM, logs/screenshots; supports debuggable Android WebViews from Android 4.4 | Existing WebDriver concepts; mature; useful for arbitrary web interaction | Matching driver to provider major; ADB still required; debugging must be enabled; Android/WebView context quirks; historical drivers multiply complexity | Later optional controller, not MVP core |
| Direct WebView CDP | Runtime/console/network/DOM events through a forwarded WebView debugging socket | Richest browser signals; avoids Appium and ChromeDriver matching; can attach before target navigation if the host first exposes `about:blank` | Versioned protocol; socket discovery/target selection; transport/reconnect/target recreation; debugging expands attack surface | **Yes for MVP browser telemetry**, feature-detected and paired with native callbacks |
| Appium + UiAutomator2 | Device/app lifecycle plus native/WebView context switching; W3C API; ChromeDriver management | Handles third-party hybrid apps and native UI; active Apache-2.0 ecosystem | Separate server/plugin/driver installs, many capabilities, driver matching, slower startup, much larger failure surface | **No for controlled-host MVP**; optional external adapter later |
| UiAutomator | Black-box native UI automation | Built into Android test stack; can click native controls | WebView content is largely opaque; unnecessary when URL can be passed directly | No |
| Espresso-Web | In-process hybrid app web-element interaction with synchronization | Official AndroidX; useful for testing an app's own native/WebView integration | Instrumentation/Gradle coupling; injects testing infrastructure; overkill for one URL/probe runner | Possible harness implementation, but not needed for MVP |
| AndroidX Test / instrumentation | Structured on-device tests and test results; lifecycle integration | Official, CI-friendly, deterministic test entrypoint | Requires test APK/runner and Gradle; not a general browser protocol | **Yes as a packaging/result option** |
| Selenium client alone | Node API to WebDriver | Existing dependency and normalization code | Does not provision Android or solve provider/driver selection | Only with ChromeDriver later |
| Gradle Managed Devices | Download/create/boot/tear down emulator devices for instrumented tests | Official lifecycle management; reproducible Gradle declarations | Pulls the Node package into a Gradle-centric workflow; API 27+; provisioning remains heavy | Strong for the package's own Android CI, not initial user CLI |

### Simplest reliable MVP sequence

```text
1. `adb devices` and require exactly one selected/explicit device.
2. Query Android SDK/ABI/build and `dumpsys webviewupdate`.
3. Install the pinned test-only host APK plus instrumentation test APK from package assets/cache.
4. Clear harness app data before each run.
5. Launch the unexported Activity through `am instrument`; instrumentation
   accepts URL/timeout, creates a debuggable `about:blank` WebView using the
   versioned `secure-default-v1` profile, and does not navigate yet.
6. Discover the harness PID's `webview_devtools_remote_<pid>` socket, create an
   owned ADB forward, select the expected page target, and enable supported CDP
   Runtime/Log/Network/Page events.
7. Navigate through CDP only after collectors are active. Run readiness and fixed
   probes with `Runtime.evaluate`; the harness concurrently records provider,
   settings, native navigation/resource callbacks, and renderer termination.
8. The harness writes bounded result JSON to an app-private file. Node retrieves
   it with `adb exec-out run-as <package> cat <path>`; instrumentation status is
   limited to completion/error metadata, not the full result payload.
9. Node size-limits and schema-validates JSON, captures screenshot/logcat on
   failure, and normalizes signals/verdict.
10. Force-stop and clear/uninstall harness according to cleanup policy.
```

No `addJavascriptInterface` is required. Use CDP `Runtime.evaluate` (or native `evaluateJavascript` as a reduced fallback) for probes/results and native callbacks for host events. Remove only the ADB forwards owned by the run. If a JS bridge is ever added, it must be origin-scoped with `WebViewCompat.addWebMessageListener`; never expose a broad `addJavascriptInterface` to arbitrary frames/URLs.

This protocol installs two APKs. `run-as` support and the debuggable test-only app are explicit prerequisites; failure to retrieve the bounded result is an infrastructure error. No production host is debuggable. The unexported Activity prevents arbitrary apps from invoking the harness directly; instrumentation validates an absolute HTTP(S) URL, while the outer CLI applies URL/egress policy before launch.

## 4. Minimal host APK

A host APK is required, but a project-owned APK is not assumed before the value gate. Phase 0 should first evaluate the pinned CanIAndroidWebView release; publication should use a small project-owned Kotlin/Java app only if deterministic pre-navigation attachment, settings attestation, native callbacks, and a stable result contract justify ownership. A project-owned host needs:

- one Activity and one WebView;
- Internet permission only (no storage, contacts, location, camera, microphone, or Bluetooth); an unexported Activity launched by instrumentation;
- explicit `WebSettings` profile and a manifest/network-security policy;
- `WebView.getCurrentWebViewPackage()` or AndroidX equivalent before attributing a result;
- `WebViewClient` for page lifecycle, main/subresource failures, HTTP errors, SSL errors, Safe Browsing, and renderer termination;
- `WebChromeClient.onConsoleMessage()` for console and uncaught-error evidence;
- `evaluateJavascript()` for fixed capability/readiness probes;
- deterministic timeout and JSON schema;
- `WebView.setWebContentsDebuggingEnabled(true)` for the CDP-backed MVP, enabled before the initial blank target and disabled in any non-test build;
- app-data/cookie/storage cleanup between runs.

The harness profile must be named and schema-versioned (`secure-default-v1`) and enumerate every explicitly set and inherited setting. It must report its package version, target SDK, Android SDK/build fingerprint, provider package/version, UA, settings, permissions, and collection limitations. Security-policy rejections are separate from browser compatibility failures; a pass applies only to that host profile and must not be generalized to the customer's embedder.

### Reuse assessment

**Chromium System WebView Shell** is the closest existing reusable host. Chromium documents it as a thin standalone WebView API shell used for manual and automated tests, able to launch a URL and display the actual provider version. It relies on the system-installed WebView. It is explicitly not a production-quality browser and has APK signature/package conflicts on emulator images. Building it from Chromium is far too heavy for npm users; prebuilt shell APK availability/signing is not a stable package contract. Use its design/source as a reference, but maintain a tiny project-owned harness.

**ChromeDriver's WebView test shell** proves the architecture but is Chromium test infrastructure, not a supported distributable harness.

**CanIAndroidWebView** (`WebView-CG/CanIAndroidWebView`, Apache-2.0) is a relevant maintained reusable shell. At the research date it had a recent release with a prebuilt APK, loads arbitrary content, exposes WebView settings, and enables debugging. It is the fastest Phase-0 prototype host and avoids a local Android build. It is not the preferred long-term execution contract: URL entry is native UI rather than a documented stable intent/API, its broad configurable behavior is larger than the fixed audited profile needed here, and its result schema/native callbacks/release cadence are not controlled by `browser-boundary`. Pin and checksum it for the spike; replace it with a project-owned minimal host only if the value gate passes.

**Appium / appium-uiautomator2-driver** are actively maintained Apache-2.0 projects and can automate hybrid apps. They reduce work only when testing a user's existing APK/native flow. For the controlled host they add a server, driver plugin, UiAutomator server APKs, capabilities, and ChromeDriver discovery without eliminating ADB or the host APK.

**Playwright Android/WebView** offers an attractive Node API and a regular Playwright `Page`, but Playwright documents the Android API as experimental. It is appropriate for a spike or optional adapter, not the compatibility product's stable primary backend.

**Maestro** (Apache-2.0, maintained) is useful for native/mobile smoke flows and screenshots; its WebView hierarchy support itself relies on DevTools. It does not provide the complete programmable console/network/runtime collection required here and still needs a host APK.

**ReactiveCircus/android-emulator-runner** is active and Apache-2.0. It is appropriate for GitHub Actions provisioning and the package's own integration CI, but it is CI glue rather than a reusable library backend.

**Google android-emulator-container-scripts** is active and Apache-2.0. It provides Linux Docker emulator images/scripts, but requires `/dev/kvm` and nested virtualization/bare metal. It can be documented as a deployment option; embedding it in npm would be inappropriate.

**Gradle Managed Devices** is official and can manage virtual devices for the harness's own tests. It is a good CI choice if the Android subproject is built/tested through Gradle.

**Firebase Test Lab** can run instrumentation against virtual/physical devices and removes local emulator maintenance. It is a future remote backend, not a transparent local implementation. Usage above current no-cost quotas is time-billed under Google's device-class pricing and adds cloud credentials, upload, queueing, and result translation; do not hard-code a price into the product or architecture.

## 5. WebView version management

### What is possible

- Since Android 5, the updatable implementation is distributed as a WebView provider package.
- Android 7+ can support multiple provider channels and switching with developer settings or `adb shell cmd webviewupdate set-webview-implementation <package>`.
- Google documents Stable, Beta, Dev, and Canary channels. Multiple channels can coexist on Android 7+ when the OS configuration allows them.
- AOSP/userdebug images can support developer-built AOSP providers; production/GMS images enforce configured package names and expected signatures.
- Active provider/package can be inspected through Android API and `dumpsys webviewupdate`; both should be recorded and cross-checked.

### Android-release/provider matrix

The phrase “install a WebView APK” hides materially different platform models:

| Android release | Provider model | Consequence for testing |
|---|---|---|
| Android 4.4 and earlier | WebView implementation is tied to the OS/framework rather than independently replaceable in the modern provider model | Historical testing generally requires the matching historical system image/device |
| Android 5–6 | Separate updatable provider APK; common AOSP/Google package identities differ, and Stable/Beta were not modern side-by-side channel slots | Exact-version replacement remains image/package/signature dependent |
| Android 7–9 | Provider selection exists; common GMS phone/tablet images can use Chrome Monochrome channel packages as WebView providers, with different TV/car behavior | “WebView version” can be coupled to an installed Chrome channel/package and OS configuration |
| Android 10+ | Chrome and WebView are separate under the Trichrome-era arrangement; common Google Stable/Beta/Dev/Canary WebView packages have distinct identities | Multiple channels may coexist, but they hold current channel releases—not arbitrary historical-major slots |

Only one eligible provider is active for a user context at a time. Provider changes can terminate/restart WebView-using processes and must be treated as environment changes, not in-process browser switches. `adb install -d` does not bypass allowlisting, signing, target-SDK, framework minimum-version, split-package, ABI, or multi-profile eligibility rules.

### Why arbitrary historical selection is not a browser download problem

Provider eligibility is enforced by Android's WebView Update Service. Relevant constraints include:

- provider package allowlist compiled into the system image;
- enabled/installed state across user profiles;
- expected package signing key on user builds;
- `targetSdkVersion` compatible with the Android platform;
- acceptable `versionCode` and downgrade rules;
- required native library declaration and matching ABI;
- provider packaging differences across Android generations;
- on some releases, Chrome and WebView sharing library/package arrangements;
- minimum/maximum Android compatibility of a particular provider release.

Only one provider is active at a time, although several eligible channels may coexist. Installing an APK with `adb install` does not establish that Android selected or can load it. A test must fail as infrastructure/inconclusive if the requested and active versions differ.

Diagnostics must preserve the failed stage rather than collapse everything into “unavailable”:

1. **Artifact installability:** package format/splits, update signature, downgrade rules, ABI, and Package Manager result.
2. **Provider eligibility:** OS allowlist, expected provider signature, target SDK, framework minimum version code, native-library declaration, and all-user-profile state.
3. **Provider selection:** `cmd webviewupdate` result and fallback behavior.
4. **Process loadability:** the host can instantiate WebView without provider/native-library failure.
5. **Attestation:** `dumpsys webviewupdate` and in-app current-package evidence agree with the requested version constraint.

### Historical artifacts

There is no official Chrome-for-Testing equivalent that exposes a complete historical Android WebView provider matrix with supported system-image tuples and install metadata. Chromium source can build a provider, but building historical Chromium/Android WebView revisions is a very large, brittle toolchain problem, not npm binary acquisition. Third-party APK mirrors have provenance, split-package, signature, licensing, availability, and supply-chain problems and should not be used automatically.

The realistic exact-version preservation options, in descending order of operational determinism, are:

1. a custom AOSP image with the verified provider baked/configured into it;
2. a preserved clean AVD image/snapshot after assembling and verifying an eligible provider;
3. a preserved official provider artifact installed onto one explicitly compatible image;
4. a historical Chromium `system_webview_apk` build on a controlled `userdebug`/`eng` image.

All four are curated Android-environment artifacts, not a generic npm downloader. Google Play is useful for current channels but cannot serve as a reproducible arbitrary-major resolver.

### CLI truthfulness

```bash
browser-boundary ... --runtime android-webview --version 120
```

is **technically unrealistic as a general guarantee**. It may be possible for a curated, explicitly documented `(system image, ABI, provider artifact, signing configuration)` fixture, but not as “download WebView 120 and run it” across normal devices.

For MVP use:

```bash
@browser-boundary/android run https://example.com \
  --device emulator-5554 \
  --provider installed
```

and report the exact observed full version. A later curated matrix should select fixture IDs, not bare majors:

```bash
@browser-boundary/android run https://example.com \
  --fixture aosp-api-34-x86_64-webview-<verified-build-id>
```

A requested major may be a constraint (`--require-provider-major 140`) that validates the environment; it must never trigger an unverified substitution.

## 6. Smallest useful test and unique value

### Minimum useful test

```text
verify provider/settings/device
        ↓
load one HTTPS URL in controlled WebView
        ↓
wait for page completion + optional CSS readiness
        ↓
run fixed, read-only capability probes
        ↓
collect native callbacks and result JSON
        ↓
normalize pass/fail/inconclusive + evidence
```

MVP signals:

- main-frame navigation and SSL/Safe Browsing failures;
- subresource `onReceivedError` and HTTP-error evidence, with documented coverage limits;
- console errors/warnings;
- uncaught JS exceptions and console calls from CDP Runtime/Log, plus explicit probe failures;
- renderer process termination;
- DOM/readiness selector and non-empty render check;
- provider/package/version/UA/settings/Android/target-SDK evidence;
- screenshot and bounded logcat on failure.

Do not claim complete network observability merely because CDP is attached. Record attach time, enabled/unsupported domains, target/session changes, and collection gaps. CDP sees inspected Chromium targets, not arbitrary native HTTP clients; workers, service workers, out-of-process frames, popups, and renderer restarts can require additional target sessions. Native callbacks remain complementary Android evidence.

### What it detects that static Blink cannot

| Problem | Static Blink/WebView model | Real controlled WebView execution |
|---|---|---|
| JavaScript syntax/API support | Predicts from milestone/table; can miss flags, backports, incomplete data, runtime path | Observes the loaded app and fixed probes on the active provider |
| `WebSettings` | Can label settings as conditional only | Verifies the harness's exact settings and effects |
| Android permissions | Cannot observe | Can observe denial/callback behavior for permissions the harness intentionally models; MVP grants none |
| Native bridge | Cannot observe | Can test a deliberately configured bridge, but MVP should expose none; testing the user's bridge requires their APK |
| Storage behavior | Predicts poorly | Can exercise cookies, DOM storage, cache, partition/profile behavior under the controlled host |
| Network behavior | Generic feature/rule data only | Observes Android network-security policy, SSL callbacks, Safe Browsing, UA/headers, and WebView-specific request failures |
| Chrome-only APIs | Registry can say known product features are absent | Runtime probes verify the actual surface and failure mode |
| OEM differences | Cannot model comprehensively | Only if run on that OEM device/provider; emulator MVP provides no OEM claim |
| Provider issues | Version evidence only | Detects provider crash/regression, bad install, active-version mismatch, renderer termination |
| Android lifecycle | Cannot observe | Can test Activity pause/resume/recreation/process termination if explicitly added; not in URL-only MVP |

### Concrete unique-value examples

1. The host forgets `javaScriptEnabled = true`. Blink 120 statically supports the syntax/API, but the app never executes it.
2. DOM storage, mixed content, third-party cookies, autoplay, file/content URL access, or Safe Browsing behavior differs because of host settings/target SDK.
3. A target depends on a Chrome product API or UX not included in WebView even at the same Chromium major.
4. The provider renderer crashes or is killed; `onRenderProcessGone` is observable, static data cannot predict the specific run.
5. Android network security blocks cleartext or certificate behavior despite Blink support.
6. WebView-specific URL/origin handling (`file://`, `content://`, custom schemes) differs from desktop Chrome.
7. Provider/OEM regression or backport makes the observed build differ from milestone assumptions.
8. The active package differs from UA/expected input; real execution catches the mismatch before making a compatibility claim.

### Product-value limit

A controlled generic host **does not test the customer's real host app**. It cannot prove their `WebSettings`, permissions, `WebViewClient`, bridges, target SDK behavior, native navigation interception, app lifecycle, or OEM fleet. This sharply limits the value of a generic “URL in WebView” result. The most valuable future mode is `--apk <customer.apk>` plus an explicit integration contract or Appium adapter, but that is materially more complex and should not be in MVP.

## 7. Performance and operational cost

### Expected developer experience

| Mode | Warm run | Cold run | Dependencies | Typical footprint |
|---|---:|---:|---|---|
| Static WebView model | milliseconds | milliseconds | Node package only | negligible |
| Existing current desktop-browser check | seconds | browser install may take minutes | Playwright browser | hundreds of MB |
| Existing historical scan | tens of seconds to minutes | downloads can add minutes | browser/driver archives | multiple GB across versions |
| WebView MVP, already booted device | roughly 5–20 s | same | ADB + harness APK | small APK plus device |
| WebView MVP, warm/cached AVD | roughly 1–4 min total | — | Android SDK/image/AVD | several GB practical cache |
| WebView MVP, cold AVD/provisioning | — | roughly 4–10+ min | SDK/emulator/image/Gradle | many GB; host should have ample RAM/disk |

These are engineering estimates, not service-level guarantees, and include SDK/AVD restore plus boot rather than only the emulator process's boot interval. A public benchmark from the Android Emulator Runner project measured approximately 15 s boot with Linux KVM, 1m23s on macOS, and 2m23s on unaccelerated Linux for one configuration. Its default boot timeout is 600 seconds. Real CI varies by image, cache, runner, load, and Android release. This repository's existing saved one-check Chromium result took about 3.5 seconds, illustrating the order-of-magnitude difference before Android provisioning.

### Resource and flake profile

- Allocate one emulator per worker; Android's planning guidance allows roughly 4 GB RAM per concurrently running AVD and up to about 6 GB storage for an additional AVD. A practical minimum runner is 2 vCPU/8 GB RAM with roughly 12–16 GB available workspace; 4 vCPU/16 GB RAM and 20–30 GB workspace is safer for a build plus emulator. Measure rather than treating these as hard minima.
- Cache SDK packages/system images and optionally clean AVD snapshots with keys including host OS/arch, emulator version, image/API/target, harness version, and settings schema.
- Never share a mutable AVD concurrently.
- Reproducibility means an exact system-image package revision, clean AVD state, harness hash/profile version, and observed provider full version. Disable accounts/Play updates, never save a post-navigation snapshot, and fail a fixture constraint when provider evidence drifts.
- Use bounded boot, install, launch, navigation, probe, and cleanup timeouts; classify infrastructure separately from compatibility.
- Expect higher flakes than desktop scans: emulator boot, ADB offline state, package manager readiness, animations, provider update state, networking, and renderer startup.
- Run emulator integration on a separate scheduled/manual CI job initially, not every package PR and not the release-blocking main matrix until measured reliability is acceptable.

The default `browser-boundary https://example.com` must remain unchanged. Android execution must be explicit.

## 8. Developer experience and packaging

### Recommended commands

MVP:

```bash
npm install --save-dev @browser-boundary/android

# User provisions/boots an emulator or connects a device.
adb devices

npx @browser-boundary/android doctor
npx @browser-boundary/android run https://example.com \
  --device emulator-5554 \
  --headless \
  --output ./reports/android-webview
```

Later opt-in provisioning:

```bash
npx @browser-boundary/android emulator install --api 34 --abi x86_64
npx @browser-boundary/android emulator run https://example.com --api 34
```

The `doctor` command should verify Java (only if building locally), Android SDK paths, `adb`, emulator/KVM support, connected devices, API/ABI, package-manager readiness, provider eligibility, current provider/version, available disk, and harness compatibility.

### Automatic versus manual installation

MVP may automatically install its small signed harness APK onto an explicitly selected device. It must not automatically:

- install Android Studio/full SDK during `npm install`;
- accept Android licenses;
- download multi-GB images without a dedicated command and confirmation;
- change the device's WebView provider;
- download provider APKs from third-party mirrors;
- modify a physical device without explicit selection.

Require platform-tools/ADB and an already running device for MVP. An explicit later `emulator install` command may use `sdkmanager`, with exact download disclosure and cache location.

### Separate package rationale

Use a same-repository npm workspace package named `@browser-boundary/android`, containing the Node runner and pinned APK asset/manifest. It should initially own a standalone versioned raw Android-result schema and depend on a small shared contracts workspace package—not peer-depend on the complete `browser-boundary` package merely for types. Core report integration follows only after the raw schema stabilizes.

Reasons:

1. Android SDK, Gradle/Java, APK assets, emulator logic, ADB, and platform-specific behavior are irrelevant to most users.
2. The main npm artifact and install path remain small and stable.
3. The default CLI retains its seconds-scale expectation and executable-engine semantics.
4. Android releases/provider policies can version independently.
5. Android CI and maintainers can be isolated without destabilizing desktop browser support.
6. The package can later expose adapters for existing devices, managed emulators, Firebase Test Lab, or Appium without bloating core.

The main package should expose only shared signal/analyzer/result contracts after they are made target-neutral. Do not use npm optional dependencies as the only separation: the Gradle/APK/SDK lifecycle is a product boundary, not merely an import-size issue.

## 9. Security and isolation

Running arbitrary URLs executes hostile JavaScript and downloads untrusted content. An Android emulator is useful isolation but not a perfect security boundary, especially when ADB/debugging and port forwarding are enabled.

Minimum harness policy:

- dedicated disposable emulator/AVD for untrusted URLs; never the user's personal device by default;
- no app permissions except Internet;
- no native JavaScript interface; if later required, use origin-scoped messaging and validate every message;
- disable file/content access and universal/file URL access;
- no cleartext traffic by default; explicit opt-in for local HTTP fixtures;
- no credentials, accounts, Play Store sign-in, shared cookies, or preloaded secrets;
- fresh app data/profile per URL/run; clear cookies, cache, WebStorage, service workers where supported;
- reject or cancel SSL errors; keep Safe Browsing enabled;
- block popups/new windows, downloads, external intents/custom-scheme dispatch, geolocation, media capture, notifications, and permission prompts;
- fixed HTTPS allowlist option for CI; egress/network namespace restrictions where possible;
- do not mount repository secrets or host home into emulator containers;
- bind ADB/CDP only to loopback, use ephemeral forwards, and remove them during cleanup;
- debugging off unless needed for a selected controller;
- sanitize/redact URLs, headers, console output, screenshots, logcat, and report artifacts before publication;
- wipe/delete the AVD after untrusted scans or restore a verified clean snapshot.

Never execute arbitrary URLs in a persistent emulator that contains CI tokens or authenticated Google accounts. Treat the harness APK and prebuilt APK release pipeline as supply-chain-sensitive signed artifacts.

## 10. CI/CD feasibility

### GitHub Actions

Feasible on `ubuntu-latest` with KVM permissions and an action such as ReactiveCircus Android Emulator Runner. GitHub documents hardware-accelerated Android virtualization on hosted Linux runners. Use x86_64, one emulator/worker, headless/no-audio, cached SDK/image/AVD, local HTTPS fixtures, and uploaded JSON/log/screenshot artifacts. Start as a separate non-required scheduled/manual job.

Runner capacity is account/repository dependent: current standard public Linux runners are documented with more CPU/RAM than standard private Linux runners, while the standard workspace is tight for cold Android image installs. Check `df`, keep one image, and do not assume every hosted runner exposes identical capacity. Pin third-party actions to a commit SHA for the hardened workflow.

Minimal shape:

```text
checkout
→ setup Node + Java
→ npm ci
→ enable KVM permissions
→ provision cached API-34 x86_64 emulator
→ build/verify harness APK
→ run @browser-boundary/android fixture suite
→ upload results/logcat/screenshots
→ always force-stop/delete AVD
```

### GitLab CI

Feasible on a self-hosted Linux runner with `/dev/kvm` or nested virtualization. Shared runners cannot be assumed to expose KVM. Docker executors need the host KVM device passed through and appropriate permissions; otherwise startup can become prohibitively slow or unsupported. Document a remote device-farm alternative.

### Docker

The supported/tested deployment target should be a Linux host with `/dev/kvm`. Google's emulator-container scripts require KVM and recommend bare metal or nested virtualization. Other arrangements may technically work, but Docker Desktop on macOS/Windows is not a portable or supported MVP backend. A container improves reproducibility but does not remove virtualization or security concerns.

### Linux/macOS/Windows

- Linux: preferred for CI with KVM; best automation/cost profile.
- macOS: local emulator works through Hypervisor.framework. Hosted CI is **unvalidated/best-effort** until a specific runner/architecture is benchmarked; do not assume ARM64 hosted macOS nested virtualization.
- Windows: local emulator works with Windows Hypervisor Platform. Hosted CI is **unvalidated/best-effort** and depends on a known-capable/self-hosted runner and nested virtualization; the recommended emulator action does not provide the same Windows path.

Support the Node orchestration layer on all three only after testing. Declare MVP CI-supported as Linux x86_64; other hosts can be best-effort initially.

## 11. Proposed smallest architecture

```text
browser-boundary CLI / API
          │
          ├── Static Runtime Model (existing)
          │
          └── @browser-boundary/android (opt-in)
                    │
                    ├── Doctor / prerequisite checker
                    ├── AdbDeviceManager
                    │      ├── discover/select
                    │      ├── install/start/stop
                    │      └── pull output/screenshot/logcat
                    ├── HarnessManager
                    │      ├── versioned prebuilt APK
                    │      └── schema/settings compatibility
                    ├── AndroidWebViewExecutor
                    │      ├── URL/readiness/probe request
                    │      ├── timeout/cancellation
                    │      └── cleanup policy
                    ├── ResultCollector
                    │      ├── native WebView callbacks
                    │      ├── evaluateJavascript probe results
                    │      └── provider/device/settings attestation
                    └── Versioned raw Android result schema
                           ├── coverage/policy classifications
                           └── later shared normalization/report adapter
```

Responsibilities:

- **Doctor:** actionable environment validation; never silently installs large prerequisites.
- **AdbDeviceManager:** process-safe ADB execution, one-device selection, lifecycle, timeout, and cleanup.
- **HarnessManager:** pins APK/schema version and verifies checksum/signature before installation.
- **AndroidWebViewExecutor:** runs exactly one controlled test request and enforces isolation.
- **ResultCollector:** produces a complete, versioned raw Android result without making compatibility claims.
- **Raw result schema:** first preserves observed signals, collector coverage, Android/provider evidence, policy classifications, and infrastructure stages. A later adapter maps compatible evidence into shared `pass/fail/inconclusive/error` reporting without discarding those distinctions.
- **Optional EmulatorManager (phase 2):** explicit SDK/image/AVD provisioning. Keep it outside the executor so existing devices and device farms can use the same runner.
- **Direct CDP collector:** part of the value-gate/MVP telemetry hypothesis; ChromeDriver/Appium remain later optional automation adapters.

Do not pass an Android environment through `BrowserBinary.executablePath`. Add target-neutral interfaces only where common behavior is real; avoid a premature universal abstraction.

## 12. MVP definition

### Supported

- Android version: one pinned CI image initially, recommended API 34 x86_64 AOSP or Google APIs image selected after provider-install prototype validation.
- WebView version: **whatever eligible provider is active on that image/device**, reported and optionally constrained; current provider only.
- Environment: one already running ADB emulator. Physical devices are outside default MVP support; any later best-effort mode must require an explicit destructive-action acknowledgment and default to force-stop/clear without uninstalling or changing providers.
- Host: Phase 0 uses a pinned/checksummed maintained shell where possible; a published runner uses a project-owned two-APK instrumentation harness only if ownership gates pass, with the versioned `secure-default-v1` profile.
- CI: Linux x86_64 GitHub Actions with KVM, one scheduled/manual integration job.
- CLI: separate `doctor` and `run` commands; exactly one URL and one emulator.
- Tests: load/navigation, provider attestation, CDP console/runtime/network evidence with explicit coverage metadata, native resource/HTTP/SSL callbacks, renderer termination, fixed JS capability probes, optional CSS readiness, failure screenshot/log.
- Results: versioned JSON first; Markdown may follow after the schema stabilizes.

### Not supported

- bare `--version N` downloads or historical boundary search;
- multiple WebView majors/providers in one run;
- automatic provider APK download/downgrade/switching;
- third-party APK mirrors;
- physical-device/OEM claims or device farms;
- Appium, UiAutomator, Espresso-Web, or arbitrary native UI flows;
- testing the customer's APK, bridge, permissions, or settings;
- parallel emulators;
- automatic Android SDK/image install during npm installation;
- Play Store accounts or signed-in state;
- complete whole-device/native-app traffic capture or Playwright traces;
- Android lifecycle/fold/rotation/background matrix;
- camera/location/microphone/payment/download/upload testing;
- local cleartext HTTP by default.

### MVP success criterion

The MVP is worthwhile only if a prototype demonstrates representative incremental product value, not merely an artificial settings mismatch:

1. Compare the **static WebView/Blink model** and **same-major desktop Chromium execution** separately against real WebView execution.
2. Demonstrate at least one representative WebView/Android-platform failure that is not manufactured solely by intentionally disabling JavaScript, storage, or cleartext in the harness.
3. Map that finding to a documented user workflow or concrete issue class relevant to current package users, and collect lightweight demand evidence before publication—for example, a design-partner reproduction, user/issue interviews, or opt-in prototype usage.
4. Run at least 100 warm CI repetitions. Define infrastructure flake rate as runs requiring retry or ending in boot/ADB/provider/collector/cleanup error divided by attempted runs; target <2% before required CI. Report deterministic target failures separately.
5. Record and verify provider full version, exact image revision, harness hash, and profile version on every run.

If the prototype cannot demonstrate this incremental signal, stop after Level A.75 and do not ship execution.

## 13. Phased implementation plan

### Phase 0 — value-gate prototype

Goal: prove unique signal before productizing.

Likely additions:

- separate spike directory/repository, not published package;
- pinned/checksummed CanIAndroidWebView APK first, followed by a tiny Android
  Gradle host only if the shell cannot expose a stable blank-target contract;
- shell script/TypeScript ADB + direct-CDP prototype;
- fixtures for settings, network security, storage, renderer error, and provider attestation.

Dependencies: JDK, Android SDK/platform-tools/emulator, Gradle wrapper, one pinned image.

Risks: generic host duplicates desktop Chromium findings; native callbacks miss important network/early JS signals; selected image provider is not controllable enough.

Acceptance:

- real provider version verified;
- structured result returned without JS bridge, with collectors attached before
  target navigation and explicit CDP coverage metadata;
- at least one concrete WebView-only detection demonstrated;
- 100-run timing/flake/resource measurements collected;
- go/no-go review before package architecture work.

### Phase 1 — minimal Android harness

Goal: audited, deterministic B1 host APK.

Likely modules:

```text
android-harness/
  settings.gradle(.kts)
  build.gradle(.kts)
  app/src/main/AndroidManifest.xml
  app/src/main/.../HarnessActivity.kt
  app/src/main/.../Collector.kt
  app/src/main/.../ResultSchema.kt
  app/src/androidTest/... fixtures/tests
```

Dependencies: Android Gradle Plugin, Kotlin or Java, optional AndroidX WebKit/Test.

Risks: callback ordering, early errors, app-private result retrieval, Android API compatibility, secure settings.

Acceptance: local fixture suite covers success, navigation/resource/console/renderer/readiness failure, timeouts, reset, and exact provider/settings attestation.

### Phase 2 — raw contracts and separate Node package/ADB runner

Goal: stabilize a standalone versioned raw Android result/coverage schema, then build the CLI/API against an existing emulator.

Likely modules:

```text
packages/android/src/cli.ts
packages/android/src/doctor.ts
packages/android/src/adb/device-manager.ts
packages/android/src/harness/manager.ts
packages/android/src/executor.ts
packages/android/src/result-schema.ts
packages/contracts/src/android-runtime.ts
```

If the repository remains single-package, publish from a separate workspace package rather than adding code to `src/browsers`.

Dependencies: preferably Node child processes only plus a JSON schema validator if justified; no Appium and no dependency on the full core package.

Risks: cross-platform quoting/process cleanup, multiple/offline devices, APK distribution/checksums, backward-compatible schemas.

Acceptance: `doctor` is actionable; run/install/start/result/cleanup work end-to-end; requested emulator is explicit; raw schema includes provider/image/profile and collector-coverage metadata; malformed/missing evidence retains its failed infrastructure stage; unit tests mock ADB and one real Linux integration job passes.

### Phase 3 — result model and shared analysis

Goal: adapt the stabilized raw result to shared analysis/reporting while preserving WebView identity without contaminating `EngineName`.

Likely affected core modules:

- additive target-neutral signal/analyzer types near `src/controllers/types.ts` and `src/analysis`;
- new `RuntimeCheckResult`/provider/device evidence types;
- reporting JSON/Markdown support;
- public exports.

Risks: breaking existing API/declarations; falsely equating engine version and runtime provider; analyzer assumptions about Playwright network completeness.

Acceptance: old `ScanResult` remains source-compatible; WebView reports include provider full version, Android image, host settings, collection limitations, and observed/static provenance; no desktop executable path fiction.

### Phase 4 — CI and release hardening

Goal: reproducible signed APK and measured Android integration job.

Likely affected:

- separate Android CI workflow;
- APK checksum/signature manifest;
- artifact/cache keys;
- supply-chain/release documentation.

Dependencies: GitHub Actions KVM/emulator action or Gradle Managed Devices.

Risks: mutable image/provider updates, cache poisoning, flaky boot, signing secrets.

Acceptance: clean and cached runs; 100-run flake benchmark; failure artifacts; pinned build tools/image; checksum verified by Node package; Android job remains separate until reliable.

### Phase 5 — optional emulator manager

Goal: explicit B2 provisioning command.

Dependencies: `sdkmanager`, `avdmanager`, emulator; Android licenses accepted by user/CI.

Risks: huge downloads, disk exhaustion, unsupported virtualization, cross-platform variance, snapshot corruption.

Acceptance: dry-run/download disclosure, idempotent cache, KVM diagnosis, boot timeout, clean teardown, no install-time side effects.

### Phase 6 — richer automation, only if demanded

Goal: ChromeDriver/Appium or Playwright-Android adapters for arbitrary DOM/native flows and user scripting beyond the fixed CDP probe runner.

Dependencies: matching ChromeDriver resolver plus Appium/UiAutomator2, or the experimental Playwright Android API.

Risks: driver/provider skew, extra server/helper APKs, experimental API churn, debugging exposure, and duplicate/conflicting signals.

Acceptance: provider/driver major verified, explicit installed-app integration contract, event normalization tested across the supported provider range, and the direct ADB/CDP path retained.

### Historical version matrix

This is not an ordinary next phase. It requires a separately approved artifact/provenance project. Acceptance would require an authoritative provider artifact index, legal redistribution review, signed checksums, compatible Android image matrix, active-provider verification, and repeatable CI. Without those, keep it out of the roadmap.

### Verdict and exit semantics

| Raw classification | Normalized verdict | CLI exit | Notes |
|---|---|---:|---|
| Observed target compatibility failure | `fail` | 1 | JS/runtime/readiness failure attributable to the tested target/profile |
| Harness security-policy rejection | `inconclusive` plus `policy-failure` | 4 | Cleartext/egress/permission policy; never mislabeled as browser incompatibility |
| Missing/unverifiable provider or insufficient collector coverage | `inconclusive` | 3 | Preserve partial evidence and exact failed stage |
| Boot/ADB/install/launch/collector/result-transport failure | `error` | 3 | One bounded retry only for identified transient infrastructure |
| Successful observed run | `pass` | 0 | Applies only to recorded URL, provider, image, and host profile |
| Cleanup failure after an otherwise valid verdict | preserve verdict plus `cleanupError` | 3 | Artifacts remain, but environment integrity is not assumed |

Configuration/usage errors use exit 2. These Android-specific semantics should be reconciled with the main CLI only when shared report integration occurs.

## 14. Final decision

Recommendation: **MVP only, beginning with a time-boxed value-gate prototype; publish the same-repository `@browser-boundary/android` workspace package only if the stated product-value and reliability gates pass.**

Confidence: **Medium**

Why:

1. Real execution has genuine unique value for WebView settings, Android network/security behavior, provider regressions/crashes, active-version verification, storage, and lifecycle—areas a Blink milestone cannot prove.
2. A controlled current-provider prototype is technically feasible with ADB, a host APK, direct CDP, and native callbacks; publication remains contingent on representative incremental value and measured reliability.
3. The headline historical-boundary value of `browser-boundary` does not transfer cleanly: arbitrary historical WebView majors are not independently downloadable, portable browser binaries, and a generic host does not represent the customer's actual app.
4. Emulator/SDK/KVM/Gradle/APK infrastructure is too heavy for the default package and command path.
5. A strict value-gated MVP limits sunk cost and provides empirical evidence before committing to emulator management or richer automation.

Biggest benefit:

Observed evidence for WebView/Android-host behavior that desktop Blink execution and static compatibility tables cannot establish, with exact active-provider attestation.

Biggest technical risk:

The generic harness may detect too little beyond desktop Chromium to justify its infrastructure, while the highest-value host-specific behavior exists only in the customer's real APK/settings/permissions.

Estimated implementation complexity: **High** for the bounded MVP; **Very High** for historical versions or customer-APK/device matrices.

Estimated maintenance cost: **Medium–High** for current-provider MVP; **Very High** for version matrices.

Recommended next step:

Run Phase 0 as a time-boxed prototype. First pin and checksum the maintained CanIAndroidWebView APK to validate ADB/CDP telemetry cheaply; if its native URL-entry contract prevents pre-navigation attachment or deterministic settings/results, replace it with the tiny no-bridge project-owned host. Drive one API-34 x86_64 emulator, implement provider attestation and five fixtures, then measure 100 cached CI runs. Proceed to a published separate package only if it demonstrates reproducible WebView-only findings and acceptable flake/runtime. Do not add `android-webview` to `--engines`, do not implement a generic `--version 120`, and do not add Android SDK downloads to the existing install command.

## Sources

Primary and project sources used for this assessment:

1. Android WebView overview and host integration: https://developer.android.com/develop/ui/views/layout/webapps/webview
2. Android WebView management/current provider: https://developer.android.com/develop/ui/views/layout/webapps/managing-webview
3. Android WebView API (`loadUrl`, `evaluateJavascript`, current package): https://developer.android.com/reference/android/webkit/WebView
4. WebViewClient callbacks: https://developer.android.com/reference/android/webkit/WebViewClient
5. JavaScript console collection: https://developer.android.com/develop/ui/views/layout/webapps/debug-javascript-console-logs
6. WebView remote debugging: https://developer.chrome.com/docs/devtools/remote-debugging/webviews
7. ChromeDriver Android/WebView support: https://developer.chrome.com/docs/chromedriver/get-started/android
8. Chromium System WebView Shell: https://chromium.googlesource.com/chromium/src/+/HEAD/android_webview/docs/webview-shell.md
9. Chromium WebView provider requirements/switching: https://chromium.googlesource.com/chromium/src/+/HEAD/android_webview/docs/webview-providers.md
10. WebView Stable/Beta/Dev/Canary: https://chromium.googlesource.com/chromium/src/+/HEAD/android_webview/docs/prerelease.md
11. Chromium legacy Android/provider behavior: https://chromium.googlesource.com/chromium/src/+/HEAD/android_webview/docs/legacy-os-behavior.md
12. Chromium WebView channel/package model: https://chromium.googlesource.com/chromium/src/+/HEAD/android_webview/docs/channels.md
13. Chromium WebView platform differences: https://chromium.googlesource.com/chromium/src/+/HEAD/android_webview/docs/web-platform-compatibility.md
14. Chromium WebView network debugging: https://chromium.googlesource.com/chromium/src/+/HEAD/android_webview/docs/net-debugging.md
15. Android WebView bridge security: https://developer.android.com/privacy-and-security/risks/insecure-webview-native-bridges
16. Android WebView file security: https://developer.android.com/privacy-and-security/risks/webview-unsafe-file-inclusion
17. Espresso-Web: https://developer.android.com/training/testing/espresso/web
18. Android Emulator CLI: https://developer.android.com/studio/run/emulator-commandline
19. Emulator acceleration: https://developer.android.com/studio/run/emulator-acceleration
20. Emulator requirements: https://developer.android.com/studio/run/emulator
21. Android Studio/emulator install requirements: https://developer.android.com/studio/install
22. Gradle Managed Devices: https://developer.android.com/studio/test/managed-devices
23. Android CI automation choices: https://developer.android.com/training/testing/continuous-integration/automation
24. GitHub Actions Android hardware acceleration: https://github.blog/changelog/2024-04-02-github-actions-hardware-accelerated-android-virtualization-now-available/
25. GitHub hosted-runner specifications: https://docs.github.com/en/actions/reference/runners/github-hosted-runners
26. GitLab hosted Linux runners: https://docs.gitlab.com/ci/runners/hosted_runners/linux/
27. ReactiveCircus Android Emulator Runner (Apache-2.0): https://github.com/ReactiveCircus/android-emulator-runner
28. Google Android Emulator Container Scripts (Apache-2.0): https://github.com/google/android-emulator-container-scripts
29. Appium (Apache-2.0): https://github.com/appium/appium
30. Appium UiAutomator2 driver (Apache-2.0): https://github.com/appium/appium-uiautomator2-driver
31. Firebase Test Lab Android virtual devices: https://firebase.google.com/docs/test-lab/android/avds
32. CanIAndroidWebView shell (Apache-2.0): https://github.com/WebView-CG/CanIAndroidWebView
33. Playwright Android API (experimental): https://playwright.dev/docs/api/class-android
34. Maestro (Apache-2.0): https://github.com/mobile-dev-inc/Maestro
35. Chrome DevTools Protocol and versioning: https://chromedevtools.github.io/devtools-protocol/
36. Repository implementation: `src/cli`, `src/core`, `src/browsers`, `src/controllers`, `src/runtimes`, `src/reporting`, `tests`, `.github/workflows`, `package.json`, `README.md`, and `ANDROID_WEBVIEW.md`.

Research caveat: timings and resource figures vary substantially by runner/image/cache. Where no official fixed number exists, this report labels ranges as engineering estimates and uses public project measurements only as examples, not guarantees.

# Android WebView Compatibility

This document explains Android WebView support in `browser-boundary`, how the compatibility model works, and how to use the CLI and TypeScript API.

## Overview

Android WebView is modeled as a **runtime target built on Blink**, not as a separate rendering engine.

```text
Rendering engines
├── Blink
├── Gecko
└── WebKit

Runtime targets
└── Android WebView
    └── Blink / Chromium baseline
```

This distinction is important:

- **Blink compatibility** describes the shared rendering and JavaScript engine baseline.
- **Android WebView compatibility** describes an embedded Android runtime with its own host settings, permissions, APIs, update lifecycle, and product limitations.
- **Chrome compatibility does not guarantee Android WebView compatibility**, even when Chrome and WebView expose the same Chromium major version.

Android WebView has therefore not been added to the existing executable engine list. The following scan engines remain unchanged:

```text
chromium
firefox
webkit
```

`browser-boundary` does not launch an Android emulator, install a WebView APK, or run a website inside a real WebView. The current feature identifies and models WebView compatibility without claiming real WebView execution.

## What the feature provides

The Android WebView feature provides:

1. Android WebView User-Agent identification.
2. Detection confidence and evidence.
3. WebView, Chromium, and Blink version representation.
4. Version-source precedence and conflict reporting.
5. Static Blink-baseline compatibility evaluation.
6. WebView-specific runtime capability evaluation.
7. A non-executing CLI identification command.
8. An additive TypeScript API.

## CLI usage

### Identify an Android WebView User-Agent

```bash
browser-boundary identify \
  --user-agent "Mozilla/5.0 (Linux; Android 10; K; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/140.0.0.0 Mobile Safari/537.36"
```

Text output includes:

- runtime target;
- observed WebView version;
- rendering engine;
- Blink/Chromium major baseline;
- detection confidence;
- detection evidence;
- warnings and compatibility limitations.

Example output shape:

```text
Runtime: android-webview
Runtime version: 140.0.0.0
Rendering engine: blink
Blink/Chromium baseline: 140
Detection confidence: high
Evidence: android-platform, wv-marker, version-4-marker, chrome-version
Warning: User-Agent detection can be spoofed or hidden by an embedding app with a custom User-Agent.
Note: Blink/Chromium compatibility does not guarantee Android WebView runtime compatibility.
```

### Request JSON output

```bash
browser-boundary identify \
  --user-agent "Mozilla/5.0 (Linux; Android 10; K; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/140.0.0.0 Mobile Safari/537.36" \
  --format json
```

Representative JSON shape:

```json
{
  "runtime": "android-webview",
  "renderingEngine": "blink",
  "detectionConfidence": "high",
  "evidence": [
    "android-platform",
    "wv-marker",
    "version-4-marker",
    "chrome-version"
  ],
  "runtimeVersion": {
    "raw": "140.0.0.0",
    "major": 140,
    "precision": "major",
    "source": "user-agent"
  },
  "chromiumVersion": {
    "raw": "140.0.0.0",
    "major": 140,
    "precision": "major",
    "source": "user-agent"
  },
  "engineVersion": {
    "raw": "140",
    "major": 140,
    "precision": "major",
    "source": "derived"
  },
  "versionConflicts": [],
  "warnings": [
    "User-Agent detection can be spoofed or hidden by an embedding app with a custom User-Agent."
  ]
}
```

### Unknown or non-WebView User-Agents

An Android Chrome or desktop Chrome User-Agent is not classified as Android WebView merely because it includes a `Chrome/...` token.

```bash
browser-boundary identify \
  --user-agent "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 Chrome/140.0.0.0 Mobile Safari/537.36" \
  --format json
```

Identification still exits with code `0`. An unknown result is valid identification data, not a configuration or infrastructure failure.

### Unsupported CLI combinations

`identify` is a modeling command, not a website scan. It rejects scan URLs and scan-only options.

Do not use:

```bash
browser-boundary identify https://example.com --user-agent "..."
browser-boundary identify --user-agent "..." --engines chromium
browser-boundary identify --user-agent "..." --versions 140
```

Android WebView is intentionally not accepted as an executable engine:

```bash
browser-boundary https://example.com --engines android-webview
```

This fails because launching desktop Chromium and labeling it Android WebView would be technically incorrect.

## TypeScript API

All Android WebView APIs are exported from the package root.

```ts
import {
  createAndroidWebViewProfile,
  detectAndroidWebView,
  evaluateAndroidWebViewCapability,
  evaluateAndroidWebViewFeature,
  normalizeRuntimeVersion,
} from 'browser-boundary';
```

### Detect a WebView User-Agent

```ts
import { detectAndroidWebView } from 'browser-boundary';

const detection = detectAndroidWebView(
  'Mozilla/5.0 (Linux; Android 10; K; wv) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Version/4.0 Chrome/140.0.0.0 Mobile Safari/537.36',
);

if (detection.isAndroidWebView) {
  console.log(detection.confidence);
  console.log(detection.evidence);
  console.log(detection.version.major);
}
```

The detector is pure and performs no browser launch, network call, Android API call, or environment lookup.

### Create a runtime profile from a User-Agent

```ts
import { createAndroidWebViewProfile } from 'browser-boundary';

const profile = createAndroidWebViewProfile({
  userAgent:
    'Mozilla/5.0 (Linux; Android 10; K; wv) ' +
    'AppleWebKit/537.36 (KHTML, like Gecko) ' +
    'Version/4.0 Chrome/140.0.0.0 Mobile Safari/537.36',
});

console.log(profile.runtime);              // android-webview
console.log(profile.renderingEngine);      // blink
console.log(profile.runtimeVersion.major); // 140
console.log(profile.chromiumVersion.major);// 140
console.log(profile.engineVersion.major);  // 140
```

The version fields remain separate even when they have the same major. Equal values express a modern same-build relationship; they do not make WebView and Chrome the same runtime.

### Create a profile from an explicit version

Use an explicit version when the caller already knows the intended WebView version and no User-Agent is available:

```ts
const profile = createAndroidWebViewProfile({
  explicitVersion: '140',
});
```

This creates a caller-supplied WebView profile. Detection confidence remains `unknown` because the runtime was not identified from a User-Agent.

### Use native package version evidence

An Android host can obtain the active WebView provider package version through Android APIs such as `WebView.getCurrentWebViewPackage()` or the AndroidX equivalent. Pass that version into the Node-side model:

```ts
const profile = createAndroidWebViewProfile({
  userAgent: observedUserAgent,
  nativePackageVersion: '140.0.7339.51',
});
```

The API does not call Android APIs itself. The host application is responsible for collecting and passing this evidence.

Version evidence uses this precedence:

```text
native package
  > client hints
  > explicit version
  > User-Agent version
```

If sources disagree on the major version, the profile records structured `versionConflicts`. Compatibility evaluators return `unknown` rather than choosing an unsafe compatibility claim.

### Normalize a version

```ts
import { normalizeRuntimeVersion } from 'browser-boundary';

const version = normalizeRuntimeVersion('140.0.7339.51', 'native-package');

console.log(version.raw);       // 140.0.7339.51
console.log(version.major);     // 140
console.log(version.precision); // full
console.log(version.source);    // native-package
```

Accepted forms contain one to four numeric components. Values such as `latest`, negative numbers, exponents, empty strings, and mixed numeric/text versions are not normalized into a compatibility version.

## User-Agent identification model

### Canonical WebView evidence

A modern default Android WebView User-Agent normally includes:

- an Android platform token;
- the `wv` marker;
- a `Chrome/<version>` token;
- commonly, `Version/4.0` before the Chrome token.

Example:

```text
Mozilla/5.0 (Linux; Android 10; K; wv)
AppleWebKit/537.36 (KHTML, like Gecko)
Version/4.0 Chrome/140.0.0.0 Mobile Safari/537.36
```

### `Version/4.0` is not the WebView version

`Version/4.0` is a compatibility marker inherited from the User-Agent format. It must never be interpreted as Android WebView version 4.

The observed modern WebView/Chromium build is obtained from the `Chrome/<version>` token or stronger package evidence.

### Reduced User-Agents

A reduced User-Agent can expose a version such as:

```text
Chrome/140.0.0.0
```

This reliably provides the major milestone, but it does not provide an exact patch/build. The profile therefore reports major precision rather than treating all four components as exact version evidence.

### Detection confidence

The detector uses these confidence levels:

- `high`: canonical Android + `wv` + valid Chrome version evidence;
- `medium`: legacy/default-like Android + `Version/4.0 ... Chrome/...` evidence without `wv`;
- `low`: WebView identity markers exist but no valid version is exposed;
- `unknown`: the UA does not provide enough trustworthy WebView evidence.

Confidence describes the available evidence. It is not runtime attestation.

## Version model

### Modern WebView releases

For a trustworthy modern observation with major `N`, the profile represents:

```text
Android WebView runtime N
├── Chromium milestone N
└── Blink baseline N
```

These are separate semantic fields even when their numeric major matches.

### Legacy Android 4.4

Android 4.4 WebView used release labels and Chromium/Blink milestones that do not share the same numbering scheme. The profile therefore keeps them separate:

```text
Android WebView release: 4.4
Chromium/Blink milestone: for example 30 or 33
```

The implementation never maps Android WebView 4.4 to Blink major 4.

### Unknown versions

If WebView identity is detected but a valid version is unavailable:

- runtime identity can remain `android-webview`;
- version fields can remain unknown;
- Blink-baseline compatibility is `unknown`;
- no current/latest version is invented.

## Compatibility evaluation

### Blink feature baseline

Use `evaluateAndroidWebViewFeature()` for features represented in the existing browser compatibility feature table:

```ts
import {
  createAndroidWebViewProfile,
  evaluateAndroidWebViewFeature,
} from 'browser-boundary';

const profile = createAndroidWebViewProfile({ explicitVersion: '80' });
const result = evaluateAndroidWebViewFeature(
  profile,
  'Optional chaining (?.)',
);

console.log(result.status);     // engine-compatible
console.log(result.provenance); // chromium-baseline
```

Possible baseline results include:

- `engine-compatible`: the Blink major meets the Chromium threshold;
- `engine-incompatible`: the Blink major predates the threshold;
- `unknown`: the version is unknown, evidence conflicts, or no baseline data exists.

`engine-compatible` deliberately does not mean `supported`. It only establishes the shared Blink baseline.

### WebView-specific runtime capabilities

Use `evaluateAndroidWebViewCapability()` for WebView embedding, host-setting, permission, native API, or product capabilities:

```ts
import { evaluateAndroidWebViewCapability } from 'browser-boundary';

const result = evaluateAndroidWebViewCapability(
  profile,
  'javascript-execution',
);

console.log(result.status);     // conditional
console.log(result.provenance); // webview-override
console.log(result.conditions);
```

Current registry examples include:

| Capability | Category | Result |
| --- | --- | --- |
| `javascript-execution` | Host setting | `conditional`; the host must enable JavaScript through `WebSettings` |
| `chrome-sync` | Product feature | `unsupported`; Chrome Sync is not part of Android WebView |

WebView-specific capability results carry source and applicability notes.

### Current evaluator boundary

The current public API exposes separate feature and capability evaluators. Callers must choose the evaluator that matches the requirement category:

- web-platform/JavaScript feature in the feature database → `evaluateAndroidWebViewFeature()`;
- WebView embedding, host, native, permission, or product capability → `evaluateAndroidWebViewCapability()`.

A unified override-first, Blink-fallback resolver is not currently exposed. Do not assume that calling the capability evaluator with an arbitrary web-platform feature automatically falls back to Blink data.

## Why Chrome compatibility is not enough

Even when Android WebView and Chrome expose the same Chromium major, WebView behavior can differ because of:

- host-controlled `WebSettings`;
- Android permissions;
- native Java/Kotlin bridges;
- WebView-specific APIs and AndroidX feature checks;
- storage and profile behavior;
- application lifecycle and process behavior;
- network and header behavior;
- OEM or provider differences;
- provider updates independent of the host application;
- Chrome product features that are absent from WebView.

Prefer runtime feature detection inside the Android application whenever possible.

## Limitations

### User-Agent detection is not authoritative

An embedding application can replace the WebView User-Agent. A custom UA can:

- remove WebView markers and cause a false negative;
- copy Android Chrome and become indistinguishable from Chrome by UA alone;
- add WebView markers and cause a false positive;
- expose a version different from the installed WebView package.

For stronger evidence, collect the active package version in the Android host and pass it as `nativePackageVersion`.

### Client Hints are optional evidence

The profile API accepts a caller-supplied `clientHintsVersion`, but browser-boundary does not negotiate Client Hints or collect them automatically. Client Hints availability depends on request context, server opt-in, runtime behavior, and the embedding application.

### No real WebView execution

This milestone does not:

- launch Android WebView;
- start an Android emulator;
- install or select historical WebView APKs;
- build a host Android application;
- use Appium, UiAutomator, ADB, or WebDriver for Android;
- claim that desktop Chromium execution proves WebView compatibility.

## Future real-device execution

Testing a website in actual Android WebView versions would require a separate architecture, potentially including:

1. Android devices or emulator images.
2. A controlled host APK containing a WebView test harness.
3. WebView provider installation and version verification.
4. Android and provider compatibility rules.
5. ADB, Appium, UiAutomator, or WebView debugging/CDP integration.
6. APK/provider download and cache management.
7. Device lifecycle, permissions, network, and cleanup handling.
8. OEM and Android-version matrix coverage.

That execution layer should produce observed WebView results and must remain separate from static Blink-baseline modeling.

## Troubleshooting

### A canonical WebView UA is reported as unknown

Check that the UA contains:

- an Android marker;
- a bounded `wv` marker or the legacy `Version/4.0 ... Chrome/...` sequence;
- a syntactically valid `Chrome/<version>` token.

A host application may have replaced the default UA. In that case, provide explicit or native package version evidence through the TypeScript API.

### Android Chrome is reported as unknown

That is expected. Android Chrome is intentionally not classified as Android WebView solely from its Android and Chrome tokens.

### Compatibility result is unknown

Common reasons include:

- no valid version was exposed;
- version sources disagree on their major version;
- the requested feature is absent from the compatibility table;
- the requested WebView capability is absent from the override registry;
- a legacy WebView release cannot be safely mapped to a Blink milestone.

### `--engines android-webview` fails

That is intentional. `--engines` selects executable scan families. Use `identify` for User-Agent modeling, or use the TypeScript profile API when package or explicit version evidence is available.

## Summary

Android WebView support in `browser-boundary` is an additive compatibility-modeling layer:

```text
Android WebView runtime identity
  + observed/version evidence
  + Chromium/Blink compatibility baseline
  + WebView-specific runtime constraints
```

It reuses Chromium/Blink compatibility data where technically appropriate while preserving the distinction between rendering-engine compatibility and Android WebView runtime compatibility.

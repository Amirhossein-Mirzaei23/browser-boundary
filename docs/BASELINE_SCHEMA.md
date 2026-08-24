# Boundary Baseline Schema (version 1)

Machine-readable contract for an **accepted boundary** — the artifact `browser-boundary` compares later scans against. Validated at runtime by `validateBaseline` (`src/baseline/schema.ts`) with actionable diagnostics; no schema-library dependency.

## Forward-compatibility policy — STRICT

Only schema version `1` is supported. Unknown **top-level** fields are rejected so a future schema change can never be silently reinterpreted by an older consumer. Additions require a new `schemaVersion`.

## Top-level shape

| Field | Type | Notes |
| --- | --- | --- |
| `schemaVersion` | `1` | fixed |
| `createdAt` | ISO-8601 string | must parse as a date |
| `application?` | `{ id?, revision? }` | optional consumer provenance |
| `packageVersion` | string | `browser-boundary` version that produced the accepted scan |
| `configFingerprint` | 64-char sha256 hex | digest of the canonical `scope` (Task 10) |
| `scope` | `NormalizedScanScope` | canonical, machine-comparable scan scope |
| `engines` | `BaselineEngineEntry[]` | exactly one entry per engine |

## NormalizedScanScope

Everything that materially affects the boundary — nothing that does not (no executable paths, cache/output directories, timestamps, or artifact paths):

```jsonc
{
  "routes": [{ "url": "http://127.0.0.1:4317/", "label": "home",
               "readiness": { "kind": "selectors", "selectors": ["#app"], "mode": "any" } }],
  "checks": { "navigation": true, "javascript": true, "console": true,
              "network": true, "rendering": true, "readiness": true },
  "engines": ["chromium"],                       // sorted
  "controllerPolicy": "auto",                    // auto | playwright | webdriver
  "minConfidence": "low",
  "floors": { "chromium": 67 },
  "ignoredPatterns": [],                         // regex sources, deterministically normalized
  "criticalResourceTypes": [],
  "timeoutMs": 30000,
  "waitUntil": "domcontentloaded",
  "viewport": { "width": 1366, "height": 768 },
  "nonPortable": []                              // diagnostics: non-portable scope properties
}
```

Readiness kinds: `selectors`, `none`, and `non-portable-function` — **function readiness is never serialized from source text**; it is marked non-portable, which makes the scan non-comparable unless the fingerprint context discloses it.

## BaselineEngineEntry

| Field | Notes |
| --- | --- |
| `engine` | `chromium` \| `firefox` \| `webkit` (duplicates rejected) |
| `versionType` | `real-major`, or `playwright-revision` **required** for WebKit (never a Safari major) |
| `oldestVerifiedPassing` / `firstVerifiedFailing` | verified evidence only; `null` when unobserved |
| `failureReason` | reason attached to the first verified failing version |
| `testedVersions` / `inconclusiveVersions` | what was actually evaluated |
| `browserSource` | build label (e.g. `Chrome for Testing 121.0.6167.184`) |
| `controller` | `playwright` \| `webdriver` |
| `os`, `arch` | capture host |
| `identity` | `{ requestedVersion, runtimeVersion, executableVersion, verified, mismatchReason }` |

## Comparison states

`improved` · `unchanged` · `regressed` · `inconclusive` · `unbaselined` · `not-compared`

Conservative semantics: `inconclusive`, `error`, missing, skipped, or infrastructure-only evidence is **never** a verified regression.

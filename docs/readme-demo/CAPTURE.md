# README Demo Capture

How the committed demo assets under `docs/assets/readme-demo/` are regenerated from repository sources. Nothing in the assets is hand-edited.

## Command

```bash
node --import tsx scripts/capture-readme-demo.ts
```

The capture **first reproduces the boundary through the Task-4 verifier** (`scripts/verify-readme-demo.ts`) and **aborts before generating any asset** if the expected real boundary (Chromium 120 verified FAIL → 121 verified PASS, identity-verified) does not reproduce. It then records the real Chrome-for-Testing binaries loading the demo page (Playwright video + screenshots), assembles `browser-boundary-demo.gif` / `browser-boundary-demo.png` with ffmpeg, and writes the sanitized `transcript.txt` from the actual verifier output (home paths and ephemeral ports are redacted).

## Recorded capture environment

| Item | Value |
| --- | --- |
| OS / architecture | Linux x64 |
| Node.js | v22.19.0 |
| Playwright | 1.62.1 |
| Requested versions | chromium 120 (expected fail), 121 (expected pass) |
| Controller | playwright (CDP) |
| Identity methods | executable `--version` (on-disk) + `browser.version()` (live session) |
| Versions cached | yes — Chrome-for-Testing 120.0.6099.109 and 121.0.6167.184 in the local `browser-boundary` cache |

See `transcript.txt` for the exact verifier output of the committed capture (dated inside the file).

## Boundary semantics

Adjacent, identity-verified pair: `oldestVerifiedPassing = 121`, `firstVerifiedFailing = 120` (see `examples/readme-demo/README.md`). Values in the assets are observed, not illustrative.

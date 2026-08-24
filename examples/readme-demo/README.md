# README demo target

A localhost-only page with a **deterministic, real-verified Chromium compatibility boundary**, used by the reproducible README demo and the demo verification workflow.

- Run it: `npm run demo:readme` → http://127.0.0.1:4317/
- Test it: `npm run test:readme-demo`

## The deterministic break

The page's inline script calls `Array.fromAsync([2, 1])`, which first shipped in **Chromium 121**. Older Chromium builds throw a `TypeError` (`Array.fromAsync is not a function`), which the scanner reports as a real compatibility failure — not an infrastructure error. The page makes **zero external requests** and displays its runtime user-agent as presentation evidence only (scans verify identity independently via on-disk + live-session identity).

## Validated boundary pair

Verified by real execution on 2026-08-24 (Linux x64, Playwright CDP controller, identity gate active — on-disk and live-session majors matched the requested major on both runs):

| Chromium | Build | Verdict | Evidence |
| --- | --- | --- | --- |
| 120 | Chrome-for-Testing `120.0.6099.109` | verified **FAIL** | `TypeError: Array.fromAsync is not a function` (uncaught page error) |
| 121 | Chrome-for-Testing `121.0.6167.184` | verified **PASS** | page rendered, zero JS errors |

This is an **adjacent** major pair, so the boundary semantics are:

- `oldestVerifiedPassing = 121`
- `firstVerifiedFailing = 120`

The pair was validated by launching the real binaries through `runCheck` — not inferred from compatibility tables.

## Reproducing

The demo verification workflow reproduces the whole boundary through the real source CLI and fails unless execution, identity, compatibility, and report evidence all agree:

```bash
npm run verify:readme-demo          # exit 0 = all four proof levels verified
npm run verify:readme-demo -- --keep-output   # keep the generated compatibility.json
```

Manual route:

```bash
npm run demo:readme &          # serve the target on 127.0.0.1:4317
npm run scan -- --url http://127.0.0.1:4317/ --engines chromium --versions 120,121 --headless --format json
```

## Server API

`examples/readme-demo/server.ts` exports `startDemoServer(port?, host?)`:

- binds `127.0.0.1` only; `port: 0` picks an ephemeral port for tests;
- serves exactly one HTML page (`404` elsewhere), `cache-control: no-store`;
- returns a server with a promise-based `close()` for clean shutdown in tests and capture scripts.

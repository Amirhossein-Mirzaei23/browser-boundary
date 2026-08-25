# Browser-Boundary Measurement Definitions

This document is the canonical definition of the activation and evaluation metrics used to assess `browser-boundary`. It supports the metrics section of [`PRODUCT_GROWTH_STRATEGY.md`](PRODUCT_GROWTH_STRATEGY.md). Numeric targets must not be assigned until these definitions are stable and evaluators apply them consistently.

All measurement described here is **manual and evaluator-operated**. The package contains no telemetry.

## Event Definitions

| Event | Definition |
| --- | --- |
| `start` | The evaluator begins the documented installation or their first `browser-boundary` command (whichever begins the documented evaluation path). |
| `first-result` | The CLI emits a completed, understandable current-browser result — the evaluator can state what was measured, on which engine, and what the outcome means. A current-browser proof (Fast Start) can satisfy `first-result`; it does **not** by itself satisfy `first-successful-scan`. |
| `first-successful-scan` | At least one engine has verified pass/fail compatibility evidence produced by a completed scan. Verified pass or verified fail both count; the scan itself must succeed. |

### Exclusions and clarifications

- **Infrastructure-only outcomes:** a result with no verified compatibility verdict (browser launch failure, driver error, timeout, skipped engine, or inconclusive evidence) is excluded from compatibility success. It is recorded as an infrastructure failure and never counted as a compatibility pass or regression.
- **Inconclusive evidence:** `inconclusive`, `error`, missing, skipped, or infrastructure-only evidence is never classified as a verified compatibility outcome.
- **Unit of recurring adoption:** the **repository**, not the invocation and not the package install. Repeated invocations, CI matrix runs, retries, and reinstalls within the same repository count once for adoption and retention purposes.
- **Mistaking Fast Start for boundary discovery:** evaluators are explicitly asked whether, after Fast Start, they believed they had completed boundary discovery. This confusion is a defect signal for the flow, not a success metric.

## Manual Evaluator Worksheet

Each evaluation session is recorded with one worksheet. Worksheets never leave the evaluator's notes unless the evaluator chooses to file an issue; nothing is uploaded automatically.

```text
Evaluator worksheet — browser-boundary activation session

Evaluator:            (name or anonymous ID)
Repository evaluated: (URL or local path; not uploaded anywhere)
Date:

start:                (timestamp — first documented install/command)
first-result:         (timestamp — completed, understandable current-browser result)
first-successful-scan:(timestamp — first verified per-engine pass/fail evidence)

Environment:
  OS / architecture:
  Node version:
  Package version:
  Engines exercised:  (chromium / firefox / webkit)

Completed stage:
  [ ] install and setup
  [ ] first-result (current-browser proof)
  [ ] first-successful-scan (verified engine evidence)
  [ ] boundary discovery (oldest-version scan)
  [ ] baseline created

Failure class (if any stage failed):
  [ ] none — all attempted stages completed
  [ ] installation / environment
  [ ] browser download or launch (infrastructure)
  [ ] CLI usability (could not understand output or options)
  [ ] documentation gap
  [ ] application-under-test failure (site itself broken)

Fast Start comprehension check:
  Did the evaluator mistake Fast Start (current-browser proof) for full
  boundary discovery?  [ ] yes  [ ] no
  Notes:

Free-form notes:
```

## Privacy Guardrails

These definitions were reviewed against the following guardrails and comply with all of them:

- **No hidden telemetry:** nothing in this document requires automatic data collection; all data is captured by a human evaluator on the worksheet above.
- **No unique-machine identifier:** worksheets use evaluator-chosen labels; no hardware, license, or install fingerprint is generated or recorded.
- **No repository upload:** repository URLs stay in local evaluator notes unless the evaluator voluntarily files an issue.
- **No automatic network events:** the metric definitions involve no network calls, beacons, or callbacks from the package.

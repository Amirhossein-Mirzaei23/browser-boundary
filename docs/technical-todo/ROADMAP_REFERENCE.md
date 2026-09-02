# Product Growth Roadmap Reference

This document contains shared validation, risk, open-question, and phase-exit material for the task documents in `docs/technical-todo/tasks/`.

# Files Likely to Change by Package

## P0 proof and activation

- `README.md`
- `package.json`
- `src/browsers/identity.ts`
- `src/controllers/types.ts`
- `src/controllers/playwright.ts`
- `src/controllers/webdriver.ts`
- `src/core/compatibility-checker.ts`
- `src/reporting/types.ts`
- `src/cli/options.ts`
- `src/cli/index.ts`
- `examples/readme-demo/*`
- `scripts/verify-readme-demo.ts`
- `scripts/capture-readme-demo.*`
- `docs/CAPABILITY_MATRIX.md`
- `docs/readme-demo/CAPTURE.md`
- `docs/assets/readme-demo/*`
- focused unit/integration tests under `tests/`

## P1 retention and CI

- `src/baseline/types.ts`
- `src/baseline/schema.ts`
- `src/baseline/normalize.ts`
- `src/baseline/create.ts`
- `src/baseline/io.ts`
- `src/baseline/compare.ts`
- `src/cli/baseline.ts`
- `src/cli/compare.ts`
- `src/cli/exit-codes.ts`
- `src/reporting/comparison-json.ts`
- `src/reporting/comparison-markdown.ts`
- `src/reporting/github-summary.ts`
- `src/index.ts`
- `docs/BASELINE_SCHEMA.md`
- `docs/CI_BASELINE_WORKFLOW.md`
- `docs/ci/github-actions.yml`
- focused unit/integration tests under `tests/`

## Evidence-gated P2/P3

Do not create these until their documented entry gates pass. Likely roots are `src/diagnostics/`, `src/policy/`, `src/providers/`, `docs/experiments/`, and `docs/providers/`.

---

# Validation Matrix

Run focused tests after each task, then these gates at phase boundaries:

```bash
npm test
npm run typecheck
npm run build
npm run pack-check
```

Run browser integration checks when controllers, identity, detection, readiness, reports, or the demo changes:

```bash
npm run test:fixtures
npm run test:readme-demo
npm run verify:readme-demo
```

P1 comparison release validation must prove all of the following:

| Case | Expected state | Gate result |
| --- | --- | --- |
| Same verified floor | `unchanged` | pass |
| Older current verified floor, equivalent scope | `improved` | pass |
| Newer current floor plus relevant verified failure | `regressed` | fail only with explicit gate |
| Newer/missing current floor without failure proof | `inconclusive` | no regression failure |
| Infrastructure-only current result | `inconclusive` | no regression failure |
| Current verified engine has no baseline | `unbaselined` | pass by default |
| Baseline engine absent from current scan | `not-compared` | pass by default plus warning |
| `versionType` mismatch | not comparable | no regression failure |
| Material config drift | warning/inconclusive per severity | never silent |

---

# Risks, Tradeoffs, and Mitigations

## Identity verification may break old controllers

Old Chromium/ChromeDriver combinations expose inconsistent capabilities. Keep parsing protocol-specific, retain raw values for investigation, and produce `inconclusive` when identity cannot be independently proven. Never weaken verification to make the demo pass.

## Baseline provenance may become noisy

Normalize comparison-critical scope and retain its readable form plus fingerprint. Exclude temporary paths, executable paths, cache paths, timestamps, and report locations from fingerprinting.

## Numeric version comparison may be overgeneralized

Implement explicit comparators per `versionType`. Real-major comparison is numeric; Playwright revisions must follow their own documented ordering or remain incomparable when ordering is not trustworthy.

## Configuration drift policy may be too strict or too permissive

Start with material fields named by the strategy: URLs/route labels, checks/readiness, engines/controllers, confidence thresholds, and search floors. Return structured diagnostics listing changed fields; do not hide the decision behind only a hash mismatch.

## Route aggregation can hide the actual regression

Carry route-level check references into baseline and comparison evidence. A per-engine state must link to the route(s) whose verified evidence moved the aggregate boundary.

## Existing scan exit code 1 already means any verified failure

Do not silently turn normal scans into baseline gates. Keep legacy scan behavior, and make regression protection explicit through `compare --gate`. Centralize exit-code documentation and tests before adding command-specific behavior.

## Demo artifacts can become stale or expose private data

Make capture depend on machine validation; store environment metadata; fail on unexpected evidence; use localhost-only content; review every frame; and keep a text/static fallback.

## P2/P3 scope can dilute the product

Apply the strategy's decision filter: reject work that does not materially improve discovery, evidence verification, baseline management, regression protection, or diagnosis required to trust those outcomes.

---

# Open Questions to Resolve During Implementation

1. Should schema version 1 reject unknown fields or preserve them for forward compatibility? Decide before Task 9 implementation and document the policy.
2. Should a baseline contain an explicit entry for an engine with no accepted verified boundary, or should creation omit it and let comparison derive `unbaselined`? Prefer omission unless reviewability requires explicit rejection metadata.
3. Which scope changes are hard non-comparability versus warnings? At minimum, version-type mismatch is hard; route/check/readiness/controller changes should be explicitly classified before Task 12.
4. How should Playwright revision ordering be established? If numeric ordering is not guaranteed by current evidence, support `unchanged` only and classify changed revisions as inconclusive/not comparable.
5. Should explicit gate mode reuse exit code 1 or add a new code? Preserve existing automation compatibility; document the chosen command-scoped meaning.
6. What adjacent Chromium pair produces a deterministic application failure on the validated capture host? Task 3 must answer this through real execution rather than planning assumptions.
7. Should the official workflow run full historical discovery on every pull request, on a schedule, or before release? Default to scheduled/release historical scans and keep PR checks narrow until measured runtime/cost supports more.
8. Which application/repository revision inputs are accepted from CLI and environment? Keep them explicit and avoid reading Git implicitly unless documented and testable.

---

# Final Phase Exit Checklist

## P0

- [ ] Real historical execution, identity, compatibility, and detection proof agree.
- [ ] README demo is reproducible, accessible, and non-illustrative.
- [ ] Fast Start reaches a current-Chromium result and is clearly not discovery.
- [ ] Capability matrix exposes costs and limits before downloads.
- [ ] TTFR and first-success measurement definitions exist.

## P1

- [ ] Baseline schema and normalized provenance are versioned and documented.
- [ ] Baseline creation is explicit and non-destructive.
- [ ] Every engine receives one stable comparison state.
- [ ] Regression requires relevant verified failure evidence.
- [ ] Inconclusive/infrastructure-only evidence cannot fail the regression gate.
- [ ] Config drift and version-domain mismatches are visible.
- [ ] JSON, Markdown, terminal, and GitHub summary outputs agree.
- [ ] Official GitHub workflow caches dependencies and uploads evidence.
- [ ] Comparison never rewrites the baseline.

## P2/P3

- [ ] Each selected task cites the observed evidence that cleared its gate.
- [ ] Unselected hypotheses remain backlog rather than parallel commitments.
- [ ] Browserslist remains declared policy, not runtime proof.
- [ ] Remote results retain provider/OS/device/controller/version provenance.
- [ ] Expansion does not reposition the package as generic cross-browser testing.

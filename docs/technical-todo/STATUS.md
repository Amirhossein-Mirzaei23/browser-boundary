# Roadmap Execution Status

Record of execution decisions against `PRODUCT_GROWTH_TECHNICAL_TASKS.md` (updated 2026-08-25).

## Phase 1 — P0 Proof and Activation: COMPLETE

Tasks 1–8 implemented and committed. Highlights:

- identity gate in the controller contract (on-disk + live-session verification; mismatch → inconclusive);
- deterministic demo target (`examples/readme-demo`) with a **real verified boundary**: Chromium 120 verified FAIL → 121 verified PASS (Chrome-for-Testing, adjacent majors, identity-verified on this host);
- `verify:readme-demo` reproduces the boundary through the real CLI and enforces all four proof levels;
- `quick` Fast Start command (current-browser proof, explicitly not boundary discovery);
- capability matrix (`docs/CAPABILITY_MATRIX.md`) linked before historical-download instructions;
- README restructured outcome-first with captured demo assets;
- P0 gate run clean: unit/typecheck/build/fixtures/readme-demo/verifier/pack-check all pass; an evaluator full-discovery run reproduced the same boundary and correctly reported an unavailable Firefox 73 as INCONCLUSIVE (never a compatibility failure).

## Phase 2 — P1 Baseline, Regression, and CI: COMPLETE

Tasks 9–18 implemented and committed as one coherent release:

- baseline schema v1 (strict validation, no new dependency) + canonical scope normalization with sha256 fingerprint;
- explicit `baseline create` (non-destructive, reviewable) and `compare [--gate]` (fails **only** on verified regressions);
- canonical comparison JSON/Markdown reporters + GitHub Step Summary (render-only, always agreeing);
- official consumer workflow (`docs/ci/github-actions.yml`) with browser caching, gated compare, artifacts (`if: always()`), and no automatic baseline overwrite;
- end-to-end integration test (`tests/integration/baseline-regression.test.ts`) proving: unchanged/improved pass, verified regression fails the gate, infrastructure-only stays inconclusive, baseline bytes never change, all reporters agree.

## Phase 3 — P2: Step 1 of Task 22 done; remainder DEFERRED (evidence gates not met)

- **Task 22 Step 1**: documentation prototype committed (`docs/experiments/BROWSERSLIST_COMPARISON.md`). The runtime prototype is gated on its evaluation (Step 2) and is intentionally not built.
- **Task 19** (shared reason codes): trigger — frequent failed scans/support cases unrecoverable from free-text reasons. **Not observed.** No support cases exist; scan reasons in this codebase already carry structured codes where machine handling exists (e.g. `HistoricalUnavailableError.code`, comparison `reasonCode`s).
- **Task 20** (`doctor`): trigger — recovery genuinely needs an aggregator. **Not observed.**
- **Task 21** (config validation/dry-run): trigger — repeat configuration is a demonstrated blocker. **Not observed.**
- **Task 23** (framework/auth/monorepo example): trigger — an **observed** example from real usage. **None observed** (no production users documented yet).

## Phase 4 — P3: NOT STARTED (entry gate not met)

Entry gate: recurring baseline usage and remote-coverage demand demonstrated. No recurring baseline usage exists yet (P1 just landed); Tasks 24–25 (provider-neutral provenance, hosted provider spike) remain unstarted by design.

## How to resume

Each deferred task lists its trigger in its task file. When trigger evidence appears, run the task exactly as specified (TDD, conservative evidence semantics, focused commits).

# Product Growth Technical Tasks

> **For Hermes:** Implement these plans in roadmap order. Do not start a later phase until its entry gate is satisfied.

**Goal:** Evolve `browser-boundary` from one-time discovery into recurring browser-support infrastructure through **Discover → Verify → Baseline → Protect**.

**Product source:** [`../product/PRODUCT_GROWTH_STRATEGY.md`](../product/PRODUCT_GROWTH_STRATEGY.md)

**Shared roadmap reference:** [`ROADMAP_REFERENCE.md`](ROADMAP_REFERENCE.md)

---

## Phase 1 — P0 Proof and Activation

- [Task 1: Record P0 Measurement Definitions](tasks/01-record-p0-measurement-definitions.md)
- [Task 2: Add Verified Browser Identity to the Controller Contract](tasks/02-add-verified-browser-identity-to-the-controller-contract.md)
- [Task 3: Build the Deterministic Local Demo Target](tasks/03-build-the-deterministic-local-demo-target.md)
- [Task 4: Add a Demo Verification Workflow](tasks/04-add-a-demo-verification-workflow.md)
- [Task 5: Add Fast Start as a Distinct Current-Browser Proof](tasks/05-add-fast-start-as-a-distinct-current-browser-proof.md)
- [Task 6: Publish a Validated Capability Matrix](tasks/06-publish-a-validated-capability-matrix.md)
- [Task 7: Capture and Integrate the Reproducible README Demo](tasks/07-capture-and-integrate-the-reproducible-readme-demo.md)
- [Task 8: Complete the P0 Quality and Evaluation Gate](tasks/08-complete-the-p0-quality-and-evaluation-gate.md)

## Phase 2 — P1 Baseline, Regression, and CI

- [Task 9: Define Versioned Scan and Baseline Schemas](tasks/09-define-versioned-scan-and-baseline-schemas.md)
- [Task 10: Normalize Scan Scope and Compute a Stable Fingerprint](tasks/10-normalize-scan-scope-and-compute-a-stable-fingerprint.md)
- [Task 11: Create Baselines Explicitly from Verified Scans](tasks/11-create-baselines-explicitly-from-verified-scans.md)
- [Task 12: Implement Conservative Per-Engine Comparison](tasks/12-implement-conservative-per-engine-comparison.md)
- [Task 13: Add `baseline create` CLI Command](tasks/13-add-baseline-create-cli-command.md)
- [Task 14: Add `compare` and Opt-In Regression Gate Commands](tasks/14-add-compare-and-opt-in-regression-gate-commands.md)
- [Task 15: Add Canonical Comparison JSON and Markdown Reporters](tasks/15-add-canonical-comparison-json-and-markdown-reporters.md)
- [Task 16: Add GitHub Step Summary Output](tasks/16-add-github-step-summary-output.md)
- [Task 17: Ship One Official GitHub Actions Consumer Workflow](tasks/17-ship-one-official-github-actions-consumer-workflow.md)
- [Task 18: Complete the P1 End-to-End Retention Gate](tasks/18-complete-the-p1-end-to-end-retention-gate.md)

## Phase 3 — P2 Evidence-Gated Developer Experience

- [Task 19: Introduce Shared Reason Codes Only if Failed Scans Block Use](tasks/19-introduce-shared-reason-codes-only-if-failed-scans-block-use.md)
- [Task 20: Add `doctor` as an Aggregator Only if Recovery Needs It](tasks/20-add-doctor-as-an-aggregator-only-if-recovery-needs-it.md)
- [Task 21: Add Config Validation/Dry Run Only if Repeat Configuration Is a Blocker](tasks/21-add-config-validation-dry-run-only-if-repeat-configuration-is-a-blocker.md)
- [Task 22: Prototype Browserslist Comparison Before Full Integration](tasks/22-prototype-browserslist-comparison-before-full-integration.md)
- [Task 23: Add Only the Observed Framework/Auth/Monorepo Example](tasks/23-add-only-the-observed-framework-auth-monorepo-example.md)

## Phase 4 — P3 Remote Infrastructure Expansion

- [Task 24: Define Provider-Neutral Provenance and Comparability](tasks/24-define-provider-neutral-provenance-and-comparability.md)
- [Task 25: Spike One Optional Hosted Provider Adapter](tasks/25-spike-one-optional-hosted-provider-adapter.md)

## Execution Order

1. Complete Tasks 1–8 (P0 proof and activation).
2. Verify the P0 exit gate in `ROADMAP_REFERENCE.md`.
3. Complete Tasks 9–18 as one coherent P1 retention release.
4. Select P2 Tasks 19–23 only when observed evidence clears their stated trigger.
5. Start P3 Tasks 24–25 only after recurring baseline usage and remote-coverage demand are demonstrated.

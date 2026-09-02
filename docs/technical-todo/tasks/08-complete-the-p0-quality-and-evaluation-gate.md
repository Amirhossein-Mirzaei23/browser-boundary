# Task 8: Complete the P0 Quality and Evaluation Gate

> **For Hermes:** Use subagent-driven-development skill to implement this task with spec-compliance and code-quality review.

**Roadmap phase:** Phase 1 — P0 Proof and Activation

**Product goal:** Evolve `browser-boundary` through **Discover → Verify → Baseline → Protect** while preserving conservative evidence semantics.

---

## Shared Implementation Rules

- Follow `docs/product/PRODUCT_GROWTH_STRATEGY.md` as the product source of truth.
- Follow `docs/product/README_DEMO_PRD.md` for deterministic README demo requirements.
- Use TDD for behavior changes: failing focused test, verify failure, minimum implementation, verify pass, then relevant suites.
- Keep comparison logic pure and independent from filesystem, CLI, and reporter adapters.
- Never classify `inconclusive`, `error`, missing, skipped, or infrastructure-only evidence as a verified regression.
- Never compare real browser majors with Playwright WebKit revisions as though they share a version domain.
- Never mutate an accepted baseline during comparison.
- Do not commit generated `dist/`, `reports/`, browser caches, raw traces, or logs.

---

**Objective:** Verify proof, Fast Start, documentation, and package behavior before opening P1.

**Files:**
- Modify: documentation or tests only when validation exposes a defect

**Step 1: Run automated gates**

```bash
npm test
npm run typecheck
npm run build
npm run test:fixtures
npm run test:readme-demo
npm run verify:readme-demo
npm run pack-check
```

Expected: every command passes.

**Step 2: Perform a clean evaluator run**

From a clean checkout/cache profile, follow README Fast Start, exact historical check, and full discovery instructions. Record TTFR and failures using `docs/product/MEASUREMENT_DEFINITIONS.md`.

**Step 3: Validate P0 exit criteria**

Confirm:

- README proof is observed and reproducible;
- Fast Start completes and is not described as historical discovery;
- capability limits are visible before expensive downloads;
- TTFR and first-successful-scan definitions are usable;
- no unavailable browser is classified as compatibility failure.

**Step 4: Commit any validation-only corrections**

```bash
git add <only-files-corrected-by-validation>
git commit -m "fix: close P0 activation validation gaps"
```

---

# Phase 2 — P1 Baseline, Regression, and CI

**Entry gate:** Phase 1 exit criteria have been met.

## Task Completion Checklist

- [ ] Every listed step is complete.
- [ ] Focused tests pass.
- [ ] Relevant repository quality gates pass.
- [ ] Documentation and machine-readable output agree.
- [ ] No baseline, generated artifact, or compatibility verdict was changed implicitly.

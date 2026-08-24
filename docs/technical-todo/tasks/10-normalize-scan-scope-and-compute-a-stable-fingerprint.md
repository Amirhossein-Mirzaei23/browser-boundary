# Task 10: Normalize Scan Scope and Compute a Stable Fingerprint

> **For Hermes:** Use subagent-driven-development skill to implement this task with spec-compliance and code-quality review.

**Roadmap phase:** Phase 2 — P1 Baseline, Regression, and CI

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

**Objective:** Detect material configuration drift without noisy machine-specific differences.

**Files:**
- Create: `src/baseline/normalize.ts`
- Create: `tests/unit/baseline-normalize.test.ts`
- Modify: `src/config/resolve.ts:18-50`
- Modify: `src/core/scanner.ts:85-102`

**Step 1: Write failing canonicalization tests**

Assert:

- semantically equivalent config produces the same fingerprint regardless of object-key order;
- URL order and route labels follow a documented stable policy;
- changed URL/readiness/check/controller/confidence/floor changes the fingerprint;
- output directory, cache directory, executable path, timestamps, and artifact path do not change it;
- regular-expression patterns normalize deterministically;
- function readiness is marked non-portable/non-comparable rather than serialized from source text.

**Step 2: Run focused test to verify failure**

Run: `node --test --import tsx tests/unit/baseline-normalize.test.ts`

Expected: FAIL because normalization does not exist.

**Step 3: Implement canonical normalized scope**

Create a recursively key-sorted JSON representation and hash it with Node's `crypto.createHash('sha256')`. Keep the unhashed normalized scope in the baseline so reviewers can understand fingerprint changes.

**Step 4: Add comparison diagnostics metadata**

Return both fingerprint and a list of non-portable/unsupported scope properties so the comparison layer can emit an actionable warning.

**Step 5: Run focused test and unit suite**

```bash
node --test --import tsx tests/unit/baseline-normalize.test.ts
npm test
```

Expected: both pass.

**Step 6: Commit**

```bash
git add src/baseline/normalize.ts src/config/resolve.ts src/core/scanner.ts tests/unit/baseline-normalize.test.ts
git commit -m "feat: normalize baseline comparison scope"
```

## Task Completion Checklist

- [ ] Every listed step is complete.
- [ ] Focused tests pass.
- [ ] Relevant repository quality gates pass.
- [ ] Documentation and machine-readable output agree.
- [ ] No baseline, generated artifact, or compatibility verdict was changed implicitly.

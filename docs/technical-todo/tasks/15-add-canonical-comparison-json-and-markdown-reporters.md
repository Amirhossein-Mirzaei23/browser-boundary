# Task 15: Add Canonical Comparison JSON and Markdown Reporters

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

**Objective:** Make machine and human comparison outputs agree exactly on states and warnings.

**Files:**
- Create: `src/reporting/comparison-json.ts`
- Create: `src/reporting/comparison-markdown.ts`
- Modify: `src/reporting/index.ts`
- Modify: `src/index.ts`
- Create: `tests/unit/comparison-reporting.test.ts`
- Modify: `tests/unit/reporting.test.ts`

**Step 1: Write failing reporter-agreement tests**

For each comparison state, assert JSON and Markdown expose the same engine, state, baseline/current boundary, version type, comparability, reason code, warnings, and evidence references. Assert `inconclusive` never appears as `regressed` in prose.

**Step 2: Run focused test to verify failure**

Run: `node --test --import tsx tests/unit/comparison-reporting.test.ts`

Expected: FAIL because comparison reporters do not exist.

**Step 3: Implement render-first reporters**

Add pure `renderComparisonJson` / `renderComparisonMarkdown` functions and small filesystem wrappers. Render only the canonical comparison object; do not recompute states in reporters.

**Step 4: Integrate optional compare output paths**

Have `src/cli/compare.ts` write `comparison.json` and `comparison.md` when requested.

**Step 5: Run focused tests and unit suite**

```bash
node --test --import tsx tests/unit/comparison-reporting.test.ts tests/unit/reporting.test.ts
npm test
```

Expected: all pass.

**Step 6: Commit**

```bash
git add src/reporting/comparison-json.ts src/reporting/comparison-markdown.ts src/reporting/index.ts src/index.ts src/cli/compare.ts tests/unit/comparison-reporting.test.ts tests/unit/reporting.test.ts
git commit -m "feat: report boundary comparisons consistently"
```

## Task Completion Checklist

- [ ] Every listed step is complete.
- [ ] Focused tests pass.
- [ ] Relevant repository quality gates pass.
- [ ] Documentation and machine-readable output agree.
- [ ] No baseline, generated artifact, or compatibility verdict was changed implicitly.

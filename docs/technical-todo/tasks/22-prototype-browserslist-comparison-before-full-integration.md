# Task 22: Prototype Browserslist Comparison Before Full Integration

> **For Hermes:** Use subagent-driven-development skill to implement this task with spec-compliance and code-quality review.

**Roadmap phase:** Phase 3 — P2 Evidence-Gated Developer Experience

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

**Objective:** Test whether declared-versus-observed presentation helps users proceed to runtime verification or baseline acceptance.

**Trigger evidence:** Documentation/user research shows demand after P1 retention works.

**Files:**
- Create first: `docs/experiments/BROWSERSLIST_COMPARISON.md`
- Optional prototype after demand: `src/policy/browserslist.ts`
- Optional test: `tests/unit/browserslist-policy.test.ts`
- Modify: `package.json` only after deciding a `browserslist` dependency is necessary

**Step 1: Run a documentation prototype**

Present declared intent and observed evidence side-by-side. Explicitly label WebKit revision as not comparable to Safari and preserve inconclusive evidence.

**Step 2: Evaluate behavior**

Measure whether evaluators proceed to a scan or baseline. If they do not, retain Browserslist as positioning and stop.

**Step 3: If the gate passes, write failing parser/comparison tests**

Cover common config sources, engine naming, range normalization, unsupported targets, no automatic config rewriting, and no Safari mapping from WebKit revision.

**Step 4: Implement the minimum read-only integration**

Use the established `browserslist` package only after confirming it is needed and compatible with the package's Node support. Keep policy and runtime evidence separate in types and output.

**Step 5: Run release gates and commit**

```bash
npm test
npm run typecheck
npm run build
npm run pack-check
git add docs/experiments/BROWSERSLIST_COMPARISON.md src/policy/browserslist.ts tests/unit/browserslist-policy.test.ts package.json package-lock.json
git commit -m "feat: compare declared policy with runtime evidence"
```

## Task Completion Checklist

- [ ] Every listed step is complete.
- [ ] Focused tests pass.
- [ ] Relevant repository quality gates pass.
- [ ] Documentation and machine-readable output agree.
- [ ] No baseline, generated artifact, or compatibility verdict was changed implicitly.

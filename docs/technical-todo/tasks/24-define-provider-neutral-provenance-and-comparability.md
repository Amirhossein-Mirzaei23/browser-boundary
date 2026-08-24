# Task 24: Define Provider-Neutral Provenance and Comparability

> **For Hermes:** Use subagent-driven-development skill to implement this task with spec-compliance and code-quality review.

**Roadmap phase:** Phase 4 — P3 Remote Infrastructure Expansion

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

**Objective:** Extend evidence contracts so local and remote results remain distinguishable and are compared only when valid.

**Files:**
- Modify: `src/browsers/types.ts`
- Modify: `src/reporting/types.ts`
- Modify: `src/baseline/types.ts`
- Modify: `src/baseline/compare.ts`
- Create: `tests/unit/provider-provenance.test.ts`

**Step 1: Write failing provenance tests**

Require provider id, execution location, vendor, OS, architecture, browser source, controller, version type, requested version, runtime version, and device model where applicable. Assert local and remote evidence with incompatible provenance produces a comparability warning rather than an authoritative regression.

**Step 2: Run test to verify failure**

Run: `node --test --import tsx tests/unit/provider-provenance.test.ts`

Expected: FAIL.

**Step 3: Add the minimum interfaces**

Keep the existing local provider as the default adapter. Do not add credentials or vendor SDKs in this task.

**Step 4: Run unit/type/build gates and commit**

```bash
npm test
npm run typecheck
npm run build
git add src/browsers/types.ts src/reporting/types.ts src/baseline/types.ts src/baseline/compare.ts tests/unit/provider-provenance.test.ts
git commit -m "feat: preserve provider provenance in comparisons"
```

## Task Completion Checklist

- [ ] Every listed step is complete.
- [ ] Focused tests pass.
- [ ] Relevant repository quality gates pass.
- [ ] Documentation and machine-readable output agree.
- [ ] No baseline, generated artifact, or compatibility verdict was changed implicitly.

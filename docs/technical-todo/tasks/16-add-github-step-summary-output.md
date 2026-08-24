# Task 16: Add GitHub Step Summary Output

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

**Objective:** Render concise GitHub-native comparison evidence without adding JUnit or annotations prematurely.

**Files:**
- Create: `src/reporting/github-summary.ts`
- Modify: `src/reporting/index.ts`
- Modify: `src/cli/compare.ts`
- Create: `tests/unit/github-summary.test.ts`

**Step 1: Write failing summary tests**

Assert a Markdown table contains engine, baseline, current, state, and concise diagnostic. Assert warnings and inconclusive states remain visible. Test safe Markdown escaping and behavior when `GITHUB_STEP_SUMMARY` is absent.

**Step 2: Run focused test to verify failure**

Run: `node --test --import tsx tests/unit/github-summary.test.ts`

Expected: FAIL because the reporter does not exist.

**Step 3: Implement the renderer and append helper**

Append only when explicitly requested or when the compare command is running in GitHub Actions. Do not alter comparison semantics.

**Step 4: Run focused test to verify pass**

Run the command from Step 2.

Expected: PASS.

**Step 5: Commit**

```bash
git add src/reporting/github-summary.ts src/reporting/index.ts src/cli/compare.ts tests/unit/github-summary.test.ts
git commit -m "feat: add GitHub boundary comparison summary"
```

## Task Completion Checklist

- [ ] Every listed step is complete.
- [ ] Focused tests pass.
- [ ] Relevant repository quality gates pass.
- [ ] Documentation and machine-readable output agree.
- [ ] No baseline, generated artifact, or compatibility verdict was changed implicitly.

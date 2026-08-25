# Task 17: Ship One Official GitHub Actions Consumer Workflow

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

**Objective:** Provide a copyable recurring workflow with caching, committed baseline comparison, artifacts, and conservative gating.

**Files:**
- Create: `docs/ci/github-actions.yml`
- Create: `docs/CI_BASELINE_WORKFLOW.md`
- Modify: `README.md` CI section
- Create: `tests/unit/github-workflow-doc.test.ts`

**Step 1: Write failing workflow structure test**

Parse the workflow as text and assert it includes:

- checkout and pinned Node setup;
- `npm ci` or documented package installation;
- Playwright and historical browser cache keys including OS, architecture, package, and Playwright versions;
- scan report generation;
- compare with explicit `--gate`;
- artifact upload guarded with `if: always()`;
- GitHub summary output;
- no automatic baseline overwrite.

**Step 2: Run focused test to verify failure**

Run: `node --test --import tsx tests/unit/github-workflow-doc.test.ts`

Expected: FAIL because the workflow does not exist.

**Step 3: Add the official example**

Use one recommended cadence: quick/current checks on pull requests if desired, historical boundary scan on schedule or release, and baseline compare/gate after scan. Document staging URL/auth assumptions rather than hardcoding a real service.

**Step 4: Document baseline acceptance flow**

Show scan → review report → `baseline create` → commit baseline → run compare in CI. Re-baselining must be a separate reviewed change.

**Step 5: Run focused test to verify pass**

Run the command from Step 2.

Expected: PASS.

**Step 6: Commit**

```bash
git add docs/ci/github-actions.yml docs/CI_BASELINE_WORKFLOW.md README.md tests/unit/github-workflow-doc.test.ts
git commit -m "docs: add official baseline protection workflow"
```

## Task Completion Checklist

- [ ] Every listed step is complete.
- [ ] Focused tests pass.
- [ ] Relevant repository quality gates pass.
- [ ] Documentation and machine-readable output agree.
- [ ] No baseline, generated artifact, or compatibility verdict was changed implicitly.

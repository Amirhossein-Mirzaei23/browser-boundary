# Task 6: Publish a Validated Capability Matrix

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

**Objective:** Show engine/controller/version-domain/platform constraints before users pay historical download cost.

**Files:**
- Create: `docs/CAPABILITY_MATRIX.md`
- Modify: `README.md:48-57`
- Test: `tests/unit/capability-matrix.test.ts`

**Step 1: Write a failing documentation consistency test**

Assert the matrix contains Chromium, Firefox, WebKit, controller, version type, historical support, supported floor, tested OS/architecture, required optional dependency, and known host limitations. Assert WebKit is labeled as a Playwright revision and not a Safari major.

**Step 2: Run test to verify failure**

Run: `node --test --import tsx tests/unit/capability-matrix.test.ts`

Expected: FAIL because the matrix does not exist.

**Step 3: Write the matrix from validated repository behavior**

Ground entries in providers/controllers and explicitly distinguish:

- implemented range;
- validated engine/controller/host combinations;
- best-effort combinations;
- unsupported combinations;
- inconclusive behavior when acquisition or launch fails.

Do not claim every nominal version runs on every supported host.

**Step 4: Link from the README before historical-download instructions**

Keep the README table concise and direct users to the full matrix.

**Step 5: Run test to verify pass**

Run the command from Step 2.

Expected: PASS.

**Step 6: Commit**

```bash
git add docs/CAPABILITY_MATRIX.md README.md tests/unit/capability-matrix.test.ts
git commit -m "docs: publish browser capability matrix"
```

## Task Completion Checklist

- [ ] Every listed step is complete.
- [ ] Focused tests pass.
- [ ] Relevant repository quality gates pass.
- [ ] Documentation and machine-readable output agree.
- [ ] No baseline, generated artifact, or compatibility verdict was changed implicitly.

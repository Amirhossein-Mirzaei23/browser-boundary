# Task 14: Add `compare` and Opt-In Regression Gate Commands

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

**Objective:** Compare a current report with an accepted baseline and fail CI only for verified regressions.

**Files:**
- Create: `src/cli/compare.ts`
- Create: `src/cli/exit-codes.ts`
- Modify: `src/cli/options.ts`
- Modify: `src/cli/index.ts`
- Create: `tests/unit/cli-compare.test.ts`
- Create: `tests/unit/regression-gate.test.ts`

**Step 1: Write failing CLI and exit-code tests**

Define commands:

```text
browser-boundary compare --baseline ./browser-boundary.baseline.json --current ./reports/compatibility.json
browser-boundary compare --baseline ./browser-boundary.baseline.json --current ./reports/compatibility.json --gate
```

Test:

- compare without `--gate` reports regression but does not change existing scan semantics;
- gate fails only when any engine is `regressed`;
- improved/unchanged pass;
- inconclusive does not return regression failure;
- unbaselined and not-compared do not fail by default;
- malformed input remains configuration error;
- no command writes the baseline.

**Step 2: Run focused tests to verify failure**

```bash
node --test --import tsx tests/unit/cli-compare.test.ts tests/unit/regression-gate.test.ts
```

Expected: FAIL because compare/gate do not exist.

**Step 3: Centralize exit codes**

Move existing constants from `src/cli/index.ts` into `src/cli/exit-codes.ts`. Add a documented regression-gate code only if it can remain backward compatible; otherwise reuse compatibility failure code 1 specifically within explicit gate mode and document that distinction.

**Step 4: Implement compare adapter**

Read/validate both artifacts, call the pure comparator, print every engine state and warnings, optionally write comparison reports, and choose exit code from the canonical comparison result.

**Step 5: Run focused tests to verify pass**

Run the command from Step 2.

Expected: PASS.

**Step 6: Run existing CLI tests**

Run: `node --test --import tsx tests/unit/cli-options.test.ts`

Expected: PASS with legacy scan exit semantics unchanged.

**Step 7: Commit**

```bash
git add src/cli/compare.ts src/cli/exit-codes.ts src/cli/options.ts src/cli/index.ts tests/unit/cli-compare.test.ts tests/unit/regression-gate.test.ts
git commit -m "feat: add conservative regression gate"
```

## Task Completion Checklist

- [ ] Every listed step is complete.
- [ ] Focused tests pass.
- [ ] Relevant repository quality gates pass.
- [ ] Documentation and machine-readable output agree.
- [ ] No baseline, generated artifact, or compatibility verdict was changed implicitly.

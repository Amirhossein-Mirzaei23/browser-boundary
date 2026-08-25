# Task 13: Add `baseline create` CLI Command

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

**Objective:** Let users accept a completed scan report as a baseline through a first-class, non-destructive command.

**Files:**
- Modify: `src/cli/options.ts:39-43,45-138,258-315`
- Modify: `src/cli/index.ts:26-126`
- Create: `src/cli/baseline.ts`
- Create: `tests/unit/cli-baseline.test.ts`

**Step 1: Write failing CLI tests**

Define:

```text
browser-boundary baseline create --from ./reports/compatibility.json --output ./browser-boundary.baseline.json
```

Assert valid creation, missing report, invalid schema, no verified evidence, existing output refusal, explicit `--force` behavior, application id/revision metadata, and no baseline mutation during any compare command.

**Step 2: Run focused test to verify failure**

Run: `node --test --import tsx tests/unit/cli-baseline.test.ts`

Expected: FAIL because the command is unknown.

**Step 3: Refactor parser into command-specific parsing**

Keep scan behavior backward compatible while adding a discriminated `ParsedCli` union. Do not overload `Partial<ScanConfig>` with baseline options.

**Step 4: Implement the thin command adapter**

Load and validate the scan JSON, call `createBaseline`, write explicitly, print accepted engines and destination, and return configuration exit code for invalid input.

**Step 5: Update help text**

Document acceptance as explicit and reviewable. State that comparison never rewrites the baseline.

**Step 6: Run focused test to verify pass**

Run the command from Step 2.

Expected: PASS.

**Step 7: Commit**

```bash
git add src/cli/options.ts src/cli/index.ts src/cli/baseline.ts tests/unit/cli-baseline.test.ts
git commit -m "feat: add baseline creation command"
```

## Task Completion Checklist

- [ ] Every listed step is complete.
- [ ] Focused tests pass.
- [ ] Relevant repository quality gates pass.
- [ ] Documentation and machine-readable output agree.
- [ ] No baseline, generated artifact, or compatibility verdict was changed implicitly.

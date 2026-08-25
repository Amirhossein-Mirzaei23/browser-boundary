# Task 11: Create Baselines Explicitly from Verified Scans

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

**Objective:** Generate a diff-friendly accepted baseline without manual JSON editing.

**Files:**
- Create: `src/baseline/create.ts`
- Create: `src/baseline/io.ts`
- Create: `tests/unit/baseline-create.test.ts`
- Modify: `src/index.ts:44-55`

**Step 1: Write failing creation tests**

Cover:

- verified per-engine boundaries become entries;
- WebKit revision remains its own version type;
- engine with no verified boundary is excluded or marked unaccepted according to the documented schema, never invented;
- route-level failing evidence relevant to the boundary is retained;
- volatile paths are omitted;
- existing baseline file is not overwritten without an explicit update/force option;
- output JSON ends with a newline and has stable ordering.

**Step 2: Run focused test to verify failure**

Run: `node --test --import tsx tests/unit/baseline-create.test.ts`

Expected: FAIL because baseline creation does not exist.

**Step 3: Implement pure creation**

Add:

```ts
createBaseline(scan: ScanResult, metadata?: BaselineMetadata): BoundaryBaseline
```

Reject scans with no acceptable verified engine evidence. Do not silently accept infrastructure-only results.

**Step 4: Implement explicit file writing**

Add `readBaseline` and `writeBaseline` in `src/baseline/io.ts`. Reading validates schema; writing is non-destructive by default.

**Step 5: Export the public API**

Export baseline types and pure/file helpers from `src/index.ts`.

**Step 6: Run focused test to verify pass**

Run the command from Step 2.

Expected: PASS.

**Step 7: Commit**

```bash
git add src/baseline/create.ts src/baseline/io.ts src/index.ts tests/unit/baseline-create.test.ts
git commit -m "feat: create explicit browser boundary baselines"
```

## Task Completion Checklist

- [ ] Every listed step is complete.
- [ ] Focused tests pass.
- [ ] Relevant repository quality gates pass.
- [ ] Documentation and machine-readable output agree.
- [ ] No baseline, generated artifact, or compatibility verdict was changed implicitly.

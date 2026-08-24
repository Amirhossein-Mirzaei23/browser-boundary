# Task 12: Implement Conservative Per-Engine Comparison

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

**Objective:** Produce one stable comparison state per relevant engine without false regressions.

**Files:**
- Create: `src/baseline/compare.ts`
- Create: `tests/unit/baseline-compare.test.ts`
- Modify: `src/baseline/types.ts`
- Modify: `src/index.ts`

**Step 1: Write the full failing comparison matrix**

Include at minimum:

```text
baseline 71, current 71 + equivalent verified evidence -> unchanged
baseline 71, current 69 + equivalent verified evidence -> improved
baseline 71, current 73 + verified failure at/above 71 -> regressed
baseline 71, current 73 without relevant verified failure -> inconclusive
baseline exists, current infra-only -> inconclusive
no baseline, current verified -> unbaselined
baseline exists, engine absent current -> not-compared
versionType mismatch -> not comparable, never regressed
material scope drift -> warning/inconclusive according to severity
mixed routes -> identify moved route evidence
```

Also test versions numerically rather than lexicographically (`"100"` vs `"99"`).

**Step 2: Run focused test to verify failure**

Run: `node --test --import tsx tests/unit/baseline-compare.test.ts`

Expected: FAIL because comparison does not exist.

**Step 3: Implement a pure comparison function**

Use a result contract such as:

```ts
export interface EngineComparison {
  engine: EngineName;
  versionType: VersionType;
  state: ComparisonState;
  baselineBoundary: string | null;
  currentBoundary: string | null;
  reasonCode: string;
  message: string;
  comparable: boolean;
  warnings: ComparisonWarning[];
  evidence: ComparisonEvidenceRef[];
}
```

A regression requires both a newer current floor and verified compatibility-failure evidence relevant to the accepted baseline. Absence of a pass is never enough.

**Step 4: Add aggregate comparison**

Return every baseline/current engine and derive an overall state for display only. Do not let an aggregate hide per-engine inconclusive or not-compared states.

**Step 5: Run focused test to verify pass**

Run the command from Step 2.

Expected: PASS.

**Step 6: Run unit suite and typecheck**

```bash
npm test
npm run typecheck
```

Expected: both pass.

**Step 7: Commit**

```bash
git add src/baseline/compare.ts src/baseline/types.ts src/index.ts tests/unit/baseline-compare.test.ts
git commit -m "feat: compare verified browser boundaries"
```

## Task Completion Checklist

- [ ] Every listed step is complete.
- [ ] Focused tests pass.
- [ ] Relevant repository quality gates pass.
- [ ] Documentation and machine-readable output agree.
- [ ] No baseline, generated artifact, or compatibility verdict was changed implicitly.

# Task 9: Define Versioned Scan and Baseline Schemas

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

**Objective:** Establish stable, machine-readable contracts for accepted boundaries and comparison input.

**Files:**
- Create: `src/baseline/types.ts`
- Create: `src/baseline/schema.ts`
- Create: `docs/BASELINE_SCHEMA.md`
- Create: `tests/unit/baseline-schema.test.ts`
- Modify: `src/reporting/types.ts:139-160`
- Modify: `src/index.ts:44-55`

**Step 1: Write failing schema tests**

Cover valid Chromium, Firefox, and WebKit revision entries; unsupported schema version; missing `versionType`; malformed timestamp; duplicate engines; real-major/revision mismatch; and unknown fields according to the chosen forward-compatibility policy.

Use this minimum domain model:

```ts
export type ComparisonState =
  | 'improved'
  | 'unchanged'
  | 'regressed'
  | 'inconclusive'
  | 'unbaselined'
  | 'not-compared';

export interface BoundaryBaseline {
  schemaVersion: 1;
  createdAt: string;
  application?: { id?: string; revision?: string };
  packageVersion: string;
  configFingerprint: string;
  scope: NormalizedScanScope;
  engines: BaselineEngineEntry[];
}
```

Each engine entry must include engine, `versionType`, accepted `oldestVerifiedPassing`, relevant verified failing evidence, normalized route/check scope, browser source/build label, requested/runtime identity evidence, controller, OS, and architecture.

**Step 2: Run focused test to verify failure**

Run: `node --test --import tsx tests/unit/baseline-schema.test.ts`

Expected: FAIL because baseline modules do not exist.

**Step 3: Implement runtime validation without a new dependency**

Use explicit TypeScript guards and `ConfigError`-style actionable diagnostics unless evidence shows a schema library is necessary. YAGNI: support only schema version 1.

**Step 4: Expand scan provenance**

Add normalized route labels, enabled checks/readiness policy, controller policy, package version, browser identity evidence, OS, and architecture to scan output. Keep executable paths and temporary artifacts outside the baseline normalization contract.

**Step 5: Run focused test to verify pass**

Run the command from Step 2.

Expected: PASS.

**Step 6: Commit**

```bash
git add src/baseline/types.ts src/baseline/schema.ts src/reporting/types.ts src/index.ts tests/unit/baseline-schema.test.ts docs/BASELINE_SCHEMA.md
git commit -m "feat: define versioned boundary baseline schema"
```

## Task Completion Checklist

- [ ] Every listed step is complete.
- [ ] Focused tests pass.
- [ ] Relevant repository quality gates pass.
- [ ] Documentation and machine-readable output agree.
- [ ] No baseline, generated artifact, or compatibility verdict was changed implicitly.

# Task 18: Complete the P1 End-to-End Retention Gate

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

**Objective:** Prove a committed baseline can detect a real verified regression while infrastructure uncertainty remains non-regressive.

**Files:**
- Create: `tests/integration/baseline-regression.test.ts`
- Modify: `package.json`
- Modify: documentation only if the end-to-end exercise exposes ambiguity

**Step 1: Write a failing deterministic integration test**

Use controlled scan-result fixtures or local demo variants to exercise:

1. create baseline at floor 71;
2. compare equivalent floor 71 → unchanged;
3. compare verified floor 73 with a relevant verified failure at 71/72 → regressed;
4. compare infrastructure-only current result → inconclusive;
5. confirm baseline bytes are unchanged after every compare;
6. confirm JSON, Markdown, GitHub summary, and gate exit agree.

**Step 2: Run focused test to verify failure**

Run: `node --test --import tsx tests/integration/baseline-regression.test.ts`

Expected: FAIL until all adapters are correctly connected.

**Step 3: Make minimum integration corrections**

Do not add new reporter formats. Fix only contract wiring, deterministic paths, or exit handling exposed by the test.

**Step 4: Run focused test to verify pass**

Run the command from Step 2.

Expected: PASS.

**Step 5: Run all release gates**

```bash
npm test
npm run typecheck
npm run build
npm run test:fixtures
npm run pack-check
```

Expected: all pass.

**Step 6: Validate P1 exit criteria**

Confirm:

- baseline is commit-safe and explicit;
- every relevant engine has a stable state;
- version domains cannot be mixed;
- inconclusive current evidence cannot fail the gate;
- material scope drift is visible;
- all reporters agree;
- official workflow caches and uploads evidence;
- compare never mutates baseline.

**Step 7: Commit**

```bash
git add tests/integration/baseline-regression.test.ts package.json <integration-corrections>
git commit -m "test: verify baseline regression workflow end to end"
```

---

# Phase 3 — P2 Evidence-Gated Developer Experience

**Entry gate:** P1 is complete and failed scans, support requests, structured evaluator runs, or recurring repository behavior identify a material blocker. Select one smallest task; do not start all P2 items in parallel.

## Task Completion Checklist

- [ ] Every listed step is complete.
- [ ] Focused tests pass.
- [ ] Relevant repository quality gates pass.
- [ ] Documentation and machine-readable output agree.
- [ ] No baseline, generated artifact, or compatibility verdict was changed implicitly.

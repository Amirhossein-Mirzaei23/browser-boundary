# Task 20: Add `doctor` as an Aggregator Only if Recovery Needs It

> **For Hermes:** Use subagent-driven-development skill to implement this task with spec-compliance and code-quality review.

**Roadmap phase:** Phase 3 — P2 Evidence-Gated Developer Experience

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

**Objective:** Explain environment checks and reason codes without duplicating scanner detection logic.

**Trigger evidence:** Users see recurring reason codes but cannot determine remediation.

**Files:**
- Create: `src/diagnostics/doctor.ts`
- Create: `src/cli/doctor.ts`
- Modify: `src/cli/options.ts`
- Modify: `src/cli/index.ts`
- Create: `tests/unit/doctor.test.ts`

**Step 1: Write failing doctor tests**

Cover static Node/OS/architecture/dependency checks, optional scan-report input, reason-code explanation, unknown code handling, and machine-readable output.

**Step 2: Run focused test to verify failure**

Run: `node --test --import tsx tests/unit/doctor.test.ts`

Expected: FAIL.

**Step 3: Implement aggregation**

The doctor reads environment facts and existing structured codes. It must not independently reclassify compatibility verdicts or turn inconclusive evidence into failure.

**Step 4: Run tests and commit**

```bash
npm test
npm run typecheck
git add src/diagnostics/doctor.ts src/cli/doctor.ts src/cli/options.ts src/cli/index.ts tests/unit/doctor.test.ts
git commit -m "feat: explain browser scan diagnostics"
```

## Task Completion Checklist

- [ ] Every listed step is complete.
- [ ] Focused tests pass.
- [ ] Relevant repository quality gates pass.
- [ ] Documentation and machine-readable output agree.
- [ ] No baseline, generated artifact, or compatibility verdict was changed implicitly.

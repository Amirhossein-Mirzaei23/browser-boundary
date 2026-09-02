# Task 21: Add Config Validation/Dry Run Only if Repeat Configuration Is a Blocker

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

**Objective:** Validate resolved routes, engines, controller policy, acquisition requirements, and normalized comparison scope without launching browsers.

**Trigger evidence:** Repeat users fail before launch due to configuration ambiguity.

**Files:**
- Create: `src/config/validate.ts`
- Create: `src/cli/validate.ts`
- Modify: `src/cli/options.ts`
- Modify: `src/cli/index.ts`
- Create: `tests/unit/config-validate.test.ts`

**Step 1: Write failing tests**

Cover resolved defaults, malformed combinations, unsupported WebKit historical request, optional dependency warnings, non-portable readiness function, and displayed comparison fingerprint.

**Step 2: Run test to verify failure**

Run: `node --test --import tsx tests/unit/config-validate.test.ts`

Expected: FAIL.

**Step 3: Implement without browser acquisition**

Reuse `resolveConfig`, dependency checks, and baseline normalization. Do not create a second config parser.

**Step 4: Run tests and commit**

```bash
npm test
npm run typecheck
git add src/config/validate.ts src/cli/validate.ts src/cli/options.ts src/cli/index.ts tests/unit/config-validate.test.ts
git commit -m "feat: validate scan configuration without launching"
```

## Task Completion Checklist

- [ ] Every listed step is complete.
- [ ] Focused tests pass.
- [ ] Relevant repository quality gates pass.
- [ ] Documentation and machine-readable output agree.
- [ ] No baseline, generated artifact, or compatibility verdict was changed implicitly.

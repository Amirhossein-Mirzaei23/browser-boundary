# Task 1: Record P0 Measurement Definitions

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

**Objective:** Define TTFR and first-successful-scan metrics without introducing automatic telemetry.

**Files:**
- Create: `docs/product/MEASUREMENT_DEFINITIONS.md`
- Modify: `docs/product/PRODUCT_GROWTH_STRATEGY.md:454-484` only if a link to the canonical definitions is needed

**Step 1: Write the definitions document**

Specify these events and exclusions:

```text
start: evaluator begins the documented install or first command
first-result: CLI emits a completed, understandable current-browser result
first-successful-scan: at least one engine has verified pass/fail evidence
infrastructure-only: no verified compatibility result; excluded from compatibility success
unit of recurring adoption: repository, not invocation or package install
```

Include a manual evaluator worksheet with start/end timestamps, environment, completed stage, failure class, and whether the evaluator mistook Fast Start for boundary discovery.

**Step 2: Review against privacy guardrails**

Expected: no hidden telemetry, unique-machine identifier, repository upload, or automatic network event is proposed.

**Step 3: Commit**

```bash
git add docs/product/MEASUREMENT_DEFINITIONS.md docs/product/PRODUCT_GROWTH_STRATEGY.md
git commit -m "docs: define browser-boundary activation metrics"
```

## Task Completion Checklist

- [ ] Every listed step is complete.
- [ ] Focused tests pass.
- [ ] Relevant repository quality gates pass.
- [ ] Documentation and machine-readable output agree.
- [ ] No baseline, generated artifact, or compatibility verdict was changed implicitly.

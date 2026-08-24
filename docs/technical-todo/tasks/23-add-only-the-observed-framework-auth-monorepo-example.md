# Task 23: Add Only the Observed Framework/Auth/Monorepo Example

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

**Objective:** Resolve one demonstrated setup blocker without creating a speculative recipe catalog.

**Trigger evidence:** Repeated questions identify one concrete framework, authentication, or monorepo workflow.

**Files:**
- Create: `examples/<validated-workflow>/...`
- Create: `docs/examples/<validated-workflow>.md`
- Create: `tests/integration/<validated-workflow>.test.ts`
- Modify: `README.md` with one link

**Steps:**

1. Write a failing local deterministic integration test for the observed setup problem.
2. Run it and confirm the expected failure.
3. Add the smallest example/configuration that solves that problem.
4. Run the focused integration test and relevant package gates.
5. Document limitations and avoid site-specific logic in `src/core`, `src/detection`, `src/analysis`, `src/reporting`, `src/browsers`, or `src/config`.
6. Commit as `docs: add <validated-workflow> browser boundary example`.

Do not add JUnit, annotations, fixture libraries, broad presets, or multiple framework examples unless separate evidence clears each item.

---

# Phase 4 — P3 Remote Infrastructure Expansion

**Entry gate:** Recurring baseline usage is demonstrated and documented demand exists for browser/OS/device coverage unavailable locally. Provider work must not delay P0/P1/P2 blocker resolution.

## Task Completion Checklist

- [ ] Every listed step is complete.
- [ ] Focused tests pass.
- [ ] Relevant repository quality gates pass.
- [ ] Documentation and machine-readable output agree.
- [ ] No baseline, generated artifact, or compatibility verdict was changed implicitly.

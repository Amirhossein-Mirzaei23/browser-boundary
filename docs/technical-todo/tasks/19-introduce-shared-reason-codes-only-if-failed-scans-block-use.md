# Task 19: Introduce Shared Reason Codes Only if Failed Scans Block Use

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

**Objective:** Add stable application/infrastructure classifications at the failure source and reuse them across reports and diagnostics.

**Trigger evidence:** Frequent failed scans or support cases cannot be recovered from free-text reasons.

**Files:**
- Create: `src/diagnostics/reason-codes.ts`
- Create: `src/diagnostics/classify.ts`
- Modify: `src/reporting/types.ts`
- Modify: `src/browsers/types.ts`
- Modify: `src/core/compatibility-checker.ts`
- Modify: `src/core/scanner.ts`
- Modify: detection modules under `src/detection/` only where they own the signal
- Create: `tests/unit/reason-codes.test.ts`

**Step 1: Write failing taxonomy tests**

Start with only observed, reliably classifiable families:

```ts
export type ReasonCode =
  | 'BROWSER_BINARY_UNAVAILABLE'
  | 'DRIVER_MISMATCH'
  | 'MISSING_SYSTEM_LIBRARY'
  | 'ARCHIVE_UNAVAILABLE'
  | 'NETWORK_ERROR'
  | 'SANDBOX_ERROR'
  | 'PAGE_TIMEOUT'
  | 'JAVASCRIPT_FAILURE'
  | 'READINESS_FAILURE'
  | 'UNKNOWN_INFRASTRUCTURE'
  | 'UNKNOWN_APPLICATION';
```

Each definition has owner subsystem, class (`application` or `infrastructure`), stable meaning, and remediation template.

**Step 2: Run focused test to verify failure**

Run: `node --test --import tsx tests/unit/reason-codes.test.ts`

Expected: FAIL because taxonomy does not exist.

**Step 3: Add codes at source boundaries**

Avoid one global regex over final error strings. Preserve safe unknown fallbacks when precise diagnosis is impossible.

**Step 4: Make reports consume the structured code**

Keep human `reason` text but make machine integrations depend on `reasonCode` and classification.

**Step 5: Run tests and commit**

```bash
npm test
npm run typecheck
git add src/diagnostics src/reporting/types.ts src/browsers/types.ts src/core src/detection tests/unit/reason-codes.test.ts
git commit -m "feat: add shared diagnostic reason codes"
```

## Task Completion Checklist

- [ ] Every listed step is complete.
- [ ] Focused tests pass.
- [ ] Relevant repository quality gates pass.
- [ ] Documentation and machine-readable output agree.
- [ ] No baseline, generated artifact, or compatibility verdict was changed implicitly.

# Task 25: Spike One Optional Hosted Provider Adapter

> **For Hermes:** Use subagent-driven-development skill to implement this task with spec-compliance and code-quality review.

**Roadmap phase:** Phase 4 — P3 Remote Infrastructure Expansion

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

**Objective:** Validate one demanded provider without coupling core scanning and comparison contracts to that vendor.

**Files:**
- Create under a separate optional package or adapter path decided by the spike, e.g. `src/providers/<vendor>.ts`
- Create: `tests/unit/<vendor>-provider.test.ts`
- Create: `tests/integration/<vendor>-provider.test.ts`
- Create: `docs/providers/<vendor>.md`
- Modify: `package.json` only if the adapter is accepted

**Step 1: Run a throwaway spike**

Validate authentication flow, session creation, runtime identity, evidence retrieval, timeout/cancellation, artifacts, billing/availability failure semantics, and whether requested historical versions are truly available.

**Step 2: Record a go/no-go decision**

Reject the adapter if it cannot preserve real identity, conservative inconclusive behavior, version-type provenance, or focused boundary semantics.

**Step 3: If accepted, write contract tests first**

Mock vendor HTTP boundaries for unit tests. Keep live credential tests opt-in and skipped by default. Never print or persist credentials.

**Step 4: Implement behind the existing provider abstraction**

Vendor errors map to infrastructure/inconclusive evidence, not compatibility fail. The adapter remains optional and does not become a generic device-cloud abstraction.

**Step 5: Run gates and commit**

```bash
npm test
npm run typecheck
npm run build
npm run pack-check
git add src/providers tests/unit/<vendor>-provider.test.ts tests/integration/<vendor>-provider.test.ts docs/providers/<vendor>.md package.json package-lock.json
git commit -m "feat: add optional <vendor> boundary provider"
```

---

## Task Completion Checklist

- [ ] Every listed step is complete.
- [ ] Focused tests pass.
- [ ] Relevant repository quality gates pass.
- [ ] Documentation and machine-readable output agree.
- [ ] No baseline, generated artifact, or compatibility verdict was changed implicitly.

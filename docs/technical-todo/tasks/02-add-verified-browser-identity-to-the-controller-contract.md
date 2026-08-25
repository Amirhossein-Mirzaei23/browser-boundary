# Task 2: Add Verified Browser Identity to the Controller Contract

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

**Objective:** Capture independent on-disk and live-session identity before a real-major compatibility result can be trusted.

**Files:**
- Modify: `src/reporting/types.ts:97-113`
- Modify: `src/controllers/types.ts:50-74`
- Modify: `src/controllers/playwright.ts:48-159`
- Modify: `src/controllers/webdriver.ts:121-358`
- Modify: `src/core/compatibility-checker.ts:40-194`
- Test: `tests/unit/exact-version-lifecycle.test.ts`
- Test: `tests/unit/webdriver-controller.test.ts`
- Create: `tests/unit/browser-identity.test.ts`

**Step 1: Write failing identity-contract tests**

Cover:

- requested, on-disk, and live major agree → `verified: true`;
- live major mismatch → check is `inconclusive`;
- on-disk identity cannot be parsed → check is `inconclusive`;
- WebKit keeps `versionType: "playwright-revision"` and is never normalized to Safari;
- identity evidence is retained for both pass and fail checks.

Use this target contract:

```ts
export interface BrowserIdentityEvidence {
  requestedVersion: string;
  requestedEngine: EngineName;
  executableVersion: string | null;
  executableEngine: string | null;
  runtimeVersion: string | null;
  runtimeEngine: string | null;
  executableMethod: string;
  runtimeMethod: string;
  verified: boolean;
  mismatchReason: string | null;
}
```

Add to `CheckResult`:

```ts
identity: BrowserIdentityEvidence;
controller: 'playwright' | 'webdriver';
```

**Step 2: Run focused tests to verify failure**

Run:

```bash
node --test --import tsx tests/unit/browser-identity.test.ts tests/unit/exact-version-lifecycle.test.ts tests/unit/webdriver-controller.test.ts
```

Expected: FAIL because the identity types and session query do not exist.

**Step 3: Add a controller identity query**

Extend `ControllerSession` with a method returning live engine/version identity. Implement it with:

- Playwright: `browser.version()` plus the known controller engine;
- WebDriver: session capabilities (`browserName`, `browserVersion` / legacy equivalents).

Keep protocol-specific field parsing inside each controller.

**Step 4: Add on-disk identity verification**

Create a focused helper in `src/browsers/identity.ts` that invokes the resolved executable's trusted version output, parses engine/version, compares major/version domain, and returns structured evidence instead of throwing on parse failure.

**Step 5: Enforce the honesty rule in `runCheck`**

Collect identity after session launch and before navigation. If required identity cannot be verified, return `inconclusive`; do not execute compatibility checks under a mismatched requested label.

**Step 6: Run focused tests to verify pass**

Run the command from Step 2.

Expected: PASS.

**Step 7: Run the unit suite**

Run: `npm test`

Expected: all unit tests pass.

**Step 8: Commit**

```bash
git add src/browsers/identity.ts src/reporting/types.ts src/controllers/types.ts src/controllers/playwright.ts src/controllers/webdriver.ts src/core/compatibility-checker.ts tests/unit/browser-identity.test.ts tests/unit/exact-version-lifecycle.test.ts tests/unit/webdriver-controller.test.ts
git commit -m "feat: verify browser identity for scan evidence"
```

## Task Completion Checklist

- [ ] Every listed step is complete.
- [ ] Focused tests pass.
- [ ] Relevant repository quality gates pass.
- [ ] Documentation and machine-readable output agree.
- [ ] No baseline, generated artifact, or compatibility verdict was changed implicitly.

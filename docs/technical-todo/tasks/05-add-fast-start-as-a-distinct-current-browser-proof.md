# Task 5: Add Fast Start as a Distinct Current-Browser Proof

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

**Objective:** Provide a one-command, headless, one-URL current-Chromium result without presenting it as historical boundary discovery.

**Files:**
- Modify: `src/cli/options.ts:13-315`
- Modify: `src/cli/index.ts:26-100`
- Modify: `src/reporting/types.ts:139-160`
- Modify: `tests/unit/cli-options.test.ts`
- Create: `tests/unit/cli-fast-start.test.ts`

**Step 1: Write failing parser and output tests**

Define a `quick` command:

```text
browser-boundary quick <url>
```

Assert that it resolves to Chromium only, latest strategy, headless mode, one URL, concise output, and an explicit label such as `CURRENT-BROWSER PROOF — not historical boundary discovery`.

**Step 2: Run focused tests to verify failure**

Run:

```bash
node --test --import tsx tests/unit/cli-options.test.ts tests/unit/cli-fast-start.test.ts
```

Expected: FAIL because `quick` is not a valid command.

**Step 3: Extend the parsed command model**

Add `quick` without duplicating scanner behavior. Translate it into a normal `ScanConfig`:

```ts
{
  urls: [url],
  engines: ['chromium'],
  search: { strategy: 'latest' },
  headed: false,
}
```

**Step 4: Add a next-action summary**

After a completed quick result, print exact commands for Stage 2 exact historical verification and Stage 3 full discovery. Do not call the current-build result a boundary.

**Step 5: Run focused tests to verify pass**

Run the command from Step 2.

Expected: PASS.

**Step 6: Run unit suite and typecheck**

Run:

```bash
npm test
npm run typecheck
```

Expected: both pass.

**Step 7: Commit**

```bash
git add src/cli/options.ts src/cli/index.ts src/reporting/types.ts tests/unit/cli-options.test.ts tests/unit/cli-fast-start.test.ts
git commit -m "feat: add current-browser fast start"
```

## Task Completion Checklist

- [ ] Every listed step is complete.
- [ ] Focused tests pass.
- [ ] Relevant repository quality gates pass.
- [ ] Documentation and machine-readable output agree.
- [ ] No baseline, generated artifact, or compatibility verdict was changed implicitly.

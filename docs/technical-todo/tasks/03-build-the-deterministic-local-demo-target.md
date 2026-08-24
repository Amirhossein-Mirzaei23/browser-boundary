# Task 3: Build the Deterministic Local Demo Target

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

**Objective:** Add a localhost-only application with a visible, deterministic historical Chromium compatibility boundary.

**Files:**
- Create: `examples/readme-demo/index.html`
- Create: `examples/readme-demo/server.ts`
- Create: `examples/readme-demo/README.md`
- Create: `tests/integration/readme-demo.test.ts`
- Modify: `package.json:43-58`

**Step 1: Select and verify a real candidate boundary**

Use a throwaway branch/worktree and two adjacent Chromium majors when available. Verify artifact acquisition, executable identity, live identity, newer pass, and older application-level fail. If adjacency is unavailable, test nearest valid majors and record every intervening major as unverified/inconclusive.

Expected: a validated pair is recorded in `examples/readme-demo/README.md`; do not implement the fixture from static compatibility tables alone.

**Step 2: Write the failing current-browser integration test**

The test must start the demo on `127.0.0.1` using an ephemeral port, wait for readiness, open it in current Chromium, and assert:

```ts
await page.waitForSelector('[data-demo-status="pass"]');
assert.match(await page.textContent('[data-runtime-identity]'), /Chrom/i);
```

**Step 3: Run the focused test to verify failure**

Run: `node --test --import tsx tests/integration/readme-demo.test.ts`

Expected: FAIL because the server and page do not exist.

**Step 4: Implement the minimum server and page**

Requirements:

- localhost only;
- no external requests, fonts, scripts, analytics, or assets;
- deterministic selected syntax/runtime break;
- clear pass/fail UI;
- page-visible user-agent only as presentation evidence;
- clean shutdown API for tests and capture scripts.

**Step 5: Add package scripts**

Add narrowly named scripts such as:

```json
"demo:readme": "tsx examples/readme-demo/server.ts",
"test:readme-demo": "node --test --import tsx tests/integration/readme-demo.test.ts"
```

**Step 6: Run the focused test to verify pass**

Run: `npm run test:readme-demo`

Expected: PASS.

**Step 7: Commit**

```bash
git add examples/readme-demo tests/integration/readme-demo.test.ts package.json
git commit -m "feat: add deterministic historical browser demo"
```

## Task Completion Checklist

- [ ] Every listed step is complete.
- [ ] Focused tests pass.
- [ ] Relevant repository quality gates pass.
- [ ] Documentation and machine-readable output agree.
- [ ] No baseline, generated artifact, or compatibility verdict was changed implicitly.

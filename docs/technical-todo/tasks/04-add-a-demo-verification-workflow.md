# Task 4: Add a Demo Verification Workflow

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

**Objective:** Reproduce the demo through the real CLI and fail unless execution, identity, compatibility, and report evidence agree.

**Files:**
- Create: `scripts/verify-readme-demo.ts`
- Create: `tests/unit/readme-demo-verifier.test.ts`
- Modify: `package.json:43-58`
- Modify: `examples/readme-demo/README.md`

**Step 1: Write failing verifier tests**

Use fixture JSON objects to cover:

- adjacent verified fail/pass → exact boundary accepted;
- non-adjacent pair with disclosed gap → bracket accepted;
- mismatch in requested/on-disk/runtime identity → rejected;
- older `error` or `inconclusive` → rejected as failing boundary;
- JSON summary disagrees with check results → rejected;
- unexpected boundary movement → non-zero verifier result.

**Step 2: Run the test to verify failure**

Run: `node --test --import tsx tests/unit/readme-demo-verifier.test.ts`

Expected: FAIL because no verifier exists.

**Step 3: Implement a pure evidence validator**

Keep validation functions importable for unit tests. The executable workflow should:

1. start the demo server;
2. wait on a health endpoint;
3. run the source CLI against the validated explicit Chromium majors;
4. write reports under a temporary OS directory;
5. parse `compatibility.json`;
6. validate all four proof levels;
7. emit a concise transcript;
8. terminate the server in `finally`;
9. delete temporary output unless a debug flag explicitly preserves it.

**Step 4: Add the package script**

```json
"verify:readme-demo": "tsx scripts/verify-readme-demo.ts"
```

**Step 5: Run the unit test to verify pass**

Run the command from Step 2.

Expected: PASS.

**Step 6: Run the real verifier**

Run: `npm run verify:readme-demo`

Expected: exit 0 with the validated pair and matching identity/report evidence. If the host cannot run the selected pair, stop and revise the capture environment or pair; never commit fabricated output.

**Step 7: Commit**

```bash
git add scripts/verify-readme-demo.ts tests/unit/readme-demo-verifier.test.ts examples/readme-demo/README.md package.json
git commit -m "test: verify README demo boundary evidence"
```

## Task Completion Checklist

- [ ] Every listed step is complete.
- [ ] Focused tests pass.
- [ ] Relevant repository quality gates pass.
- [ ] Documentation and machine-readable output agree.
- [ ] No baseline, generated artifact, or compatibility verdict was changed implicitly.

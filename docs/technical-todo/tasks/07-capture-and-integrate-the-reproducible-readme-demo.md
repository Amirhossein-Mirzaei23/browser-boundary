# Task 7: Capture and Integrate the Reproducible README Demo

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

**Objective:** Replace illustrative proof with real captured evidence and an accessible static fallback.

**Files:**
- Create: `scripts/capture-readme-demo.ts` or `scripts/capture-readme-demo.sh`
- Create: `docs/readme-demo/CAPTURE.md`
- Create: `docs/assets/readme-demo/browser-boundary-demo.gif`
- Create: `docs/assets/readme-demo/browser-boundary-demo.png`
- Create: `docs/assets/readme-demo/transcript.txt`
- Modify: `README.md:20-160`
- Modify: `.gitignore` if temporary capture paths are not already ignored

**Step 1: Add a deterministic capture command**

Make capture depend on the verifier from Task 4. It must stop before asset generation if the expected real boundary cannot be reproduced.

**Step 2: Record capture environment**

`docs/readme-demo/CAPTURE.md` must record OS, architecture, Node.js, package, Playwright, requested versions, controller, identity methods, and whether versions were cached.

**Step 3: Generate real assets**

Run the capture command and produce a short recording plus static fallback. Remove usernames, home paths, tokens, unrelated windows, and temporary paths.

Expected: files are generated from actual tool output; no values are manually edited into screenshots or transcripts.

**Step 4: Restructure the README outcome-first**

Order the top-level journey as:

1. product statement;
2. real historical demo;
3. Fast Start;
4. observed boundary result;
5. relationship to Browserslist;
6. CI/regression direction;
7. capability matrix;
8. advanced use.

Remove `README.md:154` TODO and clearly distinguish observed demo values from illustrative examples.

**Step 5: Verify asset and link integrity**

Open the rendered README locally or on a temporary branch and check animation, static fallback, alt text, relative links, and transcript readability.

**Step 6: Run package-content check**

Run: `npm run pack-check`

Expected: demo-only source/assets are excluded from the published package unless explicitly intended.

**Step 7: Commit**

```bash
git add README.md .gitignore scripts/capture-readme-demo.* docs/readme-demo/CAPTURE.md docs/assets/readme-demo
git commit -m "docs: prove historical browser boundary in README"
```

## Task Completion Checklist

- [ ] Every listed step is complete.
- [ ] Focused tests pass.
- [ ] Relevant repository quality gates pass.
- [ ] Documentation and machine-readable output agree.
- [ ] No baseline, generated artifact, or compatibility verdict was changed implicitly.

# Experiment: Browserslist Comparison (declared intent vs. observed evidence)

Status: **documentation prototype** — Step 1 of Task 22. The runtime prototype (`src/policy/browserslist.ts`) is deliberately NOT built yet; it is gated on the evaluation below.

## Question

Does presenting a user's **declared** support policy (Browserslist config) side-by-side with `browser-boundary`'s **observed** evidence help evaluators proceed to a scan or baseline acceptance — or is Browserslist better left as positioning (a different question: declared targets vs. runtime behavior)?

## Prototype: side-by-side presentation

| | Declared (Browserslist) | Observed (browser-boundary) |
| --- | --- | --- |
| Source | `.browserslistrc` / `package.json#browserslist` | real binary launches, verified pass/fail |
| Chromium | e.g. `chrome >= 100` | `oldestVerifiedPassing: 121`, `firstVerifiedFailing: 120` (verified) |
| Firefox | e.g. `ff >= 95` | `oldestVerifiedPassing: 63` … (verified) |
| WebKit/Safari | `safari >= 15` | **playwright-revision — NOT comparable to Safari**; presented as "current WebKit build only" |
| Unverifiable ranges | n/a (static data) | stays `inconclusive` — never silently treated as pass or fail |
| Example gap | `chrome >= 100` declares 100–99 supported | observed evidence shows 100 untested (inconclusive), 120 verified failing, 121 verified passing |

Rules that must hold in any future implementation:

- declared and observed remain **separate fields in types and output** — never merged into one verdict;
- WebKit revision numbers are **never mapped to Safari versions**;
- `inconclusive` evidence is preserved in the side-by-side view;
- the integration is **read-only**: no automatic rewriting of the user's Browserslist config.

## Evaluation plan (Step 2)

Measure, with evaluator sessions / documentation cohorts after P1 retention is in use:

1. Do evaluators who see the side-by-side view proceed to a **scan** or **baseline acceptance** more often than without it?
2. Do they misread the declared policy as evidence (comprehension check)?
3. Do they ask for config syncing (which we would refuse — read-only)?

## Decision gate

- **Proceed to the runtime prototype (Steps 3–5)** only if evaluators proceed to verification and do not mistake declared intent for evidence.
- **Stop** if evaluators do not proceed or the comparison confuses more than it helps — retain Browserslist as positioning only (see README "Comparison to alternatives").

If the gate passes, the prototype would use the established `browserslist` package (re-checked for Node support at that time), behind tests covering config sources, engine naming, range normalization, unsupported targets, read-only behavior, and no-Safari-mapping.

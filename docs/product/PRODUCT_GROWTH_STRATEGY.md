# browser-boundary Product Growth Strategy

## Product Overview

`browser-boundary` is a TypeScript library and CLI that launches real browser binaries, evaluates configured application routes, searches browser versions, and reports the oldest version it can verify as passing. It currently evaluates navigation, JavaScript, console, network, rendering, and readiness signals and produces JSON and Markdown evidence reports.

The product should evolve from a one-time discovery tool into recurring browser-support infrastructure:

> **Current product:** Find the browser boundary.
>
> **Target product:** Verify the browser boundary and prevent it from silently regressing.

The central product journey is:

> **Discover → Verify → Baseline → Protect**

The long-term category position is **verified browser-support boundary and regression detection**, not cross-browser testing. The product should remain complementary to general automation frameworks, device clouds, and static browser-policy tools.

### Core value proposition

> Your browser policy says what you intend to support. `browser-boundary` verifies what the real application actually supports and protects that verified boundary from regression.

The relationship among the tools should be explicit:

- **Browserslist:** What browsers do we declare or intend to support?
- **browser-boundary:** What browser versions does the real application actually pass?
- **CI:** Did that verified boundary improve, remain stable, regress, or become inconclusive?

`browser-boundary` does not replace Browserslist. It is a runtime verification layer around an existing browser-support policy.

### Differentiation

The product's meaningful differentiation is the combination of:

- real browser execution rather than User-Agent spoofing;
- historical browser versions;
- automated boundary discovery rather than a manually selected matrix;
- conservative `inconclusive` semantics;
- reproducible reports and artifacts;
- persistent per-engine baselines;
- verified browser-support regression detection.

General test frameworks automate versions selected by the user. Cloud providers supply browser and device infrastructure. Static policy tools declare expected support. `browser-boundary` should own the decision workflow that discovers and protects the application's observed runtime boundary.

## Evidence, Assumptions, and Unknowns

### Observed repository and ecosystem evidence

The following evidence was recorded during the original review and is retained as a dated snapshot, not a live adoption claim:

- npm version was `1.5.2`;
- 10 versions had been published between August 8 and August 23, 2026;
- npm reported 1,537 downloads in the preceding month and 1,096 in the preceding week;
- GitHub had 1 star, 0 forks, 0 open issues, no topics, and no repository description;
- package size was approximately 428 KB compressed and 1.68 MB unpacked;
- Node.js 18 or newer was required;
- documented coverage was Chromium 67+, Firefox 52+, and the current Playwright WebKit revision;
- ESM, CommonJS, TypeScript declarations, and a CLI were published.

Current repository evidence:

- results distinguish `pass`, `fail`, `inconclusive`, `error`, and `skipped`;
- reports expose `oldestVerifiedPassing` and `firstVerifiedFailing`;
- the scanner supports exact versions, multiple routes, custom readiness, network controls, retries, JSON configuration, and distinct CLI exit codes;
- JSON and Markdown reports, screenshots, traces, and logs already provide a foundation for evidence-led CI;
- scan results retain a configuration snapshot, but do not yet retain the complete provenance needed for robust baseline comparison;
- the README still contains a TODO for a recording or screenshot, and its visible terminal boundary is explicitly illustrative;
- no first-class baseline comparison or regression mode exists;
- no stable machine-readable reason-code taxonomy exists beyond verdicts, text reasons, and process exit codes.

### Interpretation limits

- npm downloads are a weak activity signal, not proof of unique users, successful scans, recurring use, or retention. They can include CI installs, caching, mirrors, bots, and release automation.
- GitHub stars are a weak awareness signal, not product quality or activation evidence.
- Zero open issues may mean low friction or low feedback volume. Current evidence cannot distinguish between them.
- No observed user research or repository-level retention data currently validates the proposed recurring workflow.

## Product Principles

1. **Evidence over declarations.** Report observed runtime outcomes without converting assumptions into compatibility claims.
2. **Protect the boundary, not a full test matrix.** Optimize for finding and comparing the support floor rather than becoming a general E2E system.
3. **Inconclusive is a first-class state.** Missing archives, launch failures, WAFs, and environmental problems must not become compatibility failures or regressions.
4. **Provenance enables trust.** A baseline comparison is meaningful only when users can understand how and where each result was produced.
5. **Fast proof before expensive depth.** Show value using a narrow current-browser run before asking users to download or scan a historical matrix.
6. **Integrate with existing policy and CI.** Complement Browserslist and fit into release infrastructure rather than asking teams to replace either.
7. **Focused scope creates differentiation.** Feature decisions must strengthen discovery, verification, baseline management, regression protection, or trustworthy diagnosis.

## Evidence Status and Decision Gates

The roadmap must distinguish observed product gaps from unvalidated bets and optional improvements. Priority indicates sequencing, not proof of demand.

### Known problems

These are directly observable in the current product or repository:

- the README does not visibly prove the core historical-browser claim;
- first value requires more setup and browser download cost than a narrow proof needs;
- users cannot quickly determine which engine, version, controller, and host combinations are validated;
- a discovered boundary cannot be accepted and compared through a first-class baseline workflow;
- recurring CI adoption requires users to assemble comparison and reporting behavior themselves;
- infrastructure and compatibility failures lack stable machine-readable reason codes.

### Strategic hypotheses

These are plausible but not validated by current user or retention evidence:

- faster first results will improve activation;
- baseline comparison will create recurring repository-level usage;
- CI-native output will make verified regressions more actionable;
- Browserslist comparison will create a useful acquisition and adoption bridge;
- structured diagnostics will improve recovery from failed scans.

### Nice improvements, pending evidence

These should not compete with proof and retention work until usage evidence identifies them as blockers:

- multiple framework-specific examples;
- presets beyond the minimum onboarding flow;
- monorepo recipes;
- reusable public fixture libraries beyond the deterministic README demo;
- additional community surfaces and ecosystem integrations;
- remote providers and historical Safari/device infrastructure.

### Decision gates

- Complete P0 proof and activation work before starting the P1 retention package.
- Treat P1 as one coherent release outcome: baseline creation, conservative comparison, one official GitHub workflow, and visible CI output.
- Start a P2 item only when failed scans, support requests, usability testing, or activated-repository behavior identifies it as a material blocker.
- Start P3 provider work only after recurring baseline usage is demonstrated and unmet coverage demand is documented.

## Primary Beachhead Persona

### Frontend / Platform Engineer Responsible for Browser Support and CI

This is the initial target persona. The role may sit in a frontend platform, developer experience, release engineering, or application infrastructure team.

Pain points:

- browser-support policy is declared but not continuously verified against the real application;
- dependency, build-target, transpilation, or application changes can move the support boundary without an obvious test failure;
- historical browser jobs are slow, storage-heavy, and sensitive to runner libraries and archive availability;
- release infrastructure needs stable machine-readable outcomes and conservative failure behavior.

Why this persona is the beachhead:

- understands browser compatibility and the difference between policy and runtime behavior;
- commonly works with Browserslist or equivalent support declarations;
- can install and evaluate a CLI tool;
- owns or influences CI and release infrastructure;
- has a recurring need to detect regressions rather than only diagnose compatibility once;
- can convert a useful scan into a committed baseline and repeated CI workflow.

Primary adoption lever:

> A fast proof, followed by a checked-in per-engine baseline and a CI gate that fails only on verified regressions.

The first phases should optimize for this persona rather than distribute equal effort across every potential user.

## Secondary Personas

### Frontend application engineer

Needs to know whether the deployed application starts, hydrates, and completes important routes in older browsers. The strongest lever is a quick current-browser result followed by framework-specific readiness examples.

### QA or test-automation engineer

Needs an efficient alternative to manually selecting and running a large historical matrix. The strongest lever is boundary search, exact-version diagnostics, CI-native output, and failure artifacts.

### Library or design-system maintainer

Needs to detect when dependencies, output targets, or runtime APIs move a claimed browser-support floor. The strongest lever is a controlled compatibility fixture and baseline regression mode.

### Engineering lead responsible for browser policy

Needs reproducible evidence for release and support decisions. The strongest lever is a concise comparison of declared policy, verified runtime boundary, change from baseline, and uncertainty.

## Jobs to Be Done

1. **Discover:** Find the oldest browser version the configured application routes can be verified to pass.
2. **Verify:** Inspect the requested/runtime browser identity, verdict evidence, and limitations before accepting the result.
3. **Baseline:** Store an explicit, reviewable support boundary for each engine with enough provenance to understand the evidence.
4. **Protect:** Compare future scans with the accepted baseline and fail CI only when a regression is verified.
5. **Diagnose:** Separate application compatibility failures from browser acquisition, driver, host, network, and readiness problems.
6. **Relate policy to evidence:** Compare declared Browserslist policy with observed runtime results without treating either as a substitute for the other.

## Product Loop

The intended recurring loop is:

> Discover → Verify → Accept baseline → Release → Re-scan → Compare → Detect regression → Investigate → Update application → Re-baseline

This loop is strategically important because a one-time scan is a useful diagnostic, while repeated comparison creates durable engineering infrastructure and a reason to retain the tool.

Re-baselining must be an explicit human or reviewed repository action. A failed or inconclusive scan must never silently overwrite an accepted baseline. An intentional support-policy change may justify a new baseline, but it should remain visible in version control and code review.

## Core Capability: Boundary Baseline and Regression Detection

### Product requirement

Users must be able to:

1. run a scan and discover a verified boundary;
2. review and accept the result as a baseline;
3. commit or otherwise persist the baseline;
4. run future scans using equivalent configuration;
5. compare current and baseline results per engine;
6. receive `improved`, `unchanged`, `regressed`, or `inconclusive` outcomes;
7. fail CI only for verified regressions.

Example:

```text
Baseline: Chromium >= 71
Current:  Chromium >= 73
Result:   REGRESSION
```

For a minimum-supported-version boundary, a numerically newer oldest passing version means support narrowed and therefore regressed; a numerically older version means support improved. The suggested `73 → 71 = regression` example would invert that meaning, so this PRD corrects it to `71 → 73 = regression`. Implementation must use unambiguous wording such as `oldestVerifiedPassing` and explicitly define the comparison direction to avoid policy confusion.

### Per-engine comparison semantics

| Baseline evidence | Current evidence | Comparison state | CI behavior |
| --- | --- | --- | --- |
| Verified boundary | Same verified boundary | `unchanged` | Pass |
| Verified boundary | Older verified passing boundary | `improved` | Pass |
| Verified boundary | Newer verified passing boundary, with a verified failure at or above the accepted floor | `regressed` | Fail in regression-gate mode |
| Verified boundary | No trustworthy current boundary because results are inconclusive or infrastructure-only | `inconclusive` | Do not classify as regression; surface separately |
| No baseline for engine | Verified current boundary | `unbaselined` | Do not fail by default; prompt explicit acceptance |
| Engine/config absent from current scan | Existing baseline | `not-compared` | Do not infer regression; configuration warning or policy-defined CI outcome |

Additional rules:

- comparisons are per engine and must respect `versionType`; a Playwright WebKit revision must never be compared as a Safari major;
- `inconclusive`, `error`, missing archive, and untested versions never prove regression;
- a current verified pass older than the baseline can prove improvement only within equivalent scan scope and evidence rules;
- a regression requires verified failure evidence relevant to the accepted baseline, not merely absence of a passing observation;
- mixed route outcomes should preserve route-level evidence and identify which configured route moved the aggregate boundary;
- configuration drift must be visible. Materially different URLs, readiness checks, engine/controller policies, confidence thresholds, or search floors should produce a comparability warning rather than a silently authoritative comparison;
- baseline updates must be explicit and reviewable; the compare command must not mutate the baseline.

### Baseline artifact

The baseline should be machine-readable, diff-friendly, and safe to commit. It should separate the accepted boundary from volatile execution details.

Required fields should include:

- schema version;
- creation timestamp;
- application/repository identifier when supplied;
- application revision or commit SHA when available;
- package version;
- per-engine accepted `oldestVerifiedPassing` and relevant failing evidence;
- `versionType`;
- tested URLs or stable route labels;
- normalized scan-configuration fingerprint;
- checks/readiness policy;
- browser source/build label;
- requested and runtime browser version;
- controller and driver identity where applicable;
- OS and architecture;
- evidence/report references when durable.

Provenance must support investigation and comparability, but machine-specific executable paths and temporary artifact paths should not create noisy baseline diffs. Volatile run metadata can remain in the scan report while the baseline stores normalized evidence and references.

### Acceptance criteria

- A user can create a baseline from a completed verified scan without manually editing JSON.
- A baseline supports independent entries for Chromium, Firefox, and WebKit revision evidence.
- Comparison emits a stable machine-readable state for every configured engine.
- `inconclusive` and infrastructure-only current results never emit `regressed`.
- Regression exit behavior is opt-in or tied to an explicit compare/gate mode, preserving existing scan semantics.
- Configuration/provenance differences produce actionable comparability diagnostics.
- Baseline creation and update are explicit; comparison never rewrites the accepted file.
- The minimum human-readable, JSON, and GitHub summary outputs agree on comparison state. Any later JUnit or annotation reporter must use the same comparison contract.

## Activation Strategy

The primary activation problem is time to first meaningful result. The onboarding path should progressively reveal capability and cost.

### Stage 1 — Fast proof

Goal: show a meaningful result as quickly as possible.

- current Chromium;
- one URL;
- headless by default for this guided path, unless visible execution is part of the proof;
- minimal download/setup burden;
- concise result and next command;
- no implication that this smoke check discovered a historical boundary.

Expected user outcome: “The tool ran against my real application and produced understandable evidence.”

### Stage 2 — Exact historical verification

Goal: prove the core historical-browser differentiation with bounded cost.

- one engine;
- one explicit historical version;
- visible requested/runtime version identity;
- clear pass, fail, inconclusive, or infrastructure result;
- explanation of download and host requirements.

Expected user outcome: “This is a real historical browser result, not User-Agent spoofing.”

### Stage 3 — Full boundary discovery

Goal: find the verified browser-support floor.

- boundary-search strategy;
- selected engines and routes;
- caching guidance;
- report generation;
- explicit invitation to review and accept a baseline.

Expected user outcome: “I have a verified boundary I can persist and protect in CI.”

### Activation metric

**Time to First Result (TTFR)** is a core product metric: elapsed time from the start of installation or first command to the first completed, understandable scan result. No target is asserted until instrumentation or structured user testing establishes a credible baseline.

## P0 Trust Feature: Deterministic README Demo

The README lacks visible proof of the central claim. This is a P0 product and growth requirement, not cosmetic documentation.

The demo must show:

- a controlled application with a known compatibility break, if a stable adjacent historical boundary can be validated;
- real historical browser execution;
- requested and runtime browser/version identity;
- the terminal command and progress/result;
- one verified pass and one verified fail where artifacts and host support allow;
- the computed boundary;
- a generated report excerpt and evidence;
- exact reproducible commands and capture environment;
- conservative treatment of unavailable or unlaunchable versions.

The recording must have a static/text fallback and must not fabricate output. The detailed requirements in `README_DEMO_PRD.md` remain the implementation source for this initiative.

The demo's strategic purpose is to let a visitor understand and trust the core value before installing a complete historical-browser matrix.

## README and Product UX Strategy

The README should be outcome-first:

1. Product statement
2. Real historical-browser demo
3. Fast Start
4. Example boundary result
5. Why `browser-boundary` versus Browserslist
6. CI and Regression Detection
7. Supported browser/platform matrix
8. Framework and workflow examples
9. Advanced configuration
10. Architecture and limitations

Advanced API reference, extended troubleshooting, and capture procedures can move into focused documents under `docs/`. The README should preserve essential caveats but should not require users to read deep operational detail before seeing value.

## Diagnostics as a Platform Capability

Keep `browser-boundary doctor`, but do not design it as an isolated diagnostic subsystem. Establish stable machine-readable reason codes at the points where acquisition, launch, navigation, and compatibility decisions occur. Reports, CI output, support templates, and `doctor` should consume the same taxonomy.

Initial reason-code families should include:

- `BROWSER_BINARY_UNAVAILABLE`
- `DRIVER_MISMATCH`
- `MISSING_SYSTEM_LIBRARY`
- `ARCHIVE_UNAVAILABLE`
- `NETWORK_ERROR`
- `SANDBOX_ERROR`
- `PAGE_TIMEOUT`
- `JAVASCRIPT_FAILURE`
- `READINESS_FAILURE`

This list is a proposed starting taxonomy, not a claim that the current implementation can always diagnose each condition precisely. Codes need stable definitions, ownership by subsystem, human remediation text, and an `infrastructure` versus `application` classification. Unknown failures must retain a safe fallback code rather than being forced into an inaccurate category.

`doctor` should aggregate static environment checks and explain reason codes observed in a scan. It should not duplicate the core detection logic.

## Browserslist Integration

Browserslist comparison remains P2 because baseline retention and CI protection deliver more differentiated recurring value first.

The integration should present declared policy and runtime evidence side by side:

```text
Declared policy (Browserslist)
  Chromium >= 73
  Firefox  >= 64
  Safari   >= 12

Observed runtime evidence
  Chromium >= 73  PASS
  Firefox  >= 64  PASS
  Safari   >= 12  INCONCLUSIVE
```

Requirements:

- label policy as declared intent and scan output as observed evidence;
- never infer that a Browserslist target automatically passes at runtime;
- never map a current Playwright WebKit revision to a historical Safari version;
- preserve `inconclusive` where the product lacks credible runtime coverage;
- explain differences without automatically rewriting Browserslist configuration;
- allow policy comparison to inform baseline acceptance, not replace it.

## Prioritized Product Opportunities

| Priority | Strategic package | Included scope | Evidence status | Why now |
| --- | --- | --- | --- | --- |
| P0 — Must prove | Proof and activation | Deterministic historical-browser demo, outcome-first README, fast first result, capability matrix | Known gaps; conversion impact is a hypothesis | Users must understand, trust, and reach the product outcome before deeper investment |
| P1 — Must retain | Baseline, regression, and CI | Baseline storage, conservative comparison, regression gate, one official GitHub workflow, concise CI output | Missing capability; retention impact is a hypothesis | This is the minimum coherent recurring workflow and primary strategic differentiation |
| P2 — Reduce friction | Diagnostics and ecosystem DX | Shared reason codes, `doctor`, presets, config validation, selected framework/auth examples, Browserslist comparison, fixtures, monorepo recipes | Mostly hypotheses or nice improvements | Build only where activation and recurring-use evidence shows friction |
| P3 — Expansion | Remote infrastructure | Remote providers, historical Safari, real-device coverage | Unvalidated expansion hypothesis | High complexity and category-drift risk; requires demonstrated demand |

P0 and P1 are intentionally defined as product outcomes rather than independent feature queues. README restructuring belongs inside the P0 demo/activation package. JUnit is one possible P1 CI output, not an unconditional requirement; a GitHub step summary may be sufficient for the first retained workflow. Structured reason codes are P2 unless the minimum P1 comparison contract requires a small stable subset of comparison-state codes.

### Why remote browser providers remain P3

Remote providers introduce credentials, vendor dependencies, billing and availability behavior, result-provenance complexity, integration maintenance, and support burden. They also risk shifting positioning toward generic cross-browser infrastructure where established vendors already compete. Provider expansion should follow demonstrated demand for unavailable coverage and a stable local baseline/comparison contract. It must not precede proof, activation, and retention.

## Distribution and Growth Strategy

Distribution should be problem-led and evidence-led, not generic package promotion.

### Search and educational content themes

- “What is the oldest Chrome version your app actually supports?”
- “Browserslist says Chrome 73. Does your app really work on Chrome 73?”
- “How to detect browser-support regressions before release”
- “Testing old Chrome versions without User-Agent spoofing”
- “Browserslist targets versus verified runtime boundaries”
- “Why unavailable historical browsers should produce inconclusive results”

Each piece should:

1. name a concrete browser-policy or release problem;
2. explain why declarations or User-Agent changes do not prove runtime compatibility;
3. demonstrate real execution and evidence;
4. include a reproducible narrow command;
5. lead naturally to boundary discovery and the baseline/CI loop.

### Repository and community surfaces

- Set a clear GitHub description, homepage, and focused topics.
- Add bug templates requesting OS, architecture, engine, version, reason code, configuration summary, and `doctor` output.
- Add feature templates centered on user workflow rather than requested implementation.
- Publish concise release notes led by user outcomes and migration implications.
- Invite opt-in feedback through issues or discussions; do not add automatic telemetry without a privacy policy and validated need.
- Do not interpret stars, issues, or downloads as retention without repository-level recurring-use evidence.

### Distribution loop

Problem-oriented content and the README demo create discovery and trust. Fast Start creates the first result. Boundary discovery creates a valuable artifact. Baseline and CI integration create recurring use. Regression evidence creates internal sharing and release visibility. This is the intended product-led growth loop; it remains a hypothesis until measured.

## Metrics and Measurement

Canonical metric and event definitions (activation events, exclusions, and the manual evaluator worksheet) live in [`MEASUREMENT_DEFINITIONS.md`](MEASUREMENT_DEFINITIONS.md).

### Weak or vanity signals

- npm downloads;
- GitHub stars;
- one-time README views;
- package-page traffic without scan completion.

These can indicate awareness or registry activity but must not be presented as adoption or retention.

### Meaningful product metrics

- installation-to-first-successful-scan conversion;
- Time to First Result;
- successful scan rate, separated from verified compatibility outcomes;
- distribution of infrastructure, inconclusive, and application-failure reason codes;
- percentage of evaluated repositories that run more than one scan;
- repositories running `browser-boundary` in CI;
- repositories with a committed baseline;
- recurring scan volume at repository level;
- baseline comparisons by state: improved, unchanged, regressed, inconclusive;
- verified regression events;
- repository retention after initial evaluation.

### Measurement guardrails

- Prefer opt-in surveys, public workflow/code search where appropriate, issue templates, and privacy-preserving aggregate CI integration evidence over hidden telemetry.
- Define a repository as the primary unit for recurring adoption; raw command executions and package installs can be inflated by retries and CI matrices.
- Establish measurement definitions before assigning numeric targets.
- Track activation, retention, and reliability separately so a compatibility failure is not mistaken for product failure.

## Product Hypotheses

No hypothesis below is established user evidence. Experiments should establish a baseline first and use directional success criteria until enough volume exists to set credible numeric thresholds.

### Hypothesis A — Faster first run improves activation

- **Assumption:** setup and download cost causes evaluators to abandon before seeing value.
- **Expected behavior:** more evaluators complete a first successful scan, with lower TTFR.
- **Primary metric:** installation/start → first successful scan conversion.
- **Secondary metrics:** TTFR and first-run infrastructure failure rate.
- **Experiment:** test the current onboarding against the staged current-Chromium path through structured usability sessions and, where attribution is possible, before/after documentation cohorts.
- **Decision:** keep and refine Fast Start if completion improves without users mistaking it for full boundary discovery; revisit the flow if it only shifts failures to Stage 2.

### Hypothesis B — Baseline regression detection creates recurring CI usage

- **Assumption:** teams that discover a boundary want to prevent it moving across releases.
- **Expected behavior:** activated repositories commit a baseline and run comparisons after the initial scan.
- **Primary metric:** percentage of activated repositories observed running more than one scan or comparison.
- **Secondary metrics:** committed baselines, repositories using the official CI workflow, recurring comparisons, and repository retention.
- **Experiment:** release the minimum baseline + compare + GitHub workflow package to early adopters; conduct follow-up interviews and inspect public integrations where appropriate.
- **Decision:** deepen CI reporting only if repositories repeat the workflow; if they do not, investigate whether the problem is baseline value, scan cost, reliability, or integration friction before adding reporters.

### Hypothesis C — Browserslist comparison improves adoption

- **Assumption:** connecting to an existing browser-policy workflow makes the product easier to understand and adopt.
- **Expected behavior:** activated repositories use policy comparison and proceed to runtime verification or baseline creation.
- **Primary metric:** Browserslist comparison usage among activated repositories.
- **Secondary metrics:** comparison → baseline conversion and retention of repositories using the integration.
- **Experiment:** validate demand first through documentation examples or a lightweight prototype before committing a full P2 integration.
- **Decision:** build the integration only if users act on the declared-versus-observed comparison; otherwise keep Browserslist as positioning and documentation.

### Hypothesis D — Real historical-browser proof improves conversion

- **Assumption:** visitors hesitate because the README describes but does not demonstrate real historical execution.
- **Expected behavior:** more visitors attempt reproduction or proceed to a first scan after viewing the demo.
- **Primary metric:** attributable README/demo visitor → first-scan or reproduction conversion.
- **Secondary metrics:** demo engagement and qualitative comprehension/trust in usability sessions.
- **Experiment:** publish the deterministic demo with tagged reproduction links and compare structured evaluator behavior before and after; do not infer causation from npm downloads alone.
- **Decision:** retain the demo as trust infrastructure if users understand the differentiation even when quantitative attribution is unavailable; revise it if viewers still confuse the tool with User-Agent spoofing or general E2E testing.

### Supporting hypotheses — validate only when they become relevant

- Shared reason codes and `doctor` may improve failed-scan recovery. Validate through reason frequency, repeat-run success, and support resolution before expanding diagnostics.
- CI summaries may make regression evidence more actionable. Start with one GitHub-native output; add JUnit or annotations only when target repositories require them.
- Framework examples may improve activation for specific stacks. Prioritize examples from observed setup questions rather than publishing a broad matrix speculatively.

## What We Will NOT Build

`browser-boundary` is not trying to become:

- a general E2E test framework;
- a browser automation framework;
- a device cloud;
- a replacement for Playwright;
- a replacement for Selenium;
- a replacement for Browserslist;
- a generic Selenium abstraction;
- a full hosted browser-testing platform.

This is a product decision filter. A proposed capability should be rejected or delegated to an integration unless it materially improves boundary discovery, evidence verification, baseline management, regression protection, or diagnosis required to trust those outcomes.

## Roadmap

The roadmap prioritizes time to value, recurring usage, retention, differentiation, and defensibility over feature quantity. Dates and numeric adoption targets should be set only after engineering sizing and baseline measurement.

### Phase 1 — Proof and Activation

Objective: let prospective users understand the differentiated value before a costly setup and reach a first result quickly.

1. Implement the deterministic README demo defined in `README_DEMO_PRD.md` and restructure the README around that proof.
2. Introduce the three-stage onboarding path, including a one-command current-Chromium first result that is not presented as full boundary discovery.
3. Publish a validated platform/engine/controller capability matrix before users incur historical-download cost.
4. Establish baseline measurements for Hypotheses A and D through structured evaluator runs and attributable documentation links where feasible.

Exit criteria:

- README proof is reproducible and contains no illustrative result presented as observed evidence;
- users can follow the documented Fast Start to a completed result;
- TTFR and first-successful-scan measurement definitions exist;
- platform limitations are visible before expensive downloads.

### Phase 2 — Retention and CI

Objective: turn discovered boundaries into persistent release protection.

1. Define and version the baseline schema and normalized provenance model.
2. Implement explicit baseline creation and per-engine comparison, including `improved`, `unchanged`, `regressed`, `inconclusive`, `unbaselined`, and `not-compared`.
3. Add regression-gate behavior and tests proving that only verified regressions fail CI.
4. Ship one official GitHub Actions workflow with caching, artifacts, and a concise GitHub step summary. Keep JUnit and annotations out of the minimum package unless an adopter requires them.
5. Run the Hypothesis B experiment before broadening CI integrations.

Exit criteria:

- a repository can commit a baseline and compare a later application revision in CI;
- every engine produces a stable comparison state;
- current inconclusive evidence cannot fail a regression gate;
- configuration drift and provenance differences are visible;
- machine and human reporters agree.

### Phase 3 — Developer Experience and Ecosystem

Objective: improve successful operation and connect the focused workflow to common frontend systems.

This phase is an evidence-gated backlog, not a committed feature bundle. Select the smallest item that addresses observed friction:

1. If failed scans block activation, introduce shared reason codes and build `doctor` as their aggregator.
2. If configuration complexity blocks repeat use, add dry-run/config validation or the minimum validated preset; do not ship a broad preset catalog by default.
3. If application setup blocks activation, publish the one framework or authenticated-route example supported by observed demand.
4. Validate Browserslist comparison through the Hypothesis C experiment before implementing the full integration.
5. Add fixtures, monorepo recipes, JUnit, annotations, or wider framework coverage only in response to demonstrated usage needs.

Exit criteria:

- at least one observed activation or retention blocker is reduced;
- the selected capability has a defined usage or recovery measure;
- unselected P2 ideas remain backlog rather than becoming parallel commitments;
- any Browserslist output never claims unverified runtime compatibility.

### Phase 4 — Remote Infrastructure Expansion

Objective: expand unavailable coverage only after the core verification and regression contract is stable and demand is demonstrated.

1. Validate demand for historical Safari, devices, or remote host/browser combinations.
2. Stabilize provider and provenance interfaces required by baseline comparison.
3. Evaluate one optional hosted-provider adapter.
4. Preserve vendor, OS, browser source, controller, and version-type provenance.
5. Reject integrations that weaken conservative semantics or reposition the product as a generic testing platform.

Exit criteria:

- external demand justifies credential, vendor, and maintenance costs;
- remote and local results remain distinguishable and comparable only where valid;
- provider work does not delay the core activation and retention roadmap.

## Risks and Mitigations

### Baseline comparison creates false confidence

Mitigation: require verified evidence, preserve per-engine and route-level outcomes, detect material configuration drift, and document that a pass covers only configured routes and checks.

### Inconclusive results weaken CI usefulness

Mitigation: never call them regressions; expose them prominently through reason codes and allow teams to define a separate infrastructure policy without corrupting compatibility semantics.

### Provenance makes baselines noisy or non-portable

Mitigation: normalize comparison-critical fields in the baseline and retain volatile execution details in scan reports.

### Fast Start is mistaken for boundary discovery

Mitigation: label Stage 1 as a current-browser proof and give a direct progression to exact historical verification and full discovery.

### Controlled demo becomes stale

Mitigation: verify expected real-browser outcomes in a regeneration workflow, record the capture environment, and fail regeneration when the boundary cannot be reproduced.

### Remote providers cause category drift

Mitigation: keep them P3, validate demand, make them optional infrastructure, and apply the “What We Will NOT Build” decision filter.

## Final Product Recommendation

The strongest product narrative is:

> **Browserslist defines the policy. `browser-boundary` verifies the real application. CI protects the verified boundary.**

The highest-leverage sequence is:

1. prove real historical-browser execution visibly and reproducibly;
2. reduce Time to First Result with staged onboarding;
3. make boundary results persistent through explicit per-engine baselines;
4. protect releases with conservative regression comparison and CI-native output;
5. validate diagnostic friction before building shared reason codes and `doctor`;
6. connect to Browserslist and framework ecosystems only after the retention loop works;
7. postpone remote infrastructure until demand and the comparison contract are validated.

The product already has substantial browser acquisition, search, evidence, and honest verdict semantics. The strategic opportunity is not to add a broader browser-testing surface. It is to turn a differentiated one-time discovery capability into trusted, recurring release infrastructure.

## Key Strategic Changes

- Shifted the product promise from finding an oldest browser once to verifying and protecting a browser-support boundary over time.
- Made **Discover → Verify → Baseline → Protect** the central product journey and recurring loop.
- Collapsed the roadmap into four executable packages: P0 proof, P1 retention, P2 evidence-gated friction reduction, and P3 expansion.
- Elevated baseline storage, conservative regression detection, one GitHub workflow, and minimum CI output as the coherent P1 retention package.
- Focused the strategy on frontend/platform engineers responsible for browser support and CI, with a three-stage activation journey measured by Time to First Result.
- Treated the deterministic README demo and outcome-first README as P0 trust and growth requirements.
- Reclassified diagnostics, presets, examples, config validation, Browserslist, and extra reporters as P2 hypotheses or optional backlog rather than validated requirements.
- Added explicit experiments, metrics, and decision rules for Fast Start, baseline retention, Browserslist adoption, and README-demo conversion.
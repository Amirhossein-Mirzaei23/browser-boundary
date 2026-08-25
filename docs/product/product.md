    Product Overview
    
    browser-boundary is a TypeScript library and CLI that answers a focused question: “What is the oldest real browser version that can run this website?”
    
    Its core workflow is:
    
    1. Launch real browser binaries rather than spoofing a User-Agent.
    2. Navigate through selected application routes.
    3. evaluate navigation, JavaScript, network, rendering, and readiness signals.
    4. Search browser versions for a verified pass/fail boundary.
    5. Generate JSON and Markdown reports with screenshots, traces, and logs.
    
    Primary users are frontend engineers, QA and test-automation engineers, library maintainers, and CI/platform teams responsible for browser-support policies.
    
    The closest alternatives are:
    
    - Browserslist and Can I Use for static support declarations.
    - Playwright and Selenium for general browser automation.
    - BrowserStack, Sauce Labs, and Browserling for hosted browser/device coverage.
    
    The package’s meaningful differentiation is automated boundary discovery. General test frameworks run the versions users select; browser-boundary searches for the oldest verified
    passing version and preserves unavailable tests as inconclusive.
    
    Current public evidence:
    
    - npm version: 1.5.2
    - Published versions: 10 since August 8, 2026
    - Last-month npm downloads: 1,537
    - Last-week npm downloads: 1,096
    - GitHub: 1 star, 0 forks, 0 open issues, no topics, and no repository description
    - Package size: approximately 428 KB compressed and 1.68 MB unpacked
    - License: MIT
    - Node.js requirement: 18 or newer
    - Historical coverage: Chromium 67+, Firefox 52+, and current Playwright WebKit
    - Distribution: ESM, CommonJS, TypeScript declarations, and CLI
    
    The package has early npm activity but very little visible GitHub validation. Downloads alone do not prove active usage or retention.
    
    Current Strengths
    
    - The product solves a specific problem instead of presenting itself as another general browser-testing framework.
    - The README clearly explains the difference between measuring runtime behavior and relying on static compatibility declarations.
    - Results distinguish pass, fail, inconclusive, error, and skipped, reducing the risk of unsupported claims.
    - Reports expose two concrete boundary points: oldestVerifiedPassing and firstVerifiedFailing.
    - The binary-search strategy reduces the number of browser runs required.
    - Both CLI and typed APIs are available, supporting exploratory use and integration into test infrastructure.
    - Multiple routes, custom readiness functions, selectors, network filters, confidence thresholds, exact versions, and JSON configuration are supported.
    - JSON and Markdown reports, screenshots, traces, logs, and meaningful exit codes make CI use practical.
    - The README is unusually detailed about historical-browser limitations, archive failures, infrastructure errors, sandboxing, cache size, and Safari/WebKit semantics.
    - Historical Chromium uses matching WebDriver infrastructure where modern Playwright protocol behavior is unsuitable.
    - Historical Firefox support extends the product beyond a Chromium-only scanner.
    - CI runs type-checking, unit tests, builds, package-content checks, and browser fixture tests.
    - Releases publish through npm provenance.
    - The package has shown rapid iteration, including ten npm releases within approximately two weeks.
    - The package avoids site-specific coupling in its core and enforces this through CI.
    - npm data shows 1,096 of the last 1,537 monthly downloads occurred in the most recent week. That is a promising early signal, although the source of those downloads is unknown.
    
    Product Gaps
    
    - The README does not provide recorded proof of the central claim. It contains a TODO for a terminal recording or screenshot at README.md:154.
    - GitHub discovery is weak: the repository has no description, no topics, one star, no forks, and no visible user discussions or issues.
    - The repository has no issue templates or separate CONTRIBUTING.md. Contribution guidance exists only near the end of the long README.
    - There are only two source examples: a basic scan and a Tabdeal-specific example. There is no copy-ready GitHub Actions workflow file, authenticated-app example, monorepo example, or
    framework-specific recipe.
    - The quick start introduces a large browser download before demonstrating value. This increases activation cost.
    - The default scan covers all engines and opens visible windows, which is transparent but potentially surprising and expensive for a first run.
    - Historical binary downloads can consume multiple gigabytes and fail due to archive or host compatibility. These constraints are documented but still create significant operational
    friction.
    - Platform support is not summarized clearly as a product promise. Some historical Chromium paths are explicitly Linux-specific, while geckodriver handling spans additional platforms.
    Users cannot quickly determine which engine/version combinations are validated on their OS.
    - WebKit is current-only and cannot substantiate historical Safari claims, limiting teams whose support policy centers on Safari.
    - The generated package includes source maps and has an unpacked size around 1.68 MB. This is not necessarily harmful for a CLI, but it should be an intentional packaging decision.
    - The public API is broad and exposes low-level internals. There is no explicit public API stability policy beyond semantic-versioning language.
    - The README’s configuration precedence is not immediately obvious, and legacy MRZ_* environment variables remain visible despite the renamed package.
    - The changelog contains a duplicate [Unreleased] heading and stale historical statements that may confuse readers about present Firefox support.
    - There are no published, reproducible scan fixtures demonstrating known boundaries on controlled applications.
    - There is no machine-readable GitHub annotation, JUnit, SARIF, or badge output designed for downstream CI visibility.
    - There is no baseline/diff workflow to answer the recurring release question: “Did this change move our browser boundary?”
    - There is no documented telemetry, survey, or structured feedback loop. It is therefore unclear why users install, where scans fail, or whether they return.
    - Assumption: download growth may reflect release automation, testing, mirrors, or bots rather than 1,537 distinct users.
    - Assumption: no open issues may mean low friction, but given the low GitHub engagement, it more likely means insufficient feedback volume to draw a conclusion.
    
    User Personas
    
    Frontend application engineer
    
    Pain point: Static support declarations do not prove that the deployed application actually starts, hydrates, and completes critical routes in older browsers.
    
    Reason to adopt: The package tests the real application and reports a verified boundary rather than only feature-table compatibility.
    
    Strongest adoption lever: A five-minute quick scan followed by framework-specific recipes for authenticated and hydrated applications.
    
    QA or test-automation engineer
    
    Pain point: Running a complete browser-version matrix is expensive, and selecting historical versions manually does not discover the boundary efficiently.
    
    Reason to adopt: Binary search, exact-version diagnostics, failure artifacts, and configurable readiness checks reduce manual investigation.
    
    Strongest adoption lever: A CI-ready workflow with cache configuration, stable output, and GitHub test annotations.
    
    Library or design-system maintainer
    
    Pain point: A package’s claimed browser-support floor can drift as dependencies, transpilation, or runtime APIs change.
    
    Reason to adopt: A controlled fixture can verify whether each release still works at the declared boundary.
    
    Strongest adoption lever: A baseline file and a regression mode that fails only when the verified boundary moves forward.
    
    CI/platform engineer
    
    Pain point: Historical-browser jobs are slow, storage-heavy, and sensitive to runner libraries and archive availability.
    
    Reason to adopt: The tool handles browser acquisition, caching, retries, conservative inconclusive verdicts, and distinct process exit codes.
    
    Strongest adoption lever: Official reusable GitHub Action or workflow templates with cache keys, scheduled scans, artifact upload, and runtime estimates.
    
    Engineering lead responsible for browser policy
    
    Pain point: Browser-support promises are often based on assumptions instead of reproducible evidence.
    
    Reason to adopt: Markdown and JSON reports can support release decisions and make uncertainty visible.
    
    Strongest adoption lever: A concise policy report that compares configured targets against observed boundaries and can be attached to a release.
    
    User Opportunities
    
    Opportunity: Add visual, reproducible proof to the README
    User Problem: Users must trust the central “real historical browsers” claim without seeing it
    Impact: Improves comprehension and trust at first contact
    Priority: P0
    ────────────────────────────────────────
    Opportunity: Add a fast first-success path
    User Problem: The initial install and default scan can download several hundred MB and run three engines
    Impact: Improves activation and reduces abandonment
    Priority: P1
    ────────────────────────────────────────
    Opportunity: Ship official CI recipes
    User Problem: Users must translate a CLI example into caching, scheduling, and artifact handling
    Impact: Converts experimentation into recurring use
    Priority: P1
    ────────────────────────────────────────
    Opportunity: Add baseline comparison and regression detection
    User Problem: Teams need to know whether a release worsened browser support
    Impact: Creates a repeatable release workflow and retention loop
    Priority: P1
    ────────────────────────────────────────
    Opportunity: Publish a platform/engine support matrix
    User Problem: Users cannot quickly determine validated host combinations
    Impact: Prevents failed setups and increases trust
    Priority: P1
    ────────────────────────────────────────
    Opportunity: Add GitHub annotations and JUnit output
    User Problem: Current reports require users to inspect separate artifacts
    Impact: Makes results visible where engineering teams already work
    Priority: P1
    ────────────────────────────────────────
    Opportunity: Add framework and workflow examples
    User Problem: Two examples do not cover common SSR, SPA, authentication, or local-server workflows
    Impact: Expands relevant use cases and search discovery
    Priority: P1
    ────────────────────────────────────────
    Opportunity: Add health diagnostics
    User Problem: Historical browser failures can originate from missing libraries, caches, archives, or networks
    Impact: Reduces support burden and time to recovery
    Priority: P1
    ────────────────────────────────────────
    Opportunity: Improve repository metadata and contribution surfaces
    User Problem: GitHub currently exposes almost no product category or community signal
    Impact: Improves discovery and contribution conversion
    Priority: P1
    ────────────────────────────────────────
    Opportunity: Add support-policy comparison
    User Problem: Teams need to compare evidence with Browserslist or declared targets
    Impact: Connects the package to an established ecosystem workflow
    Priority: P2
    ────────────────────────────────────────
    Opportunity: Add remote provider adapters
    User Problem: Local runners cannot provide reliable historical Safari/device coverage
    Impact: Expands coverage without misrepresenting local capabilities
    Priority: P3
    ────────────────────────────────────────
    Opportunity: Publish aggregate benchmark fixtures
    User Problem: Prospects lack independent, repeatable examples of known boundaries
    Impact: Strengthens proof and confidence
    Priority: P2
    
    Recommended Features
    
    Boundary Baseline and Regression Mode
    
    Problem:
    
    The tool finds a boundary, but recurring users lack a first-class way to compare the current result with a previously accepted support floor.
    
    Value:
    
    Introduce a baseline artifact and a command such as browser-boundary compare or --baseline. The result should classify each engine as improved, unchanged, regressed, or
    inconclusive. Inconclusive results must not be treated as regressions.
    
    Users:
    
    Library maintainers, frontend teams, QA engineers, and release managers.
    
    Adoption impact:
    
    High. It turns a one-off diagnostic tool into a release gate, providing a recurring reason to retain the package.
    
    Priority:
    
    P1 — High value.
    
    Fast Start Mode and Guided Quick Start
    
    Problem:
    
    The documented first run requires installing all current browsers and may later download historical binaries. This creates a long time to first value.
    
    Value:
    
    Lead with a lightweight current-Chromium check, explain what it validates, and then guide users toward a historical boundary scan. A quick preset could select headless current
    Chromium, one URL, concise output, and no unnecessary historical downloads.
    
    Users:
    
    First-time evaluators and frontend developers.
    
    Adoption impact:
    
    High. Lower installation cost should improve first-run completion and reduce users abandoning before seeing a result.
    
    Priority:
    
    P1 — High value.
    
    CI-Native Reporter
    
    Problem:
    
    JSON and Markdown files are useful but do not automatically surface findings in pull requests or test dashboards.
    
    Value:
    
    Add JUnit output and GitHub Actions annotations or step-summary rendering. Include the boundary, confidence, failed route, browser version, and artifact paths.
    
    Users:
    
    QA engineers, CI/platform engineers, and engineering leads.
    
    Adoption impact:
    
    High. It reduces integration work and makes results actionable during normal development.
    
    Priority:
    
    P1 — High value.
    
    Environment Doctor
    
    Problem:
    
    Historical scans fail for many reasons unrelated to website compatibility: missing shared libraries, unavailable archives, mismatched drivers, platform limitations, browser caches, or
    network restrictions.
    
    Value:
    
    Provide browser-boundary doctor to report host OS/architecture, supported engines, dependency availability, browser cache state, required shared libraries, archive reachability, and
    recommended remediation.
    
    Users:
    
    All users, especially CI/platform engineers.
    
    Adoption impact:
    
    High. Better diagnosis increases successful activation and reduces false bug reports.
    
    Priority:
    
    P1 — High value.
    
    Official Workflow Templates
    
    Problem:
    
    The README includes a minimal CI snippet, but production adoption requires caching, scheduled scans, artifact uploads, and different policies for pull requests versus releases.
    
    Value:
    
    Ship copy-ready templates for:
    
    - fast current-browser PR checks;
    - scheduled historical boundary scans;
    - release regression checks;
    - browser-cache restoration;
    - report and trace artifact upload.
    
    Users:
    
    CI/platform engineers, maintainers, and QA teams.
    
    Adoption impact:
    
    High. These templates shorten adoption from hours to minutes.
    
    Priority:
    
    P1 — High value.
    
    Platform Capability Matrix
    
    Problem:
    
    The product claims broad engine coverage, but historical download and automation paths differ by host platform. This can create mismatched expectations.
    
    Value:
    
    Publish and test a clear matrix: engine, version range, Linux/macOS/Windows support, architecture, controller, confidence level, and CI status.
    
    Users:
    
    Everyone evaluating the package.
    
    Adoption impact:
    
    Medium to high. It improves trust and prevents wasted setup effort.
    
    Priority:
    
    P1 — High value.
    
    Browserslist Policy Comparison
    
    Problem:
    
    Many teams already define browser targets with Browserslist but lack runtime evidence showing whether the deployed application meets that policy.
    
    Value:
    
    Read the project’s Browserslist configuration, compare its lowest declared versions with observed boundaries, and produce a policy result without implying that static targets and
    runtime testing are equivalent.
    
    Users:
    
    Frontend teams, library maintainers, and engineering leads.
    
    Adoption impact:
    
    Medium. It creates a natural bridge from a widely used ecosystem standard to the package’s differentiated runtime verification.
    
    Priority:
    
    P2 — Useful.
    
    Remote Browser Provider Interface and First Adapter
    
    Problem:
    
    Local binaries cannot credibly cover historical Safari, real mobile devices, or all host/browser combinations.
    
    Value:
    
    Formalize remote-provider integration and validate one hosted provider as an optional adapter. Preserve versionType, platform, and evidence provenance so remote results cannot be
    confused with local WebKit revisions.
    
    Users:
    
    Enterprise QA and platform teams.
    
    Adoption impact:
    
    Potentially high, but it introduces maintenance, credentials, and vendor-dependency costs.
    
    Priority:
    
    P3 — Experimental.
    
    Developer Experience Review
    
    Installation
    
    Strengths:
    
    - Global, npx, and local dev-dependency installation paths are documented.
    - Node.js and Playwright prerequisites are explicit.
    - Optional dependency behavior is documented.
    - The README warns about browser download size and cache growth.
    
    Gaps:
    
    - The default onboarding path installs all three current browser engines before proving value.
    - Users do not receive a concise platform-support verdict before downloading.
    - playwright is a required peer while other acquisition packages are optional, creating a dependency model that requires explanation.
    - The npm package is approximately 428 KB compressed and 1.68 MB unpacked, partly because source maps are published.
    
    Recommendation:
    
    Make a current-Chromium fast check the primary first-use path. Put complete multi-engine installation in the next step.
    
    Onboarding and time to value
    
    Strengths:
    
    - The first command is easy to understand.
    - www.whatsmybrowser.org provides visible browser identity.
    - Headed mode makes the automation transparent.
    
    Gaps:
    
    - The README’s missing recording is the most important activation gap.
    - The user must read substantial documentation before understanding scan cost and interpreting inconclusive results.
    - A full default scan may be too expensive for evaluation.
    
    Recommendation:
    
    Present a three-stage path:
    
    1. 60-second current-browser smoke test.
    2. One exact historical Chromium version.
    3. Full boundary scan with caching.
    
    Documentation and examples
    
    Strengths:
    
    - The README is comprehensive and explains limitations honestly.
    - CLI and library examples are included.
    - Troubleshooting guidance is detailed.
    - Alternatives are positioned accurately without claiming replacement.
    
    Gaps:
    
    - The 625-line README is carrying quick start, API reference, operations, contribution guidance, and architecture information.
    - There is no dedicated documentation site or versioned docs.
    - Only two executable examples exist.
    - The changelog contains duplicate headings and historical statements that can be mistaken for current behavior.
    - There is no demonstration project with a known compatibility break.
    
    Recommendation:
    
    Keep a shorter outcome-focused README and move advanced reference material into docs/. Add runnable fixtures demonstrating a known boundary.
    
    CLI and public API usability
    
    Strengths:
    
    - CLI flags are direct and have validation.
    - Exit codes distinguish compatibility failure, configuration error, and infrastructure failure.
    - Typed API and low-level extension points accommodate advanced users.
    - Exact-version testing and JSON configuration support debugging and automation.
    
    Gaps:
    
    - MRZ_* environment names reflect the package’s earlier identity and are not ideal for long-term product consistency.
    - Configuration precedence between file, environment variables, CLI flags, and defaults should be documented in one table.
    - The API exposes many low-level pieces without a stated compatibility boundary.
    - There is no command to validate a configuration without running browsers.
    
    Recommendation:
    
    Add config validate or --dry-run, document precedence, promote BC_* as canonical, and publish a stable-versus-advanced API policy.
    
    Errors and recovery
    
    Strengths:
    
    - The product deliberately reports inconclusive states.
    - The README covers common archive, WAF, ABI, cache, and browser-launch failures.
    - Invalid CLI inputs produce actionable configuration errors.
    
    Gaps:
    
    - Recovery guidance is spread through long prose.
    - There is no automated environment diagnosis.
    - No documented stable machine-readable error-code taxonomy exists beyond process exit codes.
    
    Recommendation:
    
    Add doctor, structured reason codes, and a short remediation link or command in each infrastructure error.
    
    Configuration complexity
    
    Strengths:
    
    - Simple scans require only a URL.
    - Advanced needs are configurable without hard-coding site behavior.
    
    Gaps:
    
    - The configuration surface is already broad.
    - Users must understand engines, strategies, readiness, controllers, confidence, retries, networking, caching, and output.
    - There are no named presets for common goals.
    
    Recommendation:
    
    Introduce presets such as quick, ci, release-boundary, and debug-exact, with resolved configuration printed in dry-run mode.
    
    Learning curve and ongoing operation
    
    Strengths:
    
    - Concepts are explained accurately.
    - Generated Markdown provides an understandable artifact.
    - Caching and scheduled-scan advice is present.
    
    Gaps:
    
    - There is no recurring workflow centered on a baseline.
    - Users must design their own retention loop and reporting policy.
    - Cost and runtime estimates are absent.
    
    Recommendation:
    
    Make “record baseline → compare on release → investigate regression” the primary ongoing workflow.
    
    Open-Source Growth Strategy
    
    Positioning
    
    Use one consistent category statement:
    
    “browser-boundary is a browser-support verification tool that searches real browser versions to find your application’s oldest verified passing version.”
    
    Avoid leading with generic “cross-browser testing,” where large frameworks and cloud vendors dominate. Own “browser compatibility boundary” and “browser support regression.”
    
    README proof
    
    The next README revision should add:
    
    - a short terminal recording;
    - one screenshot showing a genuinely old Chromium runtime version;
    - a sample Markdown boundary report;
    - a three-step fast-start path;
    - a clear Linux/macOS/Windows capability matrix;
    - a “use this / do not use this” comparison table;
    - measured runtime and disk examples clearly labeled by environment.
    
    This is the only P0 recommendation because the product’s central differentiation currently lacks immediate proof.
    
    Examples and use-case documentation
    
    Add executable examples for:
    
    - React/Vite SPA hydration;
    - Next.js or Nuxt SSR;
    - authenticated routes using a custom hook;
    - local development servers;
    - GitHub Actions with cache and artifacts;
    - scheduled release-boundary scanning;
    - Browserslist policy comparison;
    - regression from a checked-in baseline.
    
    Each example should represent a user job, not merely another API shape.
    
    GitHub experience
    
    Immediately set:
    
    - repository description;
    - homepage;
    - topics such as browser-compatibility, playwright, cross-browser-testing, browser-testing, webdriver, and browserslist.
    
    Add:
    
    - bug report template requesting OS, architecture, engine, requested version, result reason, and doctor output;
    - feature request template centered on user workflow;
    - separate CONTRIBUTING.md;
    - “good first issue” tasks;
    - discussions for usage questions and compatibility findings.
    
    Do not interpret zero issues as product validation. Explicitly ask early users where setup failed.
    
    Community feedback loops
    
    Add an opt-in, non-telemetry feedback path:
    
    - a post-run message linking to a short issue/discussion template;
    - a periodic “Which workflow are you using?” GitHub discussion;
    - an examples request in release notes;
    - a troubleshooting template that captures structured environment information.
    
    Avoid automatic telemetry until the project has a clear privacy policy and a demonstrated need.
    
    Release communication
    
    The release cadence is active but difficult to follow externally.
    
    For each meaningful release:
    
    - publish concise GitHub release notes;
    - lead with the user problem and outcome;
    - show one command demonstrating the change;
    - identify any boundary or cache behavior changes;
    - announce releases in relevant testing and frontend communities without spamming.
    
    Consolidate the changelog and remove duplicate Unreleased sections.
    
    Developer marketing
    
    Create evidence-led content:
    
    - “Why Playwright does not test arbitrary old browser versions by default”
    - “Browserslist targets versus verified runtime boundaries”
    - “How to detect a browser-support regression before release”
    - “Why unavailable historical binaries must remain inconclusive”
    - “Testing Chrome 67 through current Chrome without User-Agent spoofing”
    
    The Playwright issue history shows recurring demand for testing specific and older browser versions. Educational material around that gap provides a credible discovery channel.
    
    Ecosystem partnerships
    
    Potential integrations, in priority order:
    
    1. Browserslist comparison.
    2. GitHub Actions summaries and artifacts.
    3. Playwright-oriented recipes.
    4. Nx/Turborepo examples.
    5. Optional BrowserStack or Sauce Labs adapters for coverage unavailable locally.
    
    Competitive Opportunity
    
    The package should not compete with Playwright as a test framework or with BrowserStack as a device cloud.
    
    Its strongest defensible position is:
    
    “Given a deployed application and an observable success condition, automatically find and preserve the verified browser support boundary.”
    
    That position combines:
    
    - real runtime execution;
    - historical browser acquisition;
    - efficient boundary search;
    - conservative inconclusive handling;
    - reproducible evidence;
    - regression comparison over time.
    
    Browserslist and Can I Use define expected support. Playwright provides automation. BrowserStack and Sauce Labs provide infrastructure. browser-boundary can become the focused
    decision layer that determines whether a real application still satisfies its support policy.
    
    The most sustainable underserved workflow is release regression detection—not general matrix testing. A checked-in baseline, CI comparison, and clear evidence report would make the
    tool uniquely useful without requiring it to match cloud vendors’ device inventory.
    
    Roadmap
    
    Short Term — Next Release
    
    1. Add a real terminal recording and result screenshot to the README.
    2. Replace the first-run flow with a lightweight current-Chromium check followed by historical scanning.
    3. Publish a host-platform and engine/version capability matrix.
    4. Add copy-ready GitHub Actions workflows for fast PR checks and scheduled historical scans.
    5. Add GitHub repository description, topics, issue templates, and a dedicated contribution guide.
    6. Consolidate duplicate changelog sections and clarify current Firefox coverage.
    7. Add --dry-run or configuration validation that prints the resolved scan plan.
    8. Decide whether production source maps need to ship; document or reduce package contents accordingly.
    
    Success signals:
    
    - first-time setup issues can be diagnosed from documented commands;
    - the README demonstrates the core claim without requiring installation;
    - users can copy a complete CI workflow without designing one themselves.
    
    Medium Term — Next 3 Months
    
    1. Add baseline storage and boundary-regression comparison.
    2. Add JUnit and GitHub Actions summary/annotation output.
    3. Add browser-boundary doctor.
    4. Publish framework-specific and authenticated-route examples.
    5. Establish structured machine-readable infrastructure reason codes.
    6. Add named presets for quick, CI, release, and exact-version debugging.
    7. Add controlled demo fixtures with known compatibility breaks.
    8. Add Browserslist policy comparison as an opt-in workflow.
    9. Collect structured feedback from early users before expanding the feature surface.
    
    Success signals:
    
    - repositories run the package repeatedly rather than once;
    - regression output is understandable directly from a pull request;
    - infrastructure failures produce actionable diagnoses;
    - at least several external repositories or contributors validate the workflows.
    
    Long Term — Next 6–12 Months
    
    1. Stabilize a provider interface for local and remote browser infrastructure.
    2. Validate one optional hosted-provider adapter for historical Safari/device coverage.
    3. Publish reproducibility metadata covering host, browser source, controller, and artifact provenance.
    4. Build an ecosystem of reusable route/readiness recipes without putting site-specific behavior into core.
    5. Create a public compatibility-fixture suite for comparing provider reliability.
    6. Consider a GitHub Action wrapper only after the CLI baseline workflow is stable.
    7. Define public API stability guarantees for high-level versus advanced exports.
    
    Success signals:
    
    - the package is recognized as a browser-support boundary and regression tool;
    - results are reproducible across documented environments;
    - integrations extend coverage without weakening conservative verdict semantics;
    - maintenance burden remains realistic for an open-source project.
    
    Final Product Recommendation
    
    If this package should become a widely adopted npm package, the highest-leverage strategic moves are:
    
    1. Prove the core claim immediately. Add a visible recording showing a real historical browser and its resulting boundary report.
    2. Reduce first-run cost. Make the default onboarding experience a fast current-Chromium validation before asking users to install or download a historical matrix.
    3. Build the retention loop. Add baseline comparison so teams can detect browser-support regressions on every release.
    4. Become CI-native. Ship complete workflows, cache guidance, artifact upload, JUnit/GitHub summaries, and environment diagnostics.
    5. Own one category. Position the package as “verified browser-support boundary and regression detection,” not as another cross-browser framework.
    6. Improve public trust and discovery. Complete GitHub metadata, add structured contribution and support paths, publish evidence-led examples, and validate recommendations with real
    external users before investing in remote-provider expansion.
    
    The product already has substantial technical capability and unusually honest result semantics. Its main constraint is not the absence of more browser machinery; it is the gap between
    technical depth and easy, visible, repeatable adoption.

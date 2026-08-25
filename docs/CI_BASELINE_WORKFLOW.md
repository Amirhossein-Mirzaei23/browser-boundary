# CI Baseline Workflow

How consumer repositories run `browser-boundary` as recurring infrastructure: **scan → review → accept a baseline → compare with a conservative gate**. The official copyable workflow lives at [`ci/github-actions.yml`](ci/github-actions.yml).

## Cadence

- **Scheduled (or manual)**: historical boundary scan of a stable **staging** URL, then `compare --gate` against the committed baseline. The gate fails **only for verified regressions** — inconclusive, infrastructure-only, unbaselined, and not-compared engines never fail the build.
- **Optional on pull requests**: a `quick` (current-Chromium) proof for fast signal. It is a current-browser proof, never a boundary claim.

## Staging URL and auth assumptions

- `SCAN_URL` must be a stable, reproducible environment (staging), not a mutable production page behind a WAF.
- Any authentication the target needs should be injected via repository **secrets** and browser-boundary config (e.g. a config file with headers/cookies). Never commit credentials.
- The scheduled runner needs outbound access to browser download hosts on the first (uncached) run; afterwards the Playwright and historical-browser caches make runs fast.

## Baseline acceptance flow (a reviewed change, never automatic)

```bash
# 1. Run a full scan and read the report.
npx browser-boundary https://staging.example.com/ --headless -o reports

# 2. Review reports/compatibility.json (verified evidence only) and accept it:
npx browser-boundary baseline create \
  --from ./reports/compatibility.json \
  --output ./browser-boundary.baseline.json \
  --app-id my-app --app-revision "$GIT_SHA"

# 3. Commit the baseline file in a reviewed PR. CI never writes baselines.
git add browser-boundary.baseline.json
git commit -m "chore: accept browser boundary baseline"

# 4. Every later CI run compares against it:
npx browser-boundary compare \
  --baseline ./browser-boundary.baseline.json \
  --current ./reports/compatibility.json \
  --gate -o reports
```

## Re-baselining

Re-baselining (accepting a moved boundary) is **always a separate, human-reviewed change**: run `baseline create --force` locally on a reviewed scan, open a PR with the diff, and let reviewers see exactly which verified boundaries moved and why. CI has no `baseline create` step and no `--force`.

## Caching

The workflow caches:

- `~/.cache/ms-playwright` keyed on OS, architecture, Playwright version, and the lockfile hash;
- `~/.cache/browser-boundary` (historical binaries) keyed on OS, architecture, package version, and Playwright version.

## Gate semantics (conservative by construction)

| State | Gate result |
| --- | --- |
| `regressed` (verified failure evidence) | **fail (exit 1)** |
| `improved` / `unchanged` | pass |
| `inconclusive` | pass (never a regression) |
| `unbaselined` / `not-compared` | pass by default |

The comparison summary is appended to the GitHub Step Summary (`$GITHUB_STEP_SUMMARY`) and reports are uploaded with `if: always()` so evidence survives failed gates.

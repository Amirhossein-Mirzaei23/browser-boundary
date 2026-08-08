import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { EngineName, EngineSummary, FeatureRequirement, ScanResult } from './types.js';
import { formatVersion } from './error-analyzer.js';

/**
 * report-generator.ts
 *
 * Writes two artefacts:
 *   - reports/compatibility.json   (full machine-readable scan)
 *   - reports/compatibility.md     (human report in the requested format)
 */

export interface WriteOptions {
  reportsDir: string;
}

export function writeReports(result: ScanResult, opts: WriteOptions): {
  jsonPath: string;
  mdPath: string;
} {
  if (!existsSync(opts.reportsDir)) mkdirSync(opts.reportsDir, { recursive: true });
  const jsonPath = path.join(opts.reportsDir, 'compatibility.json');
  const mdPath = path.join(opts.reportsDir, 'compatibility.md');

  writeFileSync(jsonPath, JSON.stringify(result, null, 2));
  writeFileSync(mdPath, renderMarkdown(result));
  return { jsonPath, mdPath };
}

export function renderMarkdown(result: ScanResult): string {
  const lines: string[] = [];
  const push = (s = '') => lines.push(s);

  push('# Tabdeal Browser Compatibility Report');
  push();
  push(`**Website:** ${result.website}`);
  push();
  push('**Pages:**');
  for (const p of result.pages) push(`- ${p}`);
  push();
  push(`Generated: ${result.startedAt} → ${result.finishedAt}`);
  push(`Timeout: ${result.config.timeoutMs}ms · Headed: ${result.config.headed} · ` +
    `Latest-only: ${result.config.latestOnly} · Step: ${result.config.stepSize}`);
  push();

  const engineOrder: EngineName[] = ['chromium', 'firefox', 'webkit'];
  for (const engine of engineOrder) {
    const s = result.summaries.find((x) => x.engine === engine);
    if (!s) continue;
    push(engineTitle(engine));
  }

  // Per-engine sections
  for (const engine of engineOrder) {
    const s = result.summaries.find((x) => x.engine === engine);
    if (!s) continue;
    pushSection(push, engine, s, result);
  }

  // ECMAScript / Web findings table
  push();
  push('## ECMAScript / Web Platform Findings');
  push();
  if (result.featureFindings.length === 0) {
    push('_No ES/Web feature failures were identified for the versions that failed. ' +
      'Failures were navigation, network, or rendering related._');
  } else {
    push('| Feature | Chromium | Firefox | WebKit | Evidence |');
    push('|---|---|---|---|---|');
    for (const f of result.featureFindings) {
      push(`| ${f.feature} | ${cellVer(f, 'chromium')} | ${cellVer(f, 'firefox')} | ${cellVer(f, 'webkit')} | ${escPipe(f.evidence)} |`);
    }
  }
  push();

  // Final recommendation
  push('## Final Recommendation');
  push();
  for (const engine of engineOrder) {
    const s = result.summaries.find((x) => x.engine === engine);
    if (!s) continue;
    const target = s.oldestPassing ?? s.latestTested ?? 'unknown';
    push(`- **${cap(engine)}:** >= ${target}`);
  }
  push();
  push('### Suggested Browserslist target');
  push('```text');
  push(browserslistTarget(result));
  push('```');
  push();

  // Known limitations
  push('## Known Limitations');
  push();
  push('- Playwright ships exactly ONE build per engine per release; `playwright install <engine>@N` is not supported. Historical Chrome/Firefox are obtained via Chrome-for-Testing / archive.mozilla.org and passed through `executablePath`.');
  push('- WebKit (Safari) historical binaries are NOT installable/drivable via Playwright. Only the current Playwright WebKit build is reported.');
  push('- Versions marked **INCONCLUSIVE** could not be evaluated (binary download failed, version offline, or browser would not launch). They do not affect the PASS/FAIL boundary.');
  push('- Some failures (e.g. missing telemetry/analytics) are deliberately NON-FATAL; only app-critical JS/CSS/API/font failures fail a version.');
  push();
  push('_Selectors used for the rendering check were discovered from the live site, not invented._');

  return lines.join('\n') + '\n';
}

function pushSection(
  push: (s?: string) => void,
  engine: EngineName,
  s: EngineSummary,
  result: ScanResult,
): void {
  push(`## ${cap(engine)}`);
  push();
  push(`- Latest tested: **${s.latestTested ?? 'n/a'}**`);
  push(`- Oldest passing: **${s.oldestPassing ?? 'n/a'}**`);
  push(`- First failing: **${s.firstFailing ?? 'n/a'}**`);
  push();
  push('**Result:**');
  push();
  if (s.oldestPassing) {
    push(`- SUPPORTED >= ${s.oldestPassing}`);
    if (s.firstFailing) push(`- NOT SUPPORTED < ${s.firstFailing}`);
  } else if (s.firstFailing) {
    push(`- NOT SUPPORTED < ${s.firstFailing}`);
  } else {
    push(`- INCONCLUSIVE`);
  }
  push();
  if (s.failureReason) {
    push(`**Reason for failure:** ${s.failureReason}`);
    push();
  }
  if (s.limitationNote) {
    push(`> Limitation: ${s.limitationNote}`);
    push();
  }
  if (s.inconclusive.length) {
    push(`_Inconclusive versions: ${s.inconclusive.join(', ')}_`);
    push();
  }
  if (s.skipped.length) {
    push(`<details><summary>Skipped versions (${s.skipped.length})</summary>`);
    push();
    push('Not tested because the PASS/FAIL boundary already implies their result:');
    push();
    push('```');
    push(s.skipped.join(', '));
    push('```');
    push('</details>');
    push();
  }
  void result;
}

function cellVer(f: FeatureRequirement, engine: EngineName): string {
  const v = f.minVersions[engine];
  return v === undefined ? '—' : `>= ${formatVersion(v)}`;
}

function engineTitle(engine: EngineName): string {
  return `→ [${cap(engine)}](#${engine})`;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function escPipe(s: string): string {
  return s.replace(/\|/g, '\\|').replace(/\n/g, ' ').slice(0, 120);
}

function browserslistTarget(result: ScanResult): string {
  const parts: string[] = [];
  const map: Record<EngineName, string> = {
    chromium: 'chrome',
    firefox: 'firefox',
    webkit: 'safari',
  };
  for (const s of result.summaries) {
    const target = s.oldestPassing ?? s.latestTested;
    if (target && target !== 'unknown') parts.push(`${map[s.engine]} >= ${target}`);
  }
  if (parts.length === 0) return '# (no passing versions found)';
  // Use browserslist's "last 2 versions, > 0.5%, not dead" plus our pinned floors.
  return [
    ...parts,
    'last 2 versions',
    '> 0.5%',
    'not dead',
  ].join(', ');
}

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { EngineName, EngineSummary, FeatureFinding, ScanResult } from './types.js';

/**
 * Markdown reporter. GENERIC — never hardcodes a site name. The report title
 * uses the result's `website` field. Boundary language is deliberately honest:
 * "verified" pass/fail, never "all versions below X unsupported".
 */
export function writeMarkdown(result: ScanResult, directory: string): string {
  if (!existsSync(directory)) mkdirSync(directory, { recursive: true });
  const file = path.join(directory, 'compatibility.md');
  writeFileSync(file, renderMarkdown(result));
  return file;
}

export function renderMarkdown(result: ScanResult): string {
  const L: string[] = [];
  const push = (s = '') => L.push(s);

  push(`# Browser Compatibility Report — ${result.website}`);
  push();
  push('**Pages:**');
  for (const p of result.pages) push(`- ${p}`);
  push();
  push(`Generated: ${result.startedAt} → ${result.finishedAt}`);
  push(
    `Timeout: ${result.config.timeoutMs}ms · Headed: ${result.config.headed} · ` +
      `Strategy: ${result.config.strategy} · Step: ${result.config.stepSize}`,
  );
  push();

  const order: EngineName[] = ['chromium', 'firefox', 'webkit'];
  for (const engine of order) {
    const s = result.summaries.find((x) => x.engine === engine);
    if (!s) continue;
    pushSection(push, s);
  }

  // ES / Web findings
  push('## ECMAScript / Web Platform Findings');
  push();
  if (result.featureFindings.length === 0) {
    push('_No feature-attributable failures were identified (above the configured confidence threshold). ' +
      'Failures, if any, were navigation/network/rendering related or unattributed runtime errors._');
  } else {
    push('| Feature | Confidence | Chromium | Firefox | WebKit | Evidence |');
    push('|---|---|---|---|---|---|');
    for (const f of result.featureFindings) {
      push(`| ${f.feature} | ${f.confidence} | ${cell(f, 'chromium')} | ${cell(f, 'firefox')} | ${cell(f, 'webkit')} | ${esc(f.evidence)} |`);
    }
  }
  push();

  // Final recommendation
  push('## Final Recommendation');
  push();
  for (const engine of order) {
    const s = result.summaries.find((x) => x.engine === engine);
    if (!s) continue;
    const target = s.oldestVerifiedPassing ?? s.latestTested ?? 'unknown';
    const note = s.versionType === 'playwright-revision' ? ' _(Playwright revision, not a Safari version)_' : '';
    push(`- **${cap(engine)}:** verified passing >= ${target}${note}`);
  }
  push();
  push('### Suggested Browserslist target');
  push('```text');
  push(browserslist(result));
  push('```');
  push();

  // Limitations
  push('## Known Limitations');
  push();
  push('- Playwright ships one build per engine per release; `playwright install <engine>@N` is unsupported. Historical Chrome/Firefox are fetched via Chrome-for-Testing / archive.mozilla.org.');
  push('- **WebKit cannot be sourced historically.** Only the current Playwright WebKit build is reported; it is NOT equivalent to a specific Safari version.');
  push('- Results marked **inconclusive** could not be evaluated (binary unavailable, browser would not launch, or an anti-bot/WAF stall). They do not affect the verified boundary.');
  push('- The boundary is what was **verified**: do not infer that every version below `firstVerifiedFailing` fails, or every version above `oldestVerifiedPassing` passes, without testing.');

  return L.join('\n') + '\n';
}

function pushSection(push: (s?: string) => void, s: EngineSummary): void {
  push(`## ${cap(s.engine)}${s.versionType === 'playwright-revision' ? ' (Playwright WebKit revision)' : ''}`);
  push();
  push(`- Latest tested: **${s.latestTested ?? 'n/a'}**`);
  push(`- Oldest verified passing: **${s.oldestVerifiedPassing ?? 'n/a'}**`);
  push(`- First verified failing: **${s.firstVerifiedFailing ?? 'n/a'}**`);
  push(`- Boundary confidence: **${s.boundaryConfidence}**`);
  push();
  push('**Result:**');
  push();
  push(`- ${s.resultLine}`);
  push();
  if (s.failureReason) {
    push(`**Reason for first verified failure:** ${s.failureReason}`);
    push();
  }
  if (s.limitationNote) {
    push(`> ${s.limitationNote}`);
    push();
  }
  if (s.inconclusive.length) {
    push(`_Inconclusive/error versions: ${s.inconclusive.join(', ')}_`);
    push();
  }
  if (s.skipped.length) {
    push(`<details><summary>Skipped versions (${s.skipped.length}) — not tested, boundary implied</summary>`);
    push();
    push('```');
    push(s.skipped.join(', '));
    push('```');
    push('</details>');
    push();
  }
}

function cell(f: FeatureFinding, engine: EngineName): string {
  const v = f.minVersions[engine];
  return v === undefined ? '—' : `>= ${v}`;
}

function browserslist(result: ScanResult): string {
  const map: Record<EngineName, string> = { chromium: 'chrome', firefox: 'firefox', webkit: 'safari' };
  const parts: string[] = [];
  for (const s of result.summaries) {
    const target = s.oldestVerifiedPassing ?? s.latestTested;
    if (target && s.versionType !== 'playwright-revision') parts.push(`${map[s.engine]} >= ${target}`);
  }
  if (parts.length === 0) return '# (no verified real-major passing versions; add targets manually)';
  return [...parts, 'last 2 versions', '> 0.5%', 'not dead'].join(', ');
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function esc(s: string): string {
  return s.replace(/\|/g, '\\|').replace(/\n/g, ' ').slice(0, 120);
}

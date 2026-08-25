import { appendFileSync } from 'node:fs';
import type { ScanComparison } from '../baseline/compare.js';

/**
 * GitHub Step Summary renderer (Task 16). Concise GitHub-native comparison
 * evidence: one Markdown table plus warnings, appended to the file named by
 * GITHUB_STEP_SUMMARY when running under GitHub Actions. Render-only — it
 * never recomputes or alters comparison semantics.
 */

/** Escape Markdown-significant characters for table cells and HTML injection. */
function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ');
}

export function renderGithubSummary(comparison: ScanComparison): string {
  const lines: string[] = [
    '### Browser Boundary Comparison',
    '',
    `- Overall: **${esc(comparison.overall)}**${comparison.scopeMatch ? '' : ' — ⚠️ scope drifted from the baseline'}`,
    '',
    '| Engine | Baseline | Current | State | Diagnostic |',
    '| --- | --- | --- | --- | --- |',
  ];
  for (const e of comparison.engines) {
    const diag = `${e.reasonCode}${e.message ? `: ${e.message}` : ''}`;
    lines.push(
      `| ${esc(e.engine)} | ${e.baselineBoundary ?? '—'} | ${e.currentBoundary ?? '—'} | ${esc(e.state)} | ${esc(diag)} |`,
    );
  }
  lines.push('');
  for (const e of comparison.engines) {
    for (const w of e.warnings) {
      lines.push(`- ⚠️ ${esc(e.engine)} (${esc(w.code)}): ${esc(w.message)}`);
    }
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

export interface GithubSummaryOptions {
  env?: NodeJS.ProcessEnv;
}

/**
 * Append the summary to $GITHUB_STEP_SUMMARY. Returns true when appended,
 * false when the variable is absent (never creates files outside Actions).
 */
export function appendGithubStepSummary(
  comparison: ScanComparison,
  options: GithubSummaryOptions = {},
): boolean {
  const target = (options.env ?? process.env).GITHUB_STEP_SUMMARY;
  if (!target) return false;
  appendFileSync(target, `\n${renderGithubSummary(comparison)}`, 'utf8');
  return true;
}

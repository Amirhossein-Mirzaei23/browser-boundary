import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { ScanComparison } from '../baseline/compare.js';

/**
 * Canonical comparison Markdown reporter. Render-only: mirrors the JSON
 * exactly on states, warnings, and evidence — no state is recomputed or
 * softened here, and `inconclusive` is never phrased as a regression.
 */

export function renderComparisonMarkdown(comparison: ScanComparison): string {
  const lines: string[] = [
    '# Browser Boundary Comparison',
    '',
    `- Overall: **${comparison.overall}** (display only; per-engine states are authoritative)`,
    `- Scope: ${comparison.scopeMatch ? 'matches baseline' : '**drifted** (fingerprint differs)'}`,
    `- Baseline fingerprint: \`${comparison.baselineFingerprint}\``,
    `- Current fingerprint: \`${comparison.currentFingerprint}\``,
    '',
    '| Engine | State | Baseline | Current | Version type | Comparable | Reason |',
    '| --- | --- | --- | --- | --- | --- | --- |',
  ];
  for (const e of comparison.engines) {
    lines.push(
      `| ${e.engine} | ${e.state} | ${e.baselineBoundary ?? '—'} | ${e.currentBoundary ?? '—'} | ${e.versionType} | ${e.comparable ? 'yes' : 'no'} | ${e.reasonCode} |`,
    );
  }
  lines.push('');
  for (const e of comparison.engines) {
    lines.push(`## ${e.engine} — ${e.state}`);
    lines.push('');
    lines.push(e.message);
    lines.push('');
    for (const w of e.warnings) {
      lines.push(`- warning (${w.code}): ${w.message}`);
    }
    for (const ev of e.evidence) {
      lines.push(`- evidence: ${ev.kind} ${ev.engine} ${ev.version ?? '—'} → ${ev.verdict}${ev.url ? ` (${ev.url})` : ''}`);
    }
    lines.push('');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

export function writeComparisonMarkdown(comparison: ScanComparison, directory: string): string {
  mkdirSync(directory, { recursive: true });
  const file = path.join(directory, 'comparison.md');
  writeFileSync(file, renderComparisonMarkdown(comparison), 'utf8');
  return file;
}

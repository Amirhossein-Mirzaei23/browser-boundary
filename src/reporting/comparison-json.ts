import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { ScanComparison } from '../baseline/compare.js';

/**
 * Canonical comparison JSON reporter. Render-only: serializes the canonical
 * comparison object exactly as the pure comparator produced it — states,
 * warnings, and evidence are never recomputed here.
 */

/** Canonical machine shape (adds only render metadata, never new semantics). */
export function renderComparisonJson(comparison: ScanComparison): ScanComparison & {
  generatedBy: 'browser-boundary compare';
} {
  return { ...comparison, generatedBy: 'browser-boundary compare' };
}

export function writeComparisonJson(comparison: ScanComparison, directory: string): string {
  mkdirSync(directory, { recursive: true });
  const file = path.join(directory, 'comparison.json');
  writeFileSync(file, `${JSON.stringify(renderComparisonJson(comparison), null, 2)}\n`, 'utf8');
  return file;
}

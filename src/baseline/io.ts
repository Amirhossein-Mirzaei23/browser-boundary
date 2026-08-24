import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { BoundaryBaseline } from './types.js';
import { validateBaseline, type BaselineValidation } from './schema.js';

/**
 * Baseline file I/O. Reading validates the schema; writing is non-destructive
 * by default (an existing baseline is never silently overwritten).
 */

export function readBaseline(path: string): BaselineValidation {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    return {
      ok: false,
      errors: [`Could not read baseline ${path}: ${err instanceof Error ? err.message : String(err)}`],
    };
  }
  return validateBaseline(raw);
}

export interface WriteBaselineOptions {
  /** Explicitly replace an existing baseline file. Default false. */
  force?: boolean;
}

export function writeBaseline(path: string, baseline: BoundaryBaseline, options: WriteBaselineOptions = {}): void {
  if (existsSync(path) && !options.force) {
    throw new Error(`Baseline file already exists at ${path}; pass { force: true } to update it explicitly.`);
  }
  // Deterministic serialization: trailing newline, stable field order.
  writeFileSync(path, `${JSON.stringify(baseline, null, 2)}\n`, 'utf8');
}

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { ScanResult } from './types.js';

/** Writes the full machine-readable scan result as JSON. */
export function writeJson(result: ScanResult, directory: string): string {
  if (!existsSync(directory)) mkdirSync(directory, { recursive: true });
  const file = path.join(directory, 'compatibility.json');
  writeFileSync(file, JSON.stringify(result, null, 2));
  return file;
}

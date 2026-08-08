import { createWriteStream, existsSync, mkdirSync } from 'node:fs';
import { readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';

/** Shared helpers for browser providers (no engine-specific knowledge here). */

/** Read/write a small manifest so we don't re-download/extract a version we already have. */
export async function readManifest(recordPath: string): Promise<{
  executablePath: string;
  buildLabel: string;
} | null> {
  if (!existsSync(recordPath)) return null;
  try {
    const rec = JSON.parse(await readFile(recordPath, 'utf8'));
    if (rec?.executablePath && existsSync(rec.executablePath)) {
      return { executablePath: rec.executablePath, buildLabel: rec.buildLabel };
    }
  } catch {
    /* corrupt manifest — ignore */
  }
  return null;
}

export async function writeManifest(
  recordPath: string,
  data: { executablePath: string; buildLabel: string },
): Promise<void> {
  await writeFile(recordPath, JSON.stringify(data, null, 2));
}

export function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

/** Remove a partially-extracted directory (e.g. after a failed extraction). */
export async function cleanDir(dir: string): Promise<void> {
  if (existsSync(dir)) await rm(dir, { recursive: true, force: true });
  ensureDir(dir);
}

/** Stream a URL to disk using the global fetch (Node >= 18). */
export async function downloadFile(url: string, dest: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok || !res.body) {
    throw new Error(`Download failed (${res.status}) for ${url}`);
  }
  const stream = createWriteStream(dest);
  const reader = res.body.getReader();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    stream.write(value);
  }
  await new Promise<void>((resolve, reject) => {
    stream.on('finish', () => resolve());
    stream.on('error', reject);
    stream.end();
  });
}

/** Launch a browser briefly just to read the version string it reports. */
export async function readBrowserVersion(
  launch: () => Promise<{ version: () => string; close: () => Promise<void> }>,
): Promise<string> {
  const b = await launch();
  try {
    return b.version();
  } finally {
    await b.close();
  }
}

export function extractMajor(version: string): string | null {
  const m = version.match(/(\d+)\./);
  return m ? m[1] : null;
}

export { path };

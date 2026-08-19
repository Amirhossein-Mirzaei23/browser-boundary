import { createWriteStream, existsSync, mkdirSync } from 'node:fs';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import type { FetchProgressHandler } from './progress.js';

/** Shared helpers for browser providers (no engine-specific knowledge here). */

/** Read/write a small manifest so we don't re-download/extract a version we already have. */
export async function readManifest(recordPath: string): Promise<{
  executablePath: string;
  buildLabel: string;
  driverPath?: string;
} | null> {
  if (!existsSync(recordPath)) return null;
  try {
    const rec = JSON.parse(await readFile(recordPath, 'utf8'));
    if (rec?.executablePath && existsSync(rec.executablePath)) {
      return {
        executablePath: rec.executablePath,
        buildLabel: rec.buildLabel,
        driverPath: rec.driverPath,
      };
    }
  } catch {
    /* corrupt manifest — ignore */
  }
  return null;
}

export async function writeManifest(
  recordPath: string,
  data: { executablePath: string; buildLabel: string; driverPath?: string },
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

/**
 * Stream a URL to disk using the global fetch (Node >= 18). If `onProgress` is
 * supplied, it receives incremental byte events (with the Content-Length as the
 * total when the server reports it) so a caller can render a progress bar.
 */
export async function downloadFile(
  url: string,
  dest: string,
  onProgress?: FetchProgressHandler,
): Promise<void> {
  const res = await fetch(url);
  if (!res.ok || !res.body) {
    throw new Error(`Download failed (${res.status}) for ${url}`);
  }
  const totalHeader = res.headers.get('content-length');
  const total = totalHeader ? Number(totalHeader) : null;
  const totalNum = Number.isFinite(total) ? total : null;
  const stream = createWriteStream(dest);
  const reader = res.body.getReader();
  let received = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    stream.write(value);
    if (onProgress && value) {
      received += value.byteLength;
      onProgress({ type: 'bytes', received, total: totalNum });
    }
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

/**
 * Extract a `.tar.bz2` (historical Firefox Linux archive from archive.mozilla.org)
 * into a target directory using the system `tar`. Throws on non-zero exit so the
 * caller can mark the probe inconclusive rather than silently producing nothing.
 */
export function extractTarBz2(archive: string, dest: string): void {
  ensureDir(dest);
  const r = spawnSync('tar', ['-xjf', archive, '-C', dest], { stdio: 'pipe' });
  if (r.status !== 0) {
    throw new Error(
      `tar extraction failed (status ${r.status}): ${archive}. ` +
        `${r.stderr?.toString().trim() || 'no stderr'}`,
    );
  }
}

/**
 * Extract a `.zip` (geckodriver release asset) into a target directory using the
 * system `unzip`. Throws on non-zero exit. On Linux/CI this is the standard path;
 * geckodriver macOS assets are .tar.gz — see extractTarGz.
 */
export function extractZip(archive: string, dest: string): void {
  ensureDir(dest);
  const r = spawnSync('unzip', ['-o', '-q', archive, '-d', dest], { stdio: 'pipe' });
  if (r.status !== 0) {
    throw new Error(
      `unzip failed (status ${r.status}): ${archive}. ` +
        `${r.stderr?.toString().trim() || 'no stderr'}`,
    );
  }
}

/** Extract a `.tar.gz` (geckodriver macOS asset, or other gzipped tarballs). */
export function extractTarGz(archive: string, dest: string): void {
  ensureDir(dest);
  const r = spawnSync('tar', ['-xzf', archive, '-C', dest], { stdio: 'pipe' });
  if (r.status !== 0) {
    throw new Error(
      `tar extraction failed (status ${r.status}): ${archive}. ` +
        `${r.stderr?.toString().trim() || 'no stderr'}`,
    );
  }
}

/**
 * Extract a `.tar.xz` (newer Firefox Linux archives from archive.mozilla.org —
 * Mozilla switched from .tar.bz2 to .tar.xz at a certain release). Uses the
 * system `tar` with -J (xz). Throws on non-zero exit.
 */
export function extractTarXz(archive: string, dest: string): void {
  ensureDir(dest);
  const r = spawnSync('tar', ['-xJf', archive, '-C', dest], { stdio: 'pipe' });
  if (r.status !== 0) {
    throw new Error(
      `tar extraction failed (status ${r.status}): ${archive}. ` +
        `${r.stderr?.toString().trim() || 'no stderr'}`,
    );
  }
}

export { path };

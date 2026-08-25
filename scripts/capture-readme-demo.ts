/**
 * Capture the reproducible README demo assets from REAL tool output.
 *
 * Pipeline:
 *  1. Reproduce the boundary via the Task-4 verifier — abort before any asset
 *     generation if the expected real boundary cannot be reproduced.
 *  2. Launch the real Chrome-for-Testing 120 (fail) and 121 (pass) binaries,
 *     record video of each loading the demo page, and take screenshots.
 *  3. Convert/stack the recordings into docs/assets/readme-demo/*.gif and the
 *     screenshots into *.png using Playwright's bundled ffmpeg.
 *  4. Write the verifier transcript (sanitized: no usernames, home paths, or
 *     temporary paths) to docs/assets/readme-demo/transcript.txt.
 *
 * Nothing is manually edited into the assets.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, copyFileSync, rmSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startDemoServer } from '../examples/readme-demo/server.js';
import { verifyReadmeDemo, EXPECTED_BOUNDARY } from './verify-readme-demo.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ASSETS = path.join(ROOT, 'docs', 'assets', 'readme-demo');
const CFT = (major: number) =>
  path.join(os.homedir(), '.cache', 'browser-boundary', 'cft', 'chrome', `linux-${major === 120 ? '120.0.6099.109' : '121.0.6167.184'}`, 'chrome-linux64', 'chrome');

function ffmpegBin(): string {
  // Prefer the system ffmpeg (full filter set); Playwright's bundled build
  // supports only the subset Playwright itself needs.
  const sys = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' });
  if (sys.status === 0) return 'ffmpeg';
  const cache = path.join(os.homedir(), '.cache', 'ms-playwright');
  const dir = readdirSync(cache).find((d) => d.startsWith('ffmpeg'));
  if (!dir) throw new Error('No ffmpeg found (system PATH or Playwright cache).');
  return path.join(cache, dir, 'ffmpeg-linux');
}

async function main(): Promise<number> {
  mkdirSync(ASSETS, { recursive: true });

  // --- Step 1: the boundary must reproduce before any asset is generated ---
  let transcript = '';
  const origLog = console.log.bind(console);
  const origErr = console.error.bind(console);
  const tee = (sink: (s: string) => void) => (msg: string) => {
    sink(msg);
  };
  console.log = tee((m) => { origLog(m); transcript += `${m}\n`; });
  console.error = tee((m) => { origErr(m); transcript += `${m}\n`; });
  const code = await verifyReadmeDemo();
  console.log = origLog;
  console.error = origErr;
  if (code !== 0) {
    console.error('Capture aborted: the real demo boundary did not verify. No assets were generated.');
    return code;
  }

  // --- Step 2: record the real browsers loading the demo page ---
  const { chromium } = await import('playwright');
  const tmp = path.join(os.tmpdir(), `bb-demo-capture-${Date.now()}`);
  mkdirSync(tmp, { recursive: true });
  const server = await startDemoServer(0);
  const url = `http://127.0.0.1:${server.port}/`;

  const shots: Record<string, string> = {};
  const videos: Record<string, string> = {};
  for (const major of [EXPECTED_BOUNDARY.failMajor, EXPECTED_BOUNDARY.passMajor]) {
    const browser = await chromium.launch({
      executablePath: CFT(major),
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
    const context = await browser.newContext({ recordVideo: { dir: tmp } });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForTimeout(1500);
    shots[major] = path.join(tmp, `shot-${major}.png`);
    await page.screenshot({ path: shots[major], fullPage: false });
    videos[major] = (await (await (await context.close()), page.video()?.path())) ?? '';
    await browser.close();
  }
  await server.close();

  // --- Step 3: assemble assets with the bundled ffmpeg ---
  const ff = ffmpegBin();
  const run = (args: string[]) => {
    const r = spawnSync(ff, args, { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.stderr?.slice(-400)}`);
  };

  // PNG: fail and pass screenshots side by side.
  run([
    '-y', '-i', shots[EXPECTED_BOUNDARY.failMajor], '-i', shots[EXPECTED_BOUNDARY.passMajor],
    '-filter_complex', `[0][1]hstack=inputs=2`,
    path.join(ASSETS, 'browser-boundary-demo.png'),
  ]);

  // GIF: both recordings stacked (older=fail on top, newer=pass below).
  const tmpFailGif = path.join(tmp, 'fail.gif');
  const tmpPassGif = path.join(tmp, 'pass.gif');
  run(['-y', '-i', videos[EXPECTED_BOUNDARY.failMajor], '-vf', 'fps=4,scale=640:-1:flags=lanczos', tmpFailGif]);
  run(['-y', '-i', videos[EXPECTED_BOUNDARY.passMajor], '-vf', 'fps=4,scale=640:-1:flags=lanczos', tmpPassGif]);
  const tmpFailLong = path.join(tmp, 'fail-long.gif');
  const tmpPassLong = path.join(tmp, 'pass-long.gif');
  // Normalize durations so the stacked loops stay in sync.
  run(['-y', '-ignore_loop', '0', '-i', tmpFailGif, '-t', '4', '-loop', '1', tmpFailLong]);
  run(['-y', '-ignore_loop', '0', '-i', tmpPassGif, '-t', '4', '-loop', '1', tmpPassLong]);
  run([
    '-y', '-i', tmpFailLong, '-i', tmpPassLong,
    '-filter_complex', `[0][1]vstack=inputs=2,fps=4`,
    path.join(ASSETS, 'browser-boundary-demo.gif'),
  ]);

  // --- Step 4: sanitized transcript from the real verifier output ---
  transcript = transcript
    .replace(new RegExp(os.homedir().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '~')
    .replace(/\/tmp\/[^\s)]+/g, '<temporary-path>')
    .replace(/\b\d+\.\d+\.\d+\.\d+:\d+\b/g, '127.0.0.1:<ephemeral-port>');
  const env = [
    `capture-date: ${new Date().toISOString().slice(0, 10)}`,
    `os/arch: ${os.platform()} ${os.arch()}`,
    `node: ${process.version}`,
    `playwright: ${JSON.parse(readFileSync(path.join(ROOT, 'node_modules', 'playwright', 'package.json'), 'utf8')).version}`,
    `requested-versions: chromium ${EXPECTED_BOUNDARY.failMajor} (fail), ${EXPECTED_BOUNDARY.passMajor} (pass)`,
    `controller: playwright (CDP)`,
    `identity-methods: executable --version + browser.version()`,
    `versions-cached: true (Chrome-for-Testing builds in the local browser-boundary cache)`,
    '',
  ].join('\n');
  writeFileSync(path.join(ASSETS, 'transcript.txt'), env + transcript);

  rmSync(tmp, { recursive: true, force: true });
  origLog(`Assets written to ${path.relative(ROOT, ASSETS)}`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(await main());
}
export { main as captureReadmeDemo };

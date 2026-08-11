import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FetchProgressRenderer, type ProgressStream } from '../../src/cli/progress.js';
import { downloadFile } from '../../src/browsers/util.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * A minimal fake TTY stream that records every raw write() chunk and reports
 * isTTY/columns. Implements the small ProgressStream surface the renderer needs.
 */
class FakeTTY implements ProgressStream {
  readonly isTTY = true;
  columns = 80;
  readonly raw: string[] = [];
  write(s: string): boolean {
    this.raw.push(s);
    return true;
  }
}

/** Last drawn line (the last raw chunk), for concise assertions. */
function lastLine(tty: FakeTTY): string {
  return tty.raw[tty.raw.length - 1] ?? '';
}

test('renderer on TTY redraws with \\r: phase label then byte progress', () => {
  const tty = new FakeTTY();
  const r = new FetchProgressRenderer(tty);
  r.handle({ type: 'status', label: 'Downloading Chromium 111 (r1014682)…' });
  // First write is the phase change (indeterminate until bytes arrive).
  assert.ok(tty.raw[0]?.startsWith('\r'), 'phase change must redraw with a leading \\r');
  assert.match(tty.raw[0]!, /Downloading Chromium 111/);

  r.handle({ type: 'bytes', received: 50, total: 100 });
  // The byte event redraws because the integer percentage changed (0 → 50).
  assert.match(lastLine(tty), /50%/, 'byte event must draw a percentage bar');
});

test('renderer shows a percentage bar when Content-Length is known', () => {
  const tty = new FakeTTY();
  const r = new FetchProgressRenderer(tty);
  r.handle({ type: 'status', label: 'Downloading…' });
  r.handle({ type: 'bytes', received: 50, total: 100 });
  assert.match(lastLine(tty), /50%/);
});

test('renderer shows indeterminate bar when total is null (no Content-Length)', () => {
  const tty = new FakeTTY();
  const r = new FetchProgressRenderer(tty);
  r.handle({ type: 'status', label: 'Downloading…' });
  // Exceed the indeterminate byte threshold (256 KB) so the redraw is not throttled.
  r.handle({ type: 'bytes', received: 500_000, total: null });
  const line = lastLine(tty);
  assert.doesNotMatch(line, /%/, 'no percentage when total unknown');
  assert.match(line, /488 KB/, 'running byte count still shown');
});

test('renderer done() clears the in-place line on a TTY', () => {
  const tty = new FakeTTY();
  const r = new FetchProgressRenderer(tty);
  r.handle({ type: 'status', label: 'Downloading…' });
  r.handle({ type: 'bytes', received: 10, total: 100 });
  r.handle({ type: 'done', ok: true });
  // After done, a clear sequence (spaces + \r) must have been written.
  const after = lastLine(tty);
  assert.ok(after.includes('\r'), 'done must reset cursor with \\r');
  assert.equal(after.trim().length, 0, 'done line must be blank (spaces only)');
});

test('renderer uses a pulse for indeterminate phases (probing/extracting)', () => {
  const tty = new FakeTTY();
  const r = new FetchProgressRenderer(tty);
  r.handle({ type: 'status', label: 'Finding a nearby revision…', indeterminate: true });
  const line = lastLine(tty);
  assert.doesNotMatch(line, /%/, 'indeterminate phase must not show a percentage');
  assert.match(line, /Finding a nearby revision/, 'phase label shown');
});

test('downloadFile emits byte progress events with the Content-Length total', async () => {
  // Spin up a tiny HTTP server that serves a known body with Content-Length.
  const body = Buffer.alloc(2 * 1024 * 1024 + 123, 0x41); // ~2 MB
  const server: Server = createServer((_req, res) => {
    res.writeHead(200, { 'content-length': String(body.length) });
    res.end(body);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  const url = `http://127.0.0.1:${port}/chrome-linux.zip`;

  const dir = mkdtempSync(path.join(tmpdir(), 'mrz-dl-'));
  const dest = path.join(dir, 'out.zip');
  const events: { received: number; total: number | null }[] = [];
  try {
    await downloadFile(url, dest, (e) => {
      if (e.type === 'bytes') events.push({ received: e.received, total: e.total });
    });
    assert.ok(events.length > 0, 'must emit at least one bytes event');
    assert.equal(events[0]!.total, body.length, 'total must equal Content-Length');
    const last = events[events.length - 1]!;
    assert.equal(last.received, body.length, 'final received must equal body length');
  } finally {
    server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('downloadFile emits total=null when the server omits Content-Length', async () => {
  const body = Buffer.alloc(500_000, 0x42);
  const server: Server = createServer((_req, res) => {
    // chunked: no content-length header
    res.writeHead(200, {});
    res.end(body);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  const url = `http://127.0.0.1:${port}/no-len.zip`;

  const dir = mkdtempSync(path.join(tmpdir(), 'mrz-dl-nolen-'));
  const dest = path.join(dir, 'out.zip');
  const events: { received: number; total: number | null }[] = [];
  try {
    await downloadFile(url, dest, (e) => {
      if (e.type === 'bytes') events.push({ received: e.received, total: e.total });
    });
    assert.ok(events.length > 0);
    assert.equal(events[0]!.total, null, 'total must be null without Content-Length');
  } finally {
    server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

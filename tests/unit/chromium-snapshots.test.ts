import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  snapshotRevisionFor,
  findNearestAvailableSnapshotRevision,
  listAvailableRevisions,
  snapshotRevisionExists,
  probeSnapshotRevision,
  SNAPSHOT_MILESTONE_MAX,
  SNAPSHOT_MILESTONE_MIN,
} from '../../src/browsers/chromium-snapshots.js';

test('snapshotRevisionFor returns a numeric revision for majors in range', () => {
  for (const major of [60, 70, 80, 90, 100, 112]) {
    const rev = snapshotRevisionFor(major);
    assert.equal(typeof rev, 'number', `major ${major} must map to a number`);
    assert.ok(rev! > 400000 && rev! < 1100000, `major ${major} revision ${rev} looks implausible`);
  }
});

test('snapshotRevisionFor returns null above the snapshot ceiling (≥113 use CFT)', () => {
  assert.equal(snapshotRevisionFor(113), null);
  assert.equal(snapshotRevisionFor(151), null);
});

test('snapshotRevisionFor returns null below the supported floor', () => {
  assert.equal(snapshotRevisionFor(59), null);
  assert.equal(snapshotRevisionFor(0), null);
});

test('snapshot revision is deterministic (stable across calls)', () => {
  assert.equal(snapshotRevisionFor(80), snapshotRevisionFor(80));
});

test('every major 60..112 has a curated revision except documented skipped milestones', () => {
  // Chrome 82 was never released (cancelled due to COVID, March 2020 — Chrome
  // jumped 81 → 83). It has no binary on any source, so it's a legitimate gap.
  const SKIPPED_MILESTONES = new Set([82]);
  const missing: number[] = [];
  for (let m = SNAPSHOT_MILESTONE_MIN; m <= SNAPSHOT_MILESTONE_MAX; m++) {
    if (SKIPPED_MILESTONES.has(m)) continue;
    if (snapshotRevisionFor(m) === null) missing.push(m);
  }
  assert.deepEqual(
    missing,
    [],
    `these majors lack a curated snapshot revision (add them or document as skipped): ${missing.join(',')}`,
  );
});

test('documented skipped milestones (Chrome 82) return null', () => {
  assert.equal(snapshotRevisionFor(82), null, 'Chrome 82 was cancelled and has no binary');
});

// --- Fallback discovery helpers -------------------------------------------
// The snapshot bucket prunes old builds, so a curated revision can 404 even
// though nearby revisions (same milestone window) are still present. These
// helpers discover the nearest available revision. Network is stubbed via a
// fetch override on globalThis so the tests are hermetic.

type FetchImpl = typeof fetch;
const originalFetch: FetchImpl = globalThis.fetch;

/**
 * Stub globalThis.fetch. HEAD requests for `chrome-linux.zip` return a status
 * based on `headStatus[revision]` (default 404 = pruned). The GCS list API is
 * supported separately for the `listAvailableRevisions` tests.
 */
function stubFetch(
  headStatus: Record<number, number>,
  listByPrefix: Record<string, string[]> = {},
): void {
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    // GCS JSON list API
    if (url.startsWith('https://storage.googleapis.com/storage/v1/b/')) {
      const u = new URL(url);
      const prefix = u.searchParams.get('prefix') ?? '';
      const revPrefix = prefix.split('/')[1] ?? '';
      const matches = (listByPrefix[revPrefix] ?? []).map((r) => `${prefix.split('/')[0]}/${r}/`);
      return new Response(JSON.stringify({ prefixes: matches }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    // HEAD existence check for chrome-linux.zip
    if (init?.method === 'HEAD') {
      const m = url.match(/\/(\d+)\/chrome-linux\.zip$/);
      const rev = m ? Number(m[1]) : -1;
      return new Response(null, { status: headStatus[rev] ?? 404 });
    }
    return new Response('not found', { status: 404 });
  }) as FetchImpl;
}

test('probeSnapshotRevision distinguishes ok / pruned / unreachable', async () => {
  stubFetch({ 1014680: 404, 1014682: 200, 1014686: 403 });
  try {
    assert.equal(await probeSnapshotRevision(1014682), 'ok');
    assert.equal(await probeSnapshotRevision(1014680), 'pruned');
    assert.equal(await probeSnapshotRevision(1014686), 'unreachable');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('snapshotRevisionExists returns true for a present revision, false otherwise', async () => {
  stubFetch({ 1014682: 200, 1014680: 404, 1014686: 403 });
  try {
    assert.equal(await snapshotRevisionExists(1014682), true);
    assert.equal(await snapshotRevisionExists(1014680), false);
    assert.equal(await snapshotRevisionExists(1014686), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('snapshotRevisionExists returns false on network error (never throws)', async () => {
  globalThis.fetch = (() => Promise.reject(new Error('network down'))) as FetchImpl;
  try {
    assert.equal(await snapshotRevisionExists(123456), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('listAvailableRevisions parses bucket prefixes into a sorted numeric list', async () => {
  stubFetch({}, { '101468': ['1014682', '1014686'] });
  try {
    const revs = await listAvailableRevisions('101468');
    assert.deepEqual(revs.sort((a, b) => a - b), [1014682, 1014686]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('listAvailableRevisions returns [] on a non-OK response', async () => {
  globalThis.fetch = (async () => new Response('error', { status: 500 })) as FetchImpl;
  try {
    const revs = await listAvailableRevisions('999999');
    assert.deepEqual(revs, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('findNearestAvailableSnapshotRevision returns the closest available revision via outward probing', async () => {
  // Curated 1014680 is pruned (404); r-1=1014679 pruned; r+1=1014681 pruned;
  // r-2=1014678 pruned; r+2=1014682 OK. Nearest is 1014682 (distance 2).
  stubFetch({ 1014682: 200 });
  try {
    const near = await findNearestAvailableSnapshotRevision(1014680);
    assert.equal(near, 1014682);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('findNearestAvailableSnapshotRevision prefers the lower (nearer-older) revision on a tie', async () => {
  // Both r-1 and r+1 are OK. Lower is checked first → returned.
  stubFetch({ 1014679: 200, 1014681: 200 });
  try {
    const near = await findNearestAvailableSnapshotRevision(1014680);
    assert.equal(near, 1014679);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('findNearestAvailableSnapshotRevision returns null when no nearby revision exists (all pruned)', async () => {
  // Everything within the window is pruned (404).
  stubFetch({});
  try {
    const near = await findNearestAvailableSnapshotRevision(1014680);
    assert.equal(near, null, 'must return null, never a cross-milestone substitution');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('findNearestAvailableSnapshotRevision returns null immediately on geo-block (unreachable)', async () => {
  // The first probe returns 403 (geo-block). Must stop probing and return null
  // without checking every revision in the window.
  let headCalls = 0;
  globalThis.fetch = (async (_input: string | URL, init?: RequestInit) => {
    if (init?.method === 'HEAD') {
      headCalls++;
      return new Response(null, { status: 403 });
    }
    return new Response(null, { status: 404 });
  }) as FetchImpl;
  try {
    const near = await findNearestAvailableSnapshotRevision(1014680);
    assert.equal(near, null, 'geo-block must short-circuit to null');
    assert.equal(headCalls, 1, 'must stop after the first unreachable probe');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

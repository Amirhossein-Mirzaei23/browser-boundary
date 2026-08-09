import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  snapshotRevisionFor,
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

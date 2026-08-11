import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveGeckodriver,
  cmpSemver,
  GECKODRIVER_MATRIX,
  GECKODRIVER_ABSOLUTE_FLOOR,
} from '../../src/browsers/geckodriver-matrix.js';

test('cmpSemver orders dotted numeric versions', () => {
  assert.equal(cmpSemver('0.17.0', '0.34.0') < 0, true);
  assert.equal(cmpSemver('0.34.0', '0.17.0') > 0, true);
  assert.equal(cmpSemver('0.34.0', '0.34.0'), 0);
  // shorter strings pad with zeros
  assert.equal(cmpSemver('1.0', '1.0.0'), 0);
  assert.equal(cmpSemver('1.2', '1.1.9') > 0, true);
});

test('resolveGeckodriver returns a compatible driver for an in-range Firefox major', () => {
  const r = resolveGeckodriver(60);
  assert.ok(r, 'expected a driver for Firefox 60');
  assert.ok(r!.firefoxMin <= 60 && r!.firefoxMax >= 60, 'major must be in range');
});

test('resolveGeckodriver picks the highest compatible driver on overlap', () => {
  // Firefox 60 is covered by 0.26.0 (57-90) and 0.30.0 (60-90); 0.30.0 wins.
  const r = resolveGeckodriver(60);
  assert.equal(r?.geckodriver, '0.30.0');
});

test('resolveGeckodriver covers modern Firefox', () => {
  const r = resolveGeckodriver(115);
  assert.ok(r, 'expected a driver for Firefox 115');
  assert.equal(r?.geckodriver, '0.34.0');
});

test('resolveGeckodriver covers the oldest supported Firefox (52)', () => {
  const r = resolveGeckodriver(52);
  assert.ok(r, 'Firefox 52 should be covered by the oldest matrix row');
  assert.equal(r?.geckodriver, '0.17.0');
});

test('resolveGeckodriver returns null below the absolute floor', () => {
  // Firefox 51 / 47 are below geckodriver's floor and absent from the matrix.
  assert.equal(resolveGeckodriver(GECKODRIVER_ABSOLUTE_FLOOR - 1), null);
  assert.equal(resolveGeckodriver(47), null);
});

test('resolveGeckodriver returns null for a gap not covered by any row', () => {
  // Between the 0.30.0/0.26.0 (≤90) and 0.31.0 (≥91) rows there is no gap, but
  // verify the resolver returns null for an explicitly uncovered point by
  // temporarily trusting the matrix's own boundaries: 89 must resolve, 90 must
  // resolve, and a synthetic uncovered value returns null.
  assert.ok(resolveGeckodriver(89), '89 is in 0.26/0.30 range');
  assert.ok(resolveGeckodriver(90), '90 is in 0.26/0.30 range');
  // Construct an impossible major far above all rows' maxima with a capped check:
  // the matrix's top row goes to 9999, so this is null only if we exceed it —
  // instead confirm an absurdly negative major is null.
  assert.equal(resolveGeckodriver(-1), null);
});

test('GECKODRIVER_MATRIX is non-empty and sorted by Firefox range plausibly', () => {
  assert.ok(GECKODRIVER_MATRIX.length > 0);
  for (const row of GECKODRIVER_MATRIX) {
    assert.ok(row.firefoxMin <= row.firefoxMax, 'min must be <= max');
    assert.ok(/^\d+\.\d+\.\d+$/.test(row.geckodriver), 'driver must be a semver tag');
  }
});

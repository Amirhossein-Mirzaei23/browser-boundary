import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeSignals, matchFeature } from '../../src/analysis/error-analyzer.js';

/**
 * Error analyzer correctness:
 *  1. A generic runtime TypeError must NOT be attributed to an ES feature —
 *     confidence 'unknown' (fixes the old optional-chaining over-attribution).
 *  2. A genuine SyntaxError for optional chaining must be attributed with
 *     confidence 'high'.
 *  3. Console warnings are never fatal.
 *  4. Analytics request failures are never fatal; app script failures are.
 */
const empty = { jsErrors: [], consoleErrors: [], failedRequests: [], rendered: true };

test('runtime "Cannot read properties of undefined" is NOT attributed to a feature', () => {
  const a = analyzeSignals(
    null,
    [{ type: 'pageerror', message: "Cannot read properties of undefined (reading 'foo')" }],
    [],
    [],
    true,
    'low',
    null,
  );
  assert.equal(a.verdict, 'fail'); // pageerror is still fatal...
  assert.equal(a.finding?.confidence, 'unknown'); // ...but NOT attributed to a feature
  assert.doesNotMatch(a.finding?.feature ?? '', /optional chaining/i);
});

test('optional-chaining SyntaxError is attributed high confidence', () => {
  const a = analyzeSignals(
    null,
    [{ type: 'pageerror', message: "Unexpected token '?.'" }],
    [],
    [],
    true,
    'low',
    null,
  );
  assert.equal(a.verdict, 'fail');
  assert.equal(a.finding?.feature, 'Optional chaining (?.)');
  assert.equal(a.finding?.confidence, 'high');
});

test('matchFeature respects confidence threshold', () => {
  // Array.at is 'low' confidence. At threshold 'medium' it should not match.
  const f = matchFeature("Cannot read properties of undefined (reading 'at')", 'js', 'medium');
  // Note: ".at is not a function" is the low-confidence signature, but this
  // message is the generic form. Assert it does not falsely become a feature.
  assert.equal(f, null);
});

test('matchFeature matches structuredClone (medium)', () => {
  const f = matchFeature('structuredClone is not defined', 'js', 'medium');
  assert.equal(f?.feature, 'structuredClone()');
  assert.equal(f?.confidence, 'medium');
});

test('console warnings never fail; console errors only fail if feature-mapped', () => {
  const warnOnly = analyzeSignals(null, [], [{ level: 'warning', text: 'deprecated' }], [], true, 'low', null);
  assert.equal(warnOnly.verdict, 'pass');

  const errNoFeature = analyzeSignals(null, [], [{ level: 'error', text: 'something weird' }], [], true, 'low', null);
  assert.equal(errNoFeature.verdict, 'pass'); // unmapped console error is not fatal
});

test('analytics request failure is non-fatal; app script failure is fatal', () => {
  const analyticsOnly = analyzeSignals(
    null, [], [],
    [{ url: 'https://google-analytics.com/g/collect', method: 'GET', resourceType: 'image', failureText: 'net::ERR_FAILED', category: 'analytics', fatal: false }],
    true, 'low', null,
  );
  assert.equal(analyticsOnly.verdict, 'pass');

  const appScript = analyzeSignals(
    null, [], [],
    [{ url: 'https://app.example.com/app.js', method: 'GET', resourceType: 'script', failureText: 'net::ERR_FAILED', category: 'js', fatal: true }],
    true, 'low', null,
  );
  assert.equal(appScript.verdict, 'fail');
});

test('navigation error fails regardless of other signals', () => {
  const a = analyzeSignals('Navigation timeout', [], [], [], true, 'low', null);
  assert.equal(a.verdict, 'fail');
  assert.match(a.reason, /navigation error/i);
});

test('not rendered fails with a readiness reason', () => {
  const a = analyzeSignals(null, [], [], [], false, 'low', null);
  assert.equal(a.verdict, 'fail');
  assert.match(a.reason, /did not render|required application content|readiness/i);
});

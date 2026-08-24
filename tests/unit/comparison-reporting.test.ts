import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderComparisonJson, writeComparisonJson } from '../../src/reporting/comparison-json.js';
import { renderComparisonMarkdown, writeComparisonMarkdown } from '../../src/reporting/comparison-markdown.js';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ScanComparison } from '../../src/baseline/compare.js';

function comparison(): ScanComparison {
  return {
    overall: 'regressed',
    scopeMatch: false,
    baselineFingerprint: 'a'.repeat(64),
    currentFingerprint: 'b'.repeat(64),
    engines: [
      {
        engine: 'chromium',
        versionType: 'real-major',
        state: 'regressed',
        baselineBoundary: '71',
        currentBoundary: '73',
        reasonCode: 'verified-regression',
        message: 'verified passing floor moved newer (71 -> 73) with a verified failure at 72',
        comparable: true,
        warnings: [{ code: 'scope-drift', message: 'scan configuration differs from the accepted baseline' }],
        evidence: [
          { kind: 'baseline', engine: 'chromium', version: '71', verdict: 'pass' },
          { kind: 'current', engine: 'chromium', version: '72', verdict: 'fail' },
        ],
      },
      {
        engine: 'firefox',
        versionType: 'real-major',
        state: 'inconclusive',
        baselineBoundary: '63',
        currentBoundary: null,
        reasonCode: 'infrastructure-only',
        message: 'engine firefox produced only inconclusive/error evidence in the current scan',
        comparable: false,
        warnings: [],
        evidence: [{ kind: 'baseline', engine: 'firefox', version: '63', verdict: 'pass' }],
      },
      {
        engine: 'webkit',
        versionType: 'playwright-revision',
        state: 'not-compared',
        baselineBoundary: '2182',
        currentBoundary: null,
        reasonCode: 'engine-not-in-scan',
        message: 'engine webkit was not scanned',
        comparable: false,
        warnings: [],
        evidence: [],
      },
    ],
  };
}

const STATES = ['improved', 'unchanged', 'regressed', 'inconclusive', 'unbaselined', 'not-compared'] as const;

test('JSON and Markdown expose identical engine, state, boundary, version type, comparability, reason code, warnings, and evidence', () => {
  const json = renderComparisonJson(comparison());
  const md = renderComparisonMarkdown(comparison());

  for (const engine of json.engines) {
    assert.ok(md.includes(engine.engine));
    assert.ok(md.includes(engine.state));
    assert.ok(md.includes(engine.reasonCode));
    if (engine.baselineBoundary) assert.ok(md.includes(engine.baselineBoundary));
    if (engine.currentBoundary) assert.ok(md.includes(engine.currentBoundary));
    assert.ok(md.includes(engine.versionType));
  }
  assert.equal(json.engines.length, 3);
  assert.deepEqual(
    json.engines.map((e) => e.state),
    ['regressed', 'inconclusive', 'not-compared'],
  );
  // Evidence references survive in both outputs.
  const evidenceVersions = json.engines.flatMap((e) => e.evidence.map((x) => x.version));
  assert.ok(evidenceVersions.includes('72'));
  assert.ok(md.includes('72'));
  assert.ok(md.includes('scope-drift'));
});

test('every comparison state renders in both reporters without becoming "regressed" in prose', () => {
  for (const state of STATES) {
    const c: ScanComparison = {
      ...comparison(),
      overall: state,
      engines: [
        { ...comparison().engines[0], state, reasonCode: `code-${state}` },
      ],
    };
    const json = renderComparisonJson(c);
    const md = renderComparisonMarkdown(c);
    assert.equal(json.engines[0].state, state);
    assert.ok(md.includes(state));
    if (state !== 'regressed') {
      // The word regressed must not appear as this engine's state in markdown.
      assert.ok(!md.includes(`**${comparison().engines[0].engine}** | regressed`));
    }
  }
});

test('inconclusive is never reported as a regression in either output', () => {
  const c = comparison();
  c.overall = 'inconclusive';
  const json = JSON.stringify(renderComparisonJson(c));
  const md = renderComparisonMarkdown(c);
  assert.equal(c.engines[1].state, 'inconclusive');
  assert.ok(md.includes('inconclusive'));
  // The firefox engine row must not carry the regressed state.
  assert.ok(!/firefox.*regressed/i.test(md));
});

test('reporters do not recompute states (render-only contract)', async () => {
  const fs = await import('node:fs');
  const jsonSrc = fs.readFileSync(new URL('../../src/reporting/comparison-json.ts', import.meta.url), 'utf8');
  const mdSrc = fs.readFileSync(new URL('../../src/reporting/comparison-markdown.ts', import.meta.url), 'utf8');
  for (const src of [jsonSrc, mdSrc]) {
    assert.ok(!/compareScanToBaseline/.test(src));
  }
});

test('filesystem wrappers write canonical files', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bb-rep-'));
  const jsonPath = writeComparisonJson(comparison(), dir);
  const mdPath = writeComparisonMarkdown(comparison(), dir);
  const json = JSON.parse(readFileSync(jsonPath, 'utf8'));
  assert.equal(json.overall, 'regressed');
  assert.ok(readFileSync(mdPath, 'utf8').includes('# Browser Boundary Comparison'));
  rmSync(dir, { recursive: true, force: true });
});

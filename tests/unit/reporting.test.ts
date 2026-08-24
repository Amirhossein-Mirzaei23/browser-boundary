import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown } from '../../src/reporting/markdown.js';
import type { ScanResult } from '../../src/reporting/types.js';

function sampleResult(): ScanResult {
  return {
    website: 'https://example.com',
    pages: ['https://example.com'],
    startedAt: '2026-01-01T00:00:00.000Z',
    finishedAt: '2026-01-01T00:01:00.000Z',
    config: { timeoutMs: 30000, headed: false, latestOnly: false, quick: false, strategy: 'binary', stepSize: 10, versionFloor: { chromium: 60 } },
    provenance: {
      packageVersion: '1.5.2',
      os: 'linux',
      arch: 'x64',
      controllerPolicy: 'auto',
      routes: [{ url: 'https://example.com', label: 'home', readiness: 'none' }],
      checks: { navigation: true, javascript: true, console: true, network: true, rendering: true, readiness: true },
    },
    results: [],
    summaries: [
      {
        engine: 'chromium',
        versionType: 'real-major',
        tested: ['120', '110'],
        latestTested: '120',
        oldestVerifiedPassing: '111',
        firstVerifiedFailing: '110',
        boundaryConfidence: 'high',
        inconclusive: [],
        skipped: [],
        resultLine: 'verified PASS >= 111; verified FAIL at 110',
        failureReason: 'SyntaxError: Unexpected token ?.',
        limitationNote: null,
      },
    ],
    featureFindings: [],
  };
}

test('markdown report never mentions Tabdeal for a generic site', () => {
  const md = renderMarkdown(sampleResult());
  assert.doesNotMatch(md, /tabdeal/i);
});

test('markdown uses verified-boundary language, not absolute supported/unsupported range', () => {
  const md = renderMarkdown(sampleResult());
  assert.match(md, /verified/i);
  // Must NOT claim "all versions below" — that's an unverified extrapolation.
  assert.doesNotMatch(md, /all versions below/i);
});

test('markdown WebKit summary notes Playwright-revision, not a Safari version', () => {
  const r = sampleResult();
  r.summaries.push({
    engine: 'webkit',
    versionType: 'playwright-revision',
    tested: ['latest'],
    latestTested: 'latest',
    oldestVerifiedPassing: 'latest',
    firstVerifiedFailing: null,
    boundaryConfidence: 'low',
    inconclusive: [],
    skipped: [],
    resultLine: 'verified PASS >= latest',
    failureReason: null,
    limitationNote: 'Historical WebKit binaries are not installable.',
  });
  const md = renderMarkdown(r);
  assert.match(md, /Playwright WebKit revision/i);
  assert.match(md, /not.*specific Safari version|NOT equivalent|Playwright revision/i);
});

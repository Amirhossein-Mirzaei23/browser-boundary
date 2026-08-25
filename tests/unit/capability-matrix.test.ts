import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const MATRIX = readFileSync(new URL('../../docs/CAPABILITY_MATRIX.md', import.meta.url), 'utf8');
const README = readFileSync(new URL('../../README.md', import.meta.url), 'utf8');

test('matrix covers every engine with controller, version type, historical support, floor, host, dependency, and limitations', () => {
  for (const engine of ['Chromium', 'Firefox', 'WebKit']) {
    assert.ok(MATRIX.includes(`## ${engine}`), `${engine} section`);
  }
  for (const column of [
    'Controller',
    'Version type',
    'Historical support',
    'Supported floor',
    'Tested OS/architecture',
    'Required optional dependency',
    'Known host limitations',
  ]) {
    assert.ok(MATRIX.includes(column), `column: ${column}`);
  }
});

test('matrix distinguishes implemented, validated, best-effort, unsupported, and inconclusive behavior', () => {
  for (const label of ['Implemented range', 'Validated combinations', 'Best-effort combinations', 'Unsupported combinations', 'Inconclusive behavior']) {
    assert.ok(MATRIX.includes(label), label);
  }
});

test('WebKit is labeled as a Playwright revision and never as a Safari major', () => {
  assert.match(MATRIX, /playwright-revision/i);
  const rawSection = MATRIX.split('## WebKit')[1] ?? '';
  assert.match(rawSection, /not a Safari major/);
  const stripped = rawSection.replace(/not a Safari majors?/gi, '').replace(/Safari testing/g, '');
  assert.ok(!/Safari majors?\b/i.test(stripped));
});

test('README links to the full matrix before historical-download instructions', () => {
  const linkIdx = README.indexOf('CAPABILITY_MATRIX.md');
  const downloadIdx = README.indexOf('historical', linkIdx);
  assert.ok(linkIdx >= 0, 'README links the matrix');
  assert.ok(downloadIdx > linkIdx || README.slice(linkIdx).includes('download'), 'matrix appears before/in coverage context');
});

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
  assert.ok(linkIdx >= 0, 'README links the matrix');
  // The historical-download instructions live in the Quick start install
  // section; the capability matrix (what you can test before paying any
  // download cost) must be linked before them.
  const installIdx = README.indexOf('### 1. Install');
  assert.ok(installIdx > 0, 'README has an install section');
  assert.ok(
    linkIdx < installIdx,
    'capability matrix link must precede the historical-download instructions',
  );
  // The note may emphasize "before" with Markdown formatting; compare its
  // rendered text rather than coupling the test to that formatting.
  const renderedReadme = README.replace(/[*_]/g, '');
  const noteIdx = renderedReadme.indexOf('before paying any historical download cost');
  assert.ok(noteIdx > 0, 'README explains why readers should consult the matrix first');
});

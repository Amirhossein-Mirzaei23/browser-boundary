/**
 * Basic example: find the oldest browser version example.com can run on.
 *
 *   npx tsx examples/basic.ts
 */
import { scan } from '../src/index.js';

const result = await scan({
  urls: ['https://example.com'],
  engines: ['chromium', 'firefox', 'webkit'],
  search: { strategy: 'binary', stepSize: 10 },
  output: { format: ['json', 'markdown'], directory: './reports-example' },
});

console.log('\nResult:');
for (const s of result.summaries) {
  console.log(`  ${s.engine.padEnd(8)} ${s.resultLine}`);
}

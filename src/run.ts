import path from 'node:path';
import { loadConfig } from './config.js';
import { runScan } from './browser-version-tester.js';
import { writeReports } from './report-generator.js';

/**
 * CLI entrypoint: `npm run scan`
 *
 * Orchestrates: load config → run the version search per engine → write
 * JSON + Markdown reports → print a summary.
 */
async function main(): Promise<void> {
  const config = loadConfig();
  const reportsDir = path.resolve(config.reportsDir);
  const artifactsDir = path.join(reportsDir, 'artifacts');

  console.log('Tabdeal browser-compatibility scan');
  console.log('----------------------------------');
  console.log(`Pages:   ${config.pages.map((p) => p.label).join(', ')}`);
  console.log(`Engines: ${config.engines.join(', ')}`);
  console.log(`Timeout: ${config.timeoutMs}ms`);
  console.log(`Headed:  ${config.headed}`);
  console.log(`Mode:    ${config.latestOnly ? 'LATEST ONLY' : 'FULL STEP-DOWN SCAN'}`);
  if (!config.latestOnly) {
    console.log(`Step:    ${config.stepSize} majors`);
    console.log(`Floors:  chromium>=${config.versionFloor.chromium} firefox>=${config.versionFloor.firefox} webkit>=${config.versionFloor.webkit}`);
  }
  console.log();

  const result = await runScan({
    config,
    artifactsDir,
    onProgress: (m) => console.log(m),
  });

  const { jsonPath, mdPath } = writeReports(result, { reportsDir });

  console.log();
  console.log('Reports written:');
  console.log(`  ${jsonPath}`);
  console.log(`  ${mdPath}`);
  console.log();

  // Console summary table
  console.log('Summary');
  console.log('-------');
  for (const s of result.summaries) {
    const tag = s.oldestPassing
      ? `SUPPORTED >= ${s.oldestPassing}`
      : s.firstFailing
        ? `NOT SUPPORTED < ${s.firstFailing}`
        : 'INCONCLUSIVE';
    console.log(`  ${s.engine.padEnd(8)} ${tag}`);
  }
}

main().catch((err) => {
  console.error('Scan failed:', err);
  process.exit(1);
});

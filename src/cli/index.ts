import { parseCli, HELP, type ParsedCli } from './options.js';
import { VERSION } from './version.js';
import { scan } from '../core/scanner.js';
import { writeJson, writeMarkdown, type ScanResult } from '../reporting/index.js';
import { ConfigError } from '../config/resolve.js';
import type { ScanConfig } from '../config/schema.js';
import { FetchProgressRenderer } from './progress.js';
import { QUICK_LABEL, quickNextActions } from './quick.js';
import { runBaselineCreate } from './baseline.js';

/**
 * CLI entrypoint. Thin layer over the public scan() API. Exit codes:
 *   0 = scan completed
 *   1 = compatibility failure (verified boundary failure)
 *   2 = configuration error
 *   3 = infrastructure / browser error
 *
 * This file is what `bin/browser-boundary` resolves to after build.
 */

const EXIT = {
  OK: 0,
  COMPAT_FAIL: 1,
  CONFIG_ERROR: 2,
  INFRA_ERROR: 3,
} as const;

async function main(): Promise<number> {
  let parsed: ParsedCli;
  try {
    parsed = parseCli();
  } catch (err) {
    console.error(`Configuration error: ${err instanceof Error ? err.message : String(err)}`);
    return EXIT.CONFIG_ERROR;
  }

  if (parsed.command === 'help') {
    console.log(HELP);
    return EXIT.OK;
  }

  if (parsed.command === 'version') {
    console.log(VERSION);
    return EXIT.OK;
  }

  if (parsed.command === 'install') {
    return runInstall();
  }

  if (parsed.command === 'baseline-create') {
    return runBaselineCreate(parsed);
  }

  // scan / quick only (help, version, install, baseline-create returned above)
  if (parsed.command !== 'scan' && parsed.command !== 'quick') {
    return EXIT.CONFIG_ERROR;
  }

  // scan (or quick — a scan translated by the options layer)
  if (!parsed.config.urls?.length) {
    console.error('Configuration error: a URL is required. Run `browser-boundary --help`.');
    return EXIT.CONFIG_ERROR;
  }

  // resolveConfig will validate and apply defaults; wrap in try/catch below.
  const scanConfig = parsed.config as ScanConfig;
  const quick = parsed.command === 'quick';

  console.log('browser-boundary');
  console.log('------------------');
  if (quick) {
    console.log(QUICK_LABEL);
    console.log(`URL:     ${parsed.config.urls[0]}`);
    console.log('Engine:  chromium (current build), headless');
  } else {
    console.log(`URLs:    ${parsed.config.urls.join(', ')}`);
    console.log(`Engines: ${(parsed.config.engines ?? ['chromium', 'firefox', 'webkit']).join(', ')}`);
    console.log(`Strategy: ${parsed.config.search?.strategy ?? 'binary'}`);
  }

  let result: ScanResult;
  try {
    const renderer = new FetchProgressRenderer();
    result = await scan(scanConfig, {
      onProgress: (m) => console.log(m),
      onFetchProgress: (e) => renderer.handle(e),
    });
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(`Configuration error: ${err.message}`);
      return EXIT.CONFIG_ERROR;
    }
    console.error(`Infrastructure error: ${err instanceof Error ? err.message : String(err)}`);
    return EXIT.INFRA_ERROR;
  }

  const dir = (parsed.config.output?.directory as string | undefined) ?? './reports';
  const formats = parsed.config.output?.format ?? ['json', 'markdown'];
  console.log('\nReports:');
  if (formats.includes('json')) console.log(`  ${writeJson(result, dir)}`);
  if (formats.includes('markdown')) console.log(`  ${writeMarkdown(result, dir)}`);

  printSummary(result);

  if (quick) {
    console.log('\nNext actions');
    console.log('------------');
    for (const action of quickNextActions(parsed.config.urls![0] as string)) console.log(`  ${action}`);
  }

  // Exit code: 1 if any engine has a verified FAIL (real compat boundary
  // failure); 0 otherwise (passes or inconclusive are not compat failures).
  const hasVerifiedFail = result.summaries.some((s) => s.firstVerifiedFailing);
  const onlyInfra = result.summaries.some(
    (s) => s.resultLine.startsWith('ERROR') || s.resultLine.startsWith('INCONCLUSIVE'),
  ) && !hasVerifiedFail;
  // Pure infra errors (no real verdicts at all) → 3.
  const allInconclusive = result.summaries.every(
    (s) => !s.firstVerifiedFailing && !s.oldestVerifiedPassing,
  );
  if (allInconclusive && onlyInfra) return EXIT.INFRA_ERROR;
  return hasVerifiedFail ? EXIT.COMPAT_FAIL : EXIT.OK;
}

function printSummary(result: ScanResult): void {
  console.log('\nSummary');
  console.log('-------');
  for (const s of result.summaries) {
    const tag = s.resultLine;
    console.log(`  ${s.engine.padEnd(8)} ${tag}`);
  }
}

async function runInstall(): Promise<number> {
  console.log('Installing current Playwright browsers (chromium, firefox, webkit)...');
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync('npx', ['playwright', 'install', 'chromium', 'firefox', 'webkit'], {
    stdio: 'inherit',
  });
  if (r.status !== 0) {
    console.error('Browser installation failed. You may need system dependencies:');
    console.error('  sudo npx playwright install-deps');
    return EXIT.INFRA_ERROR;
  }
  console.log('Done.');
  return EXIT.OK;
}

main().then((code) => process.exit(code));

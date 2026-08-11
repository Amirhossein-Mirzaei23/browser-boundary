import { createRequire } from 'node:module';
import type { EngineName } from '../reporting/types.js';
import type { ResolvedConfig } from '../config/resolve.js';

/**
 * Optional-dependency gating.
 *
 * Historical browser testing needs optional packages that aren't installed by
 * default (they're optionalDependencies so a Chromium-only user never needs
 * selenium-webdriver, etc.). Rather than letting these surface as a stream of
 * cryptic per-version INCONCLUSIVE errors, we check up front: if a package an
 * engine's historical path requires is missing, the affected engine is skipped
 * with a clear, actionable message — never a crash, and never a silent failure.
 *
 * Honesty: this only blocks the engine that actually needs the missing package.
 * A scan of chromium with selenium-webdriver missing is NOT interrupted.
 */

const require = createRequire(import.meta.url);

export interface RequiredPackage {
  /** npm package name, e.g. 'selenium-webdriver'. */
  name: string;
  /** Human-readable reason this package is needed for this engine. */
  reason: string;
  /** Install command the user can copy-paste. */
  installCommand: string;
}

/** Whether an npm package is resolvable from the running process. */
export function isPackageInstalled(name: string): boolean {
  try {
    require.resolve(name);
    return true;
  } catch {
    return false;
  }
}

/**
 * Which optional packages the historical path of `engine` requires, given the
 * resolved config. Returns [] when the engine won't do a historical search
 * (latest-only strategy, or an engine with no historical capability like WebKit)
 * — in that case no optional package is needed and nothing should be blocked.
 */
export function requiredPackagesFor(
  engine: EngineName,
  config: ResolvedConfig,
): RequiredPackage[] {
  // Only historical searches (binary/step-down/explicit, NOT 'latest') need the
  // optional packages. WebKit has no historical path at all.
  if (config.strategy === 'latest') return [];
  if (engine === 'webkit') return [];

  // The provider may still be asked for the *current* build (latest version),
  // which uses Playwright's bundled browser and needs no optional package. But
  // a binary/step-down/explicit search WILL request versions below current,
  // which is exactly when the optional driver/browser-fetch package is needed.
  switch (engine) {
    case 'chromium':
      return [
        {
          name: '@puppeteer/browsers',
          reason: 'fetching historical Chrome-for-Testing binaries',
          installCommand: 'npm install @puppeteer/browsers',
        },
      ];
    case 'firefox':
      return [
        {
          name: 'selenium-webdriver',
          reason: 'driving historical Firefox via geckodriver / W3C WebDriver',
          installCommand: 'npm install selenium-webdriver',
        },
      ];
  }
}

export interface DepCheckResult {
  /** All clear — proceed with the scan. */
  ok: boolean;
  /** Missing packages (empty when ok). */
  missing: RequiredPackage[];
  /** A ready-to-print, user-facing message (empty when ok). */
  message: string;
}

/**
 * Check whether all optional packages an engine needs are present. Returns a
 * result with a clear message listing the missing package(s) and how to install
 * them. Called before an engine's historical scan begins.
 */
export function checkEngineDeps(engine: EngineName, config: ResolvedConfig): DepCheckResult {
  const required = requiredPackagesFor(engine, config);
  const missing = required.filter((p) => !isPackageInstalled(p.name));
  if (missing.length === 0) return { ok: true, missing: [], message: '' };

  const lines = [
    `${engine}: a required package is not installed — historical scan skipped.`,
    '',
    ...missing.map((p) => `  • ${p.name} — needed for ${p.reason}.`),
    '',
    'Install it with:',
    ...missing.map((p) => `    ${p.installCommand}`),
    '',
    'Then re-run. The current build is still available via --strategy latest.',
  ];
  return { ok: false, missing, message: lines.join('\n') };
}

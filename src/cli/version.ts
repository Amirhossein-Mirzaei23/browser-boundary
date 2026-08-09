import pkg from '../../package.json';

/**
 * App version, sourced from package.json. Inlined at build time (tsup/esbuild
 * bundle the JSON import), so it is correct in both the tsx dev runner and the
 * shipped dist/ output, ESM and CJS alike.
 */
export const VERSION: string = pkg.version;

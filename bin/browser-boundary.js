#!/usr/bin/env node
// Thin shim into the compiled CLI. After `npm run build`, dist/cli/index.{js,cjs}
// is the real entry; this shebang file is what the `bin` field points at.
import('../dist/cli/index.js').catch((err) => {
  console.error('browser-boundary: failed to load CLI.');
  console.error('  Did you run `npm run build` or `npx browser-boundary install`?');
  console.error(err);
  process.exit(3);
});

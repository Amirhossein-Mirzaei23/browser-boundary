/**
 * Fast Start (`quick`) constants and helpers. Kept free of side effects so
 * tests can import them without triggering the CLI entrypoint.
 */

/** Quick results are current-browser proofs, never boundary discoveries. */
export const QUICK_LABEL = 'CURRENT-BROWSER PROOF — not historical boundary discovery';

/** Next-action commands printed after a completed quick result. */
export function quickNextActions(url: string): string[] {
  return [
    `Stage 2 — verify exact historical majors: npx browser-boundary ${url} --engines chromium --versions 120,115 --headless`,
    `Stage 3 — full multi-engine scan:          npx browser-boundary ${url}`,
  ];
}

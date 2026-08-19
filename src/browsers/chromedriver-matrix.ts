/** A legacy ChromeDriver release known to support a Chromium major range. */
export interface LegacyChromeDriverCompat {
  version: string;
  minChromium: number;
  maxChromium: number;
}

/**
 * Official ChromeDriver compatibility ranges for releases before driver and
 * browser version numbers were aligned. Keep this table explicit; do not infer.
 */
export const LEGACY_CHROMEDRIVER_MATRIX: readonly LegacyChromeDriverCompat[] = [
  { version: '2.35', minChromium: 62, maxChromium: 64 },
  { version: '2.38', minChromium: 65, maxChromium: 67 },
  { version: '2.41', minChromium: 68, maxChromium: 68 },
  { version: '2.42', minChromium: 69, maxChromium: 70 },
  { version: '2.46', minChromium: 71, maxChromium: 73 },
  { version: '74.0.3729.6', minChromium: 74, maxChromium: 74 },
] as const;

export function resolveLegacyChromeDriver(major: number): LegacyChromeDriverCompat | null {
  return LEGACY_CHROMEDRIVER_MATRIX.find(
    (entry) => major >= entry.minChromium && major <= entry.maxChromium,
  ) ?? null;
}

export function legacyChromeDriverUrls(version: string): string[] {
  const asset = `${version}/chromedriver_linux64.zip`;
  return [
    `https://chromedriver.storage.googleapis.com/${asset}`,
    `https://registry.npmmirror.com/-/binary/chromedriver/${asset}`,
  ];
}

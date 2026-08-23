/** Semantic rendering engines. These are separate from executable scan families. */
export type RenderingEngineName = 'blink' | 'gecko' | 'webkit';

/** Browser/runtime targets modeled independently from their rendering engine. */
export type RuntimeTargetName = 'android-webview';

export type RuntimeDetectionConfidence = 'high' | 'medium' | 'low' | 'unknown';

export type RuntimeDetectionEvidence =
  | 'android-platform'
  | 'wv-marker'
  | 'version-4-marker'
  | 'chrome-version'
  | 'custom-or-ambiguous';

export type RuntimeVersionSource =
  | 'user-agent'
  | 'client-hints'
  | 'native-package'
  | 'explicit'
  | 'derived'
  | 'unknown';

export type RuntimeVersionPrecision = 'major' | 'partial' | 'full' | 'unknown';

export interface NormalizedRuntimeVersion {
  raw: string | null;
  major: number | null;
  precision: RuntimeVersionPrecision;
  source: RuntimeVersionSource;
}

export type RuntimeCompatibilityStatus =
  | 'supported'
  | 'unsupported'
  | 'conditional'
  | 'engine-compatible'
  | 'engine-incompatible'
  | 'unknown';

export type RuntimeCompatibilityProvenance =
  | 'webview-override'
  | 'chromium-baseline'
  | 'observed-webview'
  | 'unknown';

export interface AndroidWebViewProfile {
  runtime: 'android-webview';
  renderingEngine: 'blink';
  detectionConfidence: RuntimeDetectionConfidence;
  evidence: RuntimeDetectionEvidence[];
  runtimeVersion: NormalizedRuntimeVersion;
  chromiumVersion: NormalizedRuntimeVersion;
  engineVersion: NormalizedRuntimeVersion;
  /** Evidence whose major disagrees with the selected compatibility version. */
  versionConflicts: NormalizedRuntimeVersion[];
  warnings: string[];
}

export interface RuntimeCompatibilityResult {
  status: RuntimeCompatibilityStatus;
  provenance: RuntimeCompatibilityProvenance;
  runtime: RuntimeTargetName;
  runtimeVersion: NormalizedRuntimeVersion;
  renderingEngine: RenderingEngineName;
  engineVersion: NormalizedRuntimeVersion;
  caveat: string;
  source?: string;
  conditions?: string[];
}

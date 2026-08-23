export type {
  AndroidWebViewProfile,
  NormalizedRuntimeVersion,
  RenderingEngineName,
  RuntimeCompatibilityProvenance,
  RuntimeCompatibilityResult,
  RuntimeCompatibilityStatus,
  RuntimeDetectionConfidence,
  RuntimeDetectionEvidence,
  RuntimeTargetName,
  RuntimeVersionPrecision,
  RuntimeVersionSource,
} from './types.js';
export {
  createAndroidWebViewProfile,
  detectAndroidWebView,
  type AndroidWebViewDetection,
  type AndroidWebViewProfileInput,
} from './android-webview.js';
export {
  normalizeRuntimeVersion,
  resolveRuntimeVersion,
  type ResolvedRuntimeVersion,
  type RuntimeVersionEvidence,
} from './version.js';
export {
  evaluateAndroidWebViewCapability,
  evaluateAndroidWebViewFeature,
} from './compatibility.js';
export {
  WEBVIEW_CAPABILITIES,
  webViewCapabilityFor,
  type WebViewCapabilityCategory,
  type WebViewCapabilityEntry,
} from './webview-capabilities.js';

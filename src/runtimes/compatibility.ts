import { FEATURE_TABLE } from '../analysis/feature-database.js';
import type { AndroidWebViewProfile, RuntimeCompatibilityResult } from './types.js';
import { webViewCapabilityFor } from './webview-capabilities.js';

const BASELINE_CAVEAT =
  'Chromium/Blink compatibility is a shared engine baseline; it does not guarantee Android WebView runtime compatibility.';

export function evaluateAndroidWebViewFeature(
  profile: AndroidWebViewProfile,
  feature: string,
): RuntimeCompatibilityResult {
  const row = FEATURE_TABLE.find((candidate) => candidate.feature === feature);
  const minimum = row?.minVersions.chromium;
  const actual = profile.engineVersion.major;
  if (profile.versionConflicts.length > 0 || minimum === undefined || actual === null) {
    return result(profile, 'unknown', 'unknown');
  }
  return result(
    profile,
    actual >= minimum ? 'engine-compatible' : 'engine-incompatible',
    'chromium-baseline',
  );
}

export function evaluateAndroidWebViewCapability(
  profile: AndroidWebViewProfile,
  capability: string,
): RuntimeCompatibilityResult {
  if (profile.versionConflicts.length > 0) {
    return result(profile, 'unknown', 'unknown');
  }
  const override = webViewCapabilityFor(capability, profile.runtimeVersion.major);
  if (!override) return result(profile, 'unknown', 'unknown');
  return {
    ...result(profile, override.status, 'webview-override'),
    source: override.source,
    conditions: override.conditions,
    caveat: override.notes,
  };
}

function result(
  profile: AndroidWebViewProfile,
  status: RuntimeCompatibilityResult['status'],
  provenance: RuntimeCompatibilityResult['provenance'],
): RuntimeCompatibilityResult {
  return {
    status,
    provenance,
    runtime: profile.runtime,
    runtimeVersion: { ...profile.runtimeVersion },
    renderingEngine: profile.renderingEngine,
    engineVersion: { ...profile.engineVersion },
    caveat: BASELINE_CAVEAT,
  };
}

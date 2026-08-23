import type {
  AndroidWebViewProfile,
  NormalizedRuntimeVersion,
  RuntimeDetectionConfidence,
  RuntimeDetectionEvidence,
} from './types.js';
import { normalizeRuntimeVersion, resolveRuntimeVersion } from './version.js';

export interface AndroidWebViewDetection {
  isAndroidWebView: boolean;
  confidence: RuntimeDetectionConfidence;
  evidence: RuntimeDetectionEvidence[];
  version: NormalizedRuntimeVersion;
  userAgent: string;
  warnings: string[];
}

export interface AndroidWebViewProfileInput {
  userAgent?: string;
  nativePackageVersion?: string;
  clientHintsVersion?: string;
  explicitVersion?: string;
}

const UNKNOWN_VERSION: NormalizedRuntimeVersion = {
  raw: null,
  major: null,
  precision: 'unknown',
  source: 'unknown',
};

/**
 * Identify canonical/default-like Android WebView User-Agents.
 *
 * This is evidence-based detection, not authoritative runtime attestation: an
 * embedding app can replace its User-Agent and any client can spoof these tokens.
 */
export function detectAndroidWebView(userAgent: string): AndroidWebViewDetection {
  const android = /(?:^|[ (;])Android(?:[ /;)])/i.test(userAgent);
  const wv = /(?:^|[ (;])wv(?:[ ;)])/i.test(userAgent);
  const chrome = userAgent.match(/(?:^|[ (;])Chrome\/(\d+(?:\.\d+){0,3})(?=$|[ ;)]|Mobile\b|Safari\b)/i);
  const version4Index = userAgent.search(/Version\/4\.0/i);
  const chromeIndex = chrome?.index ?? -1;
  const version4 = version4Index >= 0 && chromeIndex >= 0 && version4Index < chromeIndex;

  if (!android || (!wv && !(version4 && chrome))) {
    return {
      isAndroidWebView: false,
      confidence: 'unknown',
      evidence: [],
      version: { ...UNKNOWN_VERSION },
      userAgent,
      warnings: [],
    };
  }

  const evidence: RuntimeDetectionEvidence[] = ['android-platform'];
  if (wv) evidence.push('wv-marker');
  if (version4) evidence.push('version-4-marker');
  if (chrome) evidence.push('chrome-version');

  const raw = chrome?.[1] ?? null;
  const normalized = normalizeRuntimeVersion(raw, raw === null ? 'unknown' : 'user-agent');
  const reduced = raw !== null && /^\d+\.0\.0\.0$/.test(raw);
  const version: NormalizedRuntimeVersion = reduced && normalized.major !== null
    ? { ...normalized, precision: 'major' }
    : normalized;

  const warnings: string[] = [
    'User-Agent detection can be spoofed or hidden by an embedding app with a custom User-Agent.',
  ];
  if (!chrome) warnings.push('Android WebView was identified from markers, but no valid Chromium version was exposed.');

  return {
    isAndroidWebView: true,
    confidence: chrome ? (wv ? 'high' : 'medium') : 'low',
    evidence,
    version,
    userAgent,
    warnings,
  };
}

/** Build a runtime profile from caller-supplied UA/native/explicit evidence. */
export function createAndroidWebViewProfile(input: AndroidWebViewProfileInput): AndroidWebViewProfile {
  const detection = input.userAgent ? detectAndroidWebView(input.userAgent) : null;
  const hasNonUaEvidence = Boolean(
    input.nativePackageVersion ?? input.clientHintsVersion ?? input.explicitVersion,
  );
  if (detection && !detection.isAndroidWebView && !hasNonUaEvidence) {
    throw new Error('The supplied User-Agent is not identifiable as Android WebView.');
  }

  const resolved = resolveRuntimeVersion({
    nativePackageVersion: input.nativePackageVersion,
    clientHintsVersion: input.clientHintsVersion,
    explicitVersion: input.explicitVersion,
    userAgentVersion: detection?.isAndroidWebView ? detection.version.raw ?? undefined : undefined,
  });
  const selected = resolved.version;
  const explicitLegacyAndroid44 = selected.source === 'explicit' && selected.raw === '4.4';
  const chromiumVersion: NormalizedRuntimeVersion = explicitLegacyAndroid44
    ? normalizeRuntimeVersion(null, 'unknown')
    : { ...selected };
  const engineVersion = chromiumVersion.major === null
    ? normalizeRuntimeVersion(null, 'unknown')
    : normalizeRuntimeVersion(String(chromiumVersion.major), 'derived');
  const legacyAndroid44 = Boolean(
    detection?.isAndroidWebView &&
    selected.source === 'user-agent' &&
    input.userAgent &&
    /(?:^|[ (;])Android 4\.4(?:\.\d+)?(?:[ ;)]|$)/i.test(input.userAgent),
  );
  const runtimeVersion = legacyAndroid44 || explicitLegacyAndroid44
    ? { raw: '4.4', major: null, precision: 'partial', source: 'derived' } as const
    : { ...selected };
  const warnings = [
    ...(detection?.warnings ?? []),
    ...resolved.warnings,
    ...resolved.conflicts,
  ];
  if (!detection?.isAndroidWebView) {
    warnings.push('Android WebView was not identified from a User-Agent; runtime identity is caller-supplied.');
  }
  if (legacyAndroid44 || explicitLegacyAndroid44) {
    warnings.push('Legacy Android 4.4 WebView uses an Android release label; Chromium/Blink milestone numbering is reported separately.');
  }

  return {
    runtime: 'android-webview',
    renderingEngine: 'blink',
    detectionConfidence: detection?.isAndroidWebView ? detection.confidence : 'unknown',
    evidence: detection?.isAndroidWebView ? detection.evidence : [],
    runtimeVersion,
    chromiumVersion,
    engineVersion,
    versionConflicts: resolved.conflictingVersions.map((version) => ({ ...version })),
    warnings,
  };
}

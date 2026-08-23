import type {
  NormalizedRuntimeVersion,
  RuntimeVersionSource,
} from './types.js';

export interface RuntimeVersionEvidence {
  nativePackageVersion?: string;
  clientHintsVersion?: string;
  explicitVersion?: string;
  userAgentVersion?: string;
}

export interface ResolvedRuntimeVersion {
  version: NormalizedRuntimeVersion;
  conflicts: string[];
  conflictingVersions: NormalizedRuntimeVersion[];
  hasConflicts: boolean;
  warnings: string[];
}

export function normalizeRuntimeVersion(
  value: string | null | undefined,
  source: RuntimeVersionSource,
): NormalizedRuntimeVersion {
  const raw = value === undefined || value === null || value === '' ? value || null : value;
  if (!value || !/^\d+(?:\.\d+){0,3}$/.test(value)) {
    return { raw, major: null, precision: 'unknown', source };
  }
  const components = value.split('.');
  const major = Number(components[0]);
  if (!Number.isSafeInteger(major)) {
    return { raw, major: null, precision: 'unknown', source };
  }
  return {
    raw,
    major,
    precision: components.length === 1 ? 'major' : components.length === 4 ? 'full' : 'partial',
    source,
  };
}

export function resolveRuntimeVersion(evidence: RuntimeVersionEvidence): ResolvedRuntimeVersion {
  const candidates: { source: RuntimeVersionSource; raw: string | undefined }[] = [
    { source: 'native-package', raw: evidence.nativePackageVersion },
    { source: 'client-hints', raw: evidence.clientHintsVersion },
    { source: 'explicit', raw: evidence.explicitVersion },
    { source: 'user-agent', raw: evidence.userAgentVersion },
  ];
  const warnings: string[] = [];
  const valid: NormalizedRuntimeVersion[] = [];
  for (const candidate of candidates) {
    if (candidate.raw === undefined) continue;
    const normalized = normalizeRuntimeVersion(candidate.raw, candidate.source);
    if (normalized.major === null) {
      warnings.push(`Ignored invalid ${candidate.source} version "${candidate.raw}".`);
    } else {
      valid.push(normalized);
    }
  }
  const version = valid[0] ?? normalizeRuntimeVersion(null, 'unknown');
  const conflicts = valid.slice(1)
    .filter((candidate) => candidate.raw !== version.raw)
    .map((candidate) =>
      `${version.source} version ${version.raw} conflicts with ${candidate.source} version ${candidate.raw}.`,
    );
  const conflictingVersions = valid.slice(1).filter(
    (candidate) => candidate.major !== version.major,
  );
  return {
    version,
    conflicts,
    conflictingVersions,
    hasConflicts: conflictingVersions.length > 0,
    warnings,
  };
}

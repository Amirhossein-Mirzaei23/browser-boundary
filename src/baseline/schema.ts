import type {
  BaselineEngineEntry,
  BoundaryBaseline,
  NormalizedScanScope,
} from './types.js';
import type { EngineName, VersionType } from '../reporting/types.js';

/**
 * Runtime validation for boundary baselines — explicit TypeScript guards with
 * actionable diagnostics, no schema dependency. Schema version 1 only (YAGNI).
 *
 * Forward-compatibility policy: STRICT at the top level. Unknown top-level
 * fields are rejected so a future schema change is never silently reinterpreted
 * by an older consumer; newer minor additions bump the schema version.
 */
export const BASELINE_SCHEMA_VERSION = 1;

const ENGINE_NAMES: EngineName[] = ['chromium', 'firefox', 'webkit'];
const VERSION_TYPES: VersionType[] = ['real-major', 'playwright-revision'];
const CHECK_KEYS = ['navigation', 'javascript', 'console', 'network', 'rendering', 'readiness'] as const;
const SCOPE_KEYS = [
  'routes', 'checks', 'engines', 'controllerPolicy', 'minConfidence', 'floors',
  'ignoredPatterns', 'criticalResourceTypes', 'timeoutMs', 'waitUntil', 'viewport', 'nonPortable',
] as const;
const TOP_LEVEL_KEYS = [
  'schemaVersion', 'createdAt', 'application', 'packageVersion', 'configFingerprint', 'scope', 'engines',
] as const;
const ENGINE_KEYS = [
  'engine', 'versionType', 'oldestVerifiedPassing', 'firstVerifiedFailing', 'failureReason',
  'testedVersions', 'inconclusiveVersions', 'browserSource', 'controller', 'os', 'arch', 'identity',
] as const;

/** WebKit is reported in the playwright-revision domain, never as a real major. */
function versionDomainOk(engine: EngineName, versionType: VersionType): boolean {
  if (engine === 'webkit') return versionType === 'playwright-revision';
  return versionType === 'real-major';
}

export type BaselineValidation =
  | { ok: true; baseline: BoundaryBaseline }
  | { ok: false; errors: string[] };

export function validateBaseline(value: unknown): BaselineValidation {
  const errors: string[] = [];
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { ok: false, errors: ['baseline must be a JSON object'] };
  }
  const v = value as Record<string, unknown>;

  for (const key of Object.keys(v)) {
    if (!(TOP_LEVEL_KEYS as readonly string[]).includes(key)) {
      errors.push(`unknown field "${key}" (strict schema ${BASELINE_SCHEMA_VERSION}; fields are fixed per schema version)`);
    }
  }

  if (v.schemaVersion !== BASELINE_SCHEMA_VERSION) {
    errors.push(
      `unsupported schemaVersion ${JSON.stringify(v.schemaVersion)}; this package reads baseline schema version ${BASELINE_SCHEMA_VERSION} only`,
    );
  }
  if (typeof v.createdAt !== 'string' || Number.isNaN(Date.parse(v.createdAt))) {
    errors.push('createdAt must be an ISO-8601 timestamp string');
  }
  if (typeof v.packageVersion !== 'string' || !v.packageVersion) {
    errors.push('packageVersion must be a non-empty string');
  }
  if (typeof v.configFingerprint !== 'string' || !/^[0-9a-f]{64}$/.test(v.configFingerprint)) {
    errors.push('configFingerprint must be a 64-character sha256 hex digest');
  }
  if (v.application !== undefined) {
    const app = v.application as Record<string, unknown> | null;
    if (typeof app !== 'object' || app === null || Array.isArray(app)) {
      errors.push('application must be an object with optional id/revision strings');
    } else {
      for (const key of Object.keys(app)) {
        if (key !== 'id' && key !== 'revision') errors.push(`application has unknown field "${key}"`);
        else if (typeof app[key] !== 'string') errors.push(`application.${key} must be a string`);
      }
    }
  }

  const scope = validateScope(v.scope, errors);
  validateEngines(v.engines, errors);

  if (errors.length) return { ok: false, errors };
  return { ok: true, baseline: v as unknown as BoundaryBaseline };

  function validateScope(scope: unknown, errs: string[]): NormalizedScanScope | null {
    if (typeof scope !== 'object' || scope === null || Array.isArray(scope)) {
      errs.push('scope must be a NormalizedScanScope object');
      return null;
    }
    const s = scope as Record<string, unknown>;
    for (const key of Object.keys(s)) {
      if (!(SCOPE_KEYS as readonly string[]).includes(key)) errs.push(`scope has unknown field "${key}"`);
    }
    for (const key of SCOPE_KEYS) {
      if (!(key in s)) errs.push(`scope.${key} is required`);
    }
    if (errs.some((e) => e.startsWith('scope.'))) return null;
    if (!Array.isArray(s.routes) || s.routes.length === 0) errs.push('scope.routes must be a non-empty array');
    if (!Array.isArray(s.engines) || !s.engines.every((e) => ENGINE_NAMES.includes(e as EngineName))) {
      errs.push('scope.engines must only contain chromium, firefox, webkit');
    }
    return s as unknown as NormalizedScanScope;
  }

  function validateEngines(engines: unknown, errs: string[]): void {
    if (!Array.isArray(engines) || engines.length === 0) {
      errs.push('engines must be a non-empty array of BaselineEngineEntry');
      return;
    }
    const seen = new Set<string>();
    for (const [i, entry] of (engines as unknown[]).entries()) {
      if (typeof entry !== 'object' || entry === null) {
        errs.push(`engines[${i}] must be an object`);
        continue;
      }
      const e = entry as Record<string, unknown>;
      for (const key of Object.keys(e)) {
        if (!(ENGINE_KEYS as readonly string[]).includes(key)) errs.push(`engines[${i}] has unknown field "${key}"`);
      }
      for (const key of ENGINE_KEYS) {
        if (!(key in e)) errs.push(`engines[${i}].${key} is required`);
      }
      const engine = e.engine as EngineName;
      if (!ENGINE_NAMES.includes(engine)) errs.push(`engines[${i}].engine "${String(e.engine)}" is not a valid engine`);
      if (seen.has(engine)) errs.push(`duplicate engine entry "${engine}"; a baseline records one accepted entry per engine`);
      seen.add(engine);
      const vt = e.versionType as VersionType;
      if (!VERSION_TYPES.includes(vt)) {
        errs.push(`engines[${i}].versionType must be real-major or playwright-revision`);
      } else if (ENGINE_NAMES.includes(engine) && !versionDomainOk(engine, vt)) {
        errs.push(`engines[${i}]: engine "${engine}" must use versionType "${engine === 'webkit' ? 'playwright-revision' : 'real-major'}" (WebKit is never a real Safari major)`);
      }
      if (e.controller !== 'playwright' && e.controller !== 'webdriver') {
        errs.push(`engines[${i}].controller must be playwright or webdriver`);
      }
      const id = e.identity as Record<string, unknown> | undefined;
      if (typeof id !== 'object' || id === null || typeof id.verified !== 'boolean') {
        errs.push(`engines[${i}].identity.verified must be a boolean`);
      }
      for (const key of ['os', 'arch', 'browserSource'] as const) {
        if (typeof e[key] !== 'string') errs.push(`engines[${i}].${key} must be a string`);
      }
      for (const key of ['testedVersions', 'inconclusiveVersions'] as const) {
        if (!Array.isArray(e[key])) errs.push(`engines[${i}].${key} must be an array`);
      }
    }
  }
}

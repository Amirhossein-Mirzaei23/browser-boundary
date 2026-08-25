export type {
  ComparisonState,
  NormalizedReadiness,
  NormalizedRoute,
  NormalizedScanScope,
  BaselineIdentityEvidence,
  BaselineEngineEntry,
  BoundaryBaseline,
} from './types.js';
export { validateBaseline, BASELINE_SCHEMA_VERSION, type BaselineValidation } from './schema.js';
export { normalizeScanScope, scopeFingerprint, canonicalize } from './normalize.js';
export { createBaseline, BaselineCreationError, type BaselineMetadata } from './create.js';
export { readBaseline, writeBaseline, type WriteBaselineOptions } from './io.js';
export {
  compareScanToBaseline,
  type EngineComparison,
  type ScanComparison,
  type ComparisonWarning,
  type ComparisonEvidenceRef,
} from './compare.js';

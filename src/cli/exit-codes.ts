/**
 * Canonical CLI exit codes. Centralized so the scan, compare, and regression
 * gate commands share one documented contract.
 *
 * Regression gate: in explicit `--gate` mode a verified regression reuses the
 * compatibility-failure code 1 (backward compatible — CI already treats 1 as
 * "verified compatibility failure"). Outside gate mode, compare always exits 0
 * unless the input is malformed (2); a reported regression does not change
 * existing scan semantics.
 */
export const EXIT = {
  OK: 0,
  /** Verified compatibility failure — including an opt-in regression-gate failure. */
  COMPAT_FAIL: 1,
  CONFIG_ERROR: 2,
  INFRA_ERROR: 3,
} as const;

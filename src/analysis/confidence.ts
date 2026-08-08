import type { Confidence } from '../reporting/types.js';

/** Confidence ranking for threshold comparison. */
export const CONFIDENCE_RANK: Record<Confidence, number> = {
  high: 4,
  medium: 3,
  low: 2,
  unknown: 1,
};

/** True if `actual` meets or exceeds the configured `threshold`. */
export function meetsThreshold(actual: Confidence, threshold: Confidence): boolean {
  return CONFIDENCE_RANK[actual] >= CONFIDENCE_RANK[threshold];
}

import type { Confidence, EngineName, Verdict } from '../reporting/types.js';

/**
 * Generic version-search strategy. It knows nothing about specific engines or
 * websites — it takes a list of versions (descending) and a `test(version)`
 * function, and finds the verified boundary.
 *
 * Honesty contract: results describe what was VERIFIED, never extrapolated.
 * The caller may NOT claim "all versions below X are unsupported" — only that
 * X itself was observed failing and X+1 was observed passing.
 */

export interface SearchOutcome {
  tested: string[];
  oldestVerifiedPassing: string | null;
  firstVerifiedFailing: string | null;
  inconclusive: string[];
  skipped: string[];
  /** Confidence in the boundary (binary search → 'high'; single probe → 'low'). */
  boundaryConfidence: Confidence;
}

export interface VersionSearchOptions {
  /** Descending list of version strings to consider (e.g. ["124","123",...]). */
  versions: string[];
  /** Test one version → verdict. */
  test: (version: string) => Promise<Verdict>;
  /** 'binary' | 'step-down' | 'latest' | 'explicit'. */
  strategy: 'binary' | 'step-down' | 'latest' | 'explicit';
  stepSize?: number;
}

export async function searchBoundary(opts: VersionSearchOptions): Promise<SearchOutcome> {
  const { versions, test, strategy } = opts;
  const descending = [...versions].sort((a, b) => Number(b) - Number(a));
  if (descending.length === 0) {
    return emptyOutcome();
  }

  const verdicts = new Map<string, Verdict>();
  const inconclusive: string[] = [];
  const run = async (v: string): Promise<Verdict> => {
    if (verdicts.has(v)) return verdicts.get(v)!;
    const r = await test(v);
    verdicts.set(v, r);
    if (r === 'inconclusive' || r === 'error') inconclusive.push(v);
    return r;
  };

  if (strategy === 'latest') {
    const v = descending[0];
    await run(v);
    return summarize(verdicts, descending, inconclusive, 'low');
  }

  if (strategy === 'explicit') {
    for (const v of descending) await run(v);
    return summarize(verdicts, descending, inconclusive, 'medium');
  }

  // step-down + binary share the step phase.
  const step = opts.stepSize ?? 10;

  // 1. latest first (index 0 == newest). Stepping forward == going older.
  await run(descending[0]);

  // 2. step down (forward in the descending list) until a fail.
  //    newestPassIdx = index of the OLDEST version confirmed passing so far
  //                    (initially the newest, since descending[0] was tested pass-or-otherwise).
  //    newestFailIdx = index of the NEWEST version confirmed failing
  let newestPassIdx = 0; // we'll refine below
  let newestFailIdx = -1;
  // Confirm the latest actually passed before treating it as the pass anchor.
  if (verdicts.get(descending[0]) !== 'pass') {
    newestPassIdx = -1; // latest itself didn't pass; no pass anchor yet
  }
  for (let i = step; i < descending.length; i += step) {
    const r = await run(descending[i]);
    if (r === 'fail') {
      newestFailIdx = i;
      break;
    }
    if (r === 'pass') newestPassIdx = i;
    // inconclusive/error: keep stepping without claiming a pass
  }

  let confidence: Confidence = 'medium';
  if (newestFailIdx !== -1) {
    // 3. binary search the gap. In the descending list, index 0 = newest and
    //    higher index = older. So a PASS anchor is at a LOWER index (newer)
    //    than a FAIL of an older version: newestPassIdx < newestFailIdx.
    //    The unknown boundary lives at indices in (newestPassIdx, newestFailIdx).
    if (strategy === 'binary' && newestPassIdx !== -1 && newestFailIdx > newestPassIdx) {
      let lo = newestPassIdx; // newest pass (lower index)
      let hi = newestFailIdx; // newest fail (higher index)
      while (hi - lo > 1) {
        const mid = Math.floor((lo + hi) / 2);
        if (mid === lo || mid === hi) break;
        const r = await run(descending[mid]);
        if (r === 'pass') lo = mid; // mid passes → pass anchor moves older
        else if (r === 'fail') hi = mid; // mid fails → fail anchor moves newer
        else hi = mid; // inconclusive: shrink conservatively toward fail side
      }
      // After convergence: lo = index of the OLDEST verified PASS,
      //                    hi = index of the NEWEST verified FAIL.
      newestPassIdx = lo;
      newestFailIdx = hi;
      confidence = 'high';
    } else if (strategy === 'binary') {
      // No usable pass anchor (e.g. latest itself failed, or nothing older
      // passed in the step phase). Confidence stays lower.
      confidence = 'medium';
    }
  } else {
    // never found a fail within the searched range
    newestPassIdx = descending.length - 1;
    confidence = 'low';
  }

  const lastPassIdx = newestPassIdx; // index of oldest verified pass (-1 if none)
  const firstFailIdx = newestFailIdx; // index of newest verified fail (-1 if none)

  return summarize(verdicts, descending, inconclusive, confidence, lastPassIdx, firstFailIdx);
}

function emptyOutcome(): SearchOutcome {
  return {
    tested: [],
    oldestVerifiedPassing: null,
    firstVerifiedFailing: null,
    inconclusive: [],
    skipped: [],
    boundaryConfidence: 'unknown',
  };
}

function summarize(
  verdicts: Map<string, Verdict>,
  descending: string[],
  inconclusive: string[],
  boundaryConfidence: Confidence,
  lastPassIdx?: number,
  firstFailIdx?: number,
): SearchOutcome {
  const tested = descending.filter((v) => verdicts.has(v));
  const skipped = descending.filter((v) => !verdicts.has(v));

  let oldestPass: string | null = null;
  let firstFail: string | null = null;

  if (lastPassIdx !== undefined && firstFailIdx !== undefined) {
    oldestPass = descending[lastPassIdx] ?? null;
    firstFail = descending[firstFailIdx] ?? null;
  } else {
    // derive from verdicts
    const passIdx = descending.filter((v) => verdicts.get(v) === 'pass');
    const failIdx = descending.filter((v) => verdicts.get(v) === 'fail');
    oldestPass = passIdx.length ? passIdx[passIdx.length - 1] : null;
    firstFail = failIdx.length ? failIdx[0] : null;
  }

  return {
    tested,
    oldestVerifiedPassing: oldestPass,
    firstVerifiedFailing: firstFail,
    inconclusive,
    skipped,
    boundaryConfidence,
  };
}

/** Build a descending integer version list from [floor .. latest]. */
export function versionRange(latest: number, floor: number): string[] {
  const out: string[] = [];
  for (let v = latest; v >= floor; v--) out.push(String(v));
  return out;
}

export type { EngineName };

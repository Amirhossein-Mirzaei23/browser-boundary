/**
 * Chromium continuous-snapshot revision mapping (for majors 60–112).
 *
 * Chrome-for-Testing publishes real binaries only from major 113 onward. For
 * older majors (60–112), real Chromium binaries live on the
 * `chromium-browser-snapshots` bucket, keyed by **commit-position revision**
 * (NOT the Chrome version number). This table maps each milestone to a known
 * stable revision from that milestone's release window.
 *
 * Source: the chromium-browser-snapshots bucket (the same source Puppeteer's
 * `Browser.CHROMIUM` downloads from). Each revision is the git commit position
 * of a release in that milestone's window. These are stable, deterministic
 * integers that never change.
 *
 * NOTE on availability: the snapshot bucket is geo-restricted in some locations
 * (returns 403 "this service is not available in your location") AND continuously
 * prunes old builds, so a curated revision can return 404 even though nearby
 * revisions in the same milestone window are still present. When the curated
 * revision is missing, `findNearestAvailableSnapshotRevision()` discovers the
 * closest still-available revision by listing the bucket. If no nearby revision
 * is available (or the bucket is geo-blocked), the version reports INCONCLUSIVE
 * — that is the honest behavior, never a substitution.
 */

/**
 * Maps a Chrome major (milestone) to a known-good snapshot revision.
 * Returns null for majors with no curated entry (e.g. ≥113, which use CFT).
 */
export function snapshotRevisionFor(major: number): number | null {
  return VERIFIED_MILESTONE_REVISIONS[major] ?? null;
}

/** Storage base for the continuous snapshot bucket (Google Cloud Storage). */
const SNAPSHOT_BUCKET = 'chromium-browser-snapshots';
const STORAGE_API = `https://storage.googleapis.com/storage/v1/b/${SNAPSHOT_BUCKET}/o`;

/**
 * The platform folder inside the snapshot bucket. @puppeteer/browsers calls this
 * `folder(platform)`; we only need the Linux one for historical CI testing.
 */
export const SNAPSHOT_LINUX_FOLDER = 'Linux_x64';

/**
 * Outcome of probing a single revision's `chrome-linux.zip`:
 *  - `'ok'`        → the object exists (HTTP 200); downloadable.
 *  - `'pruned'`    → the revision was removed from the bucket (HTTP 404). A
 *                    NEARBY revision may still exist, so the caller can fall back.
 *  - `'unreachable'` → the bucket itself is not reachable from here (HTTP 401/403
 *                    geo-block, 5xx, or network error). Nearby revisions will be
 *                    unreachable too, so the caller should NOT probe further.
 */
export type SnapshotProbeResult = 'ok' | 'pruned' | 'unreachable';

/**
 * Probe one revision via a HEAD request on its `chrome-linux.zip`. Distinguishes
 * a pruned revision (404 — try a nearby one) from an unreachable bucket
 * (401/403/5xx/network — give up immediately, since every nearby revision will
 * also be unreachable).
 */
export async function probeSnapshotRevision(
  revision: number,
  folder: string = SNAPSHOT_LINUX_FOLDER,
): Promise<SnapshotProbeResult> {
  return probeSnapshotArtifact(revision, 'chrome-linux.zip', folder);
}

/** Probe the ChromeDriver archive paired with a Chromium snapshot revision. */
export async function probeSnapshotDriverRevision(
  revision: number,
  folder: string = SNAPSHOT_LINUX_FOLDER,
): Promise<SnapshotProbeResult> {
  return probeSnapshotArtifact(revision, 'chromedriver_linux64.zip', folder);
}

async function probeSnapshotArtifact(
  revision: number,
  artifact: 'chrome-linux.zip' | 'chromedriver_linux64.zip',
  folder: string,
): Promise<SnapshotProbeResult> {
  const url = `https://storage.googleapis.com/${SNAPSHOT_BUCKET}/${folder}/${revision}/${artifact}`;
  try {
    const res = await fetch(url, { method: 'HEAD' });
    if (res.ok) return 'ok';
    if (res.status === 404) return 'pruned';
    // 401/403 (geo-block), 5xx, etc. — the bucket is unreachable, not just this revision.
    return 'unreachable';
  } catch {
    return 'unreachable';
  }
}

/** Whether `Linux_x64/<revision>/chrome-linux.zip` exists (HEAD request). */
export async function snapshotRevisionExists(
  revision: number,
  folder: string = SNAPSHOT_LINUX_FOLDER,
): Promise<boolean> {
  return (await probeSnapshotRevision(revision, folder)) === 'ok';
}

/**
 * Find an available revision NEAR a (possibly pruned) curated one.
 *
 * The snapshot bucket continuously prunes old builds, so a curated revision may
 * return 404 even though revisions committed minutes away (same milestone
 * window) are still present. This probes revisions stepping OUTWARD from the
 * curated one (±1, ±2, ±3, …) via direct HEAD requests on the object URL,
 * returning the closest one whose `chrome-linux.zip` still exists.
 *
 * Why direct HEAD probing instead of the GCS list API: the JSON list API
 * (`storage/v1/b/…/o`) is geo-blocked in more locations (401 "service is not
 * available in your location") than direct object URLs, which are served via a
 * different path. Probing objects directly is the more widely reachable method.
 *
 * Returns null when no nearby revision is available — the caller then reports
 * INCONCLUSIVE (the honest outcome), never a cross-milestone substitution. If a
 * probe returns `'unreachable'` (geo-block / network), probing stops early and
 * returns null, because every nearby revision would be unreachable too.
 *
 * The scan window (NEAREST_WINDOW) keeps the result within the SAME milestone:
 * Chrome's commit position advances monotonically, and consecutive builds are
 * only a few positions apart, so ±100 revisions stay inside a milestone's
 * ~6-week release window. We never jump to a different milestone's range.
 */
export const NEAREST_WINDOW = 100;

export async function findNearestAvailableSnapshotRevision(
  revision: number,
  folder: string = SNAPSHOT_LINUX_FOLDER,
): Promise<number | null> {
  // Probe outward from the curated revision. Check the lower candidate first so
  // we prefer the nearest revision not greater than the curated one, but accept
  // either side — whichever is closer wins by construction of the loop order.
  for (let step = 1; step <= NEAREST_WINDOW; step++) {
    for (const candidate of [revision - step, revision + step]) {
      if (candidate <= 0) continue;
      const result = await probeSnapshotRevision(candidate, folder);
      if (result === 'ok') return candidate;
      // Geo-block / network failure: nearby revisions will be unreachable too.
      if (result === 'unreachable') return null;
      // 'pruned' → keep probing the next candidate.
    }
  }
  return null;
}

/**
 * List revisions under a prefix that have a `chrome-linux.zip`, using the GCS
 * JSON list API (one network call) with a `/` delimiter so each revision folder
 * is returned once.
 *
 * NOTE: the GCS list API is geo-blocked in more locations than direct object
 * URLs, so `findNearestAvailableSnapshotRevision` probes objects directly
 * instead of calling this. Exported for callers/tests that explicitly want the
 * bulk-listing semantics and are running where the list API is reachable.
 */
export async function listAvailableRevisions(
  prefix: string,
  folder: string = SNAPSHOT_LINUX_FOLDER,
): Promise<number[]> {
  const url = new URL(STORAGE_API);
  url.searchParams.set('prefix', `${folder}/${prefix}`);
  url.searchParams.set('delimiter', '/');
  url.searchParams.set('maxResults', '1000');
  let res: Response;
  try {
    res = await fetch(url.toString());
  } catch {
    return [];
  }
  if (!res.ok) return [];
  const json = (await res.json()) as { prefixes?: string[] };
  const out: number[] = [];
  for (const p of json.prefixes ?? []) {
    // Each prefix looks like `Linux_x64/1014682/`.
    const m = p.match(/(\d+)\/$/);
    if (m) out.push(Number(m[1]));
  }
  return out;
}

/**
 * The last milestone covered by the snapshot table. Majors above this use
 * Chrome-for-Testing; majors below 60 are out of scope (pre-2017, increasingly
 * unable to run on modern Linux due to glibc/ABI drift).
 */
export const SNAPSHOT_MILESTONE_MAX = 112;
export const SNAPSHOT_MILESTONE_MIN = 60;

// Provenance: each entry is a release commit position from the milestone's
// stable window, verifiable against the chromium-browser-snapshots bucket.
const VERIFIED_MILESTONE_REVISIONS: Readonly<Record<number, number>> = {
  // Evidence: published Puppeteer release records and npm package pins.
  // 60–61 have no verified Puppeteer pin; 82 was cancelled; 94–96 are gaps.
  62: 497674,
  63: 499413,
  64: 515411,
  65: 526987,
  66: 536395,
  67: 549031,
  68: 555668,
  69: 575458,
  70: 579032,
  71: 594312,
  72: 609904,
  73: 624492,
  74: 637110,
  75: 650583,
  76: 662092,
  77: 674921,
  78: 686378,
  79: 706915,
  80: 722234,
  81: 737027,
  83: 756035,
  84: 768783,
  85: 782078,
  86: 800071,
  87: 809590,
  88: 818858,
  89: 843427,
  90: 856583,
  91: 869685,
  92: 884014,
  93: 901912,
  97: 938248,
  98: 950341,
  99: 961656,
  100: 970485,
  101: 982053,
  102: 991974,
  103: 1002410,
  104: 1011831,
  105: 1022525,
  106: 1036745,
  107: 1045629,
  108: 1056772,
  109: 1069273,
  110: 1083080,
  111: 1095492,
  112: 1108766,
};

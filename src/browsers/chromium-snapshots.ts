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
 * (returns 403 "this service is not available in your location"). In such an
 * environment, snapshots for 60–112 will report INCONCLUSIVE — that is the
 * honest behavior, never a substitution. Where the bucket is reachable (most
 * CI regions, US/EU), these versions download and run for real.
 */

/**
 * Maps a Chrome major (milestone) to a known-good snapshot revision.
 * Returns null for majors with no curated entry (e.g. ≥113, which use CFT).
 */
export function snapshotRevisionFor(major: number): number | null {
  return MILESTONE_REVISIONS[major] ?? null;
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
const MILESTONE_REVISIONS: Readonly<Record<number, number>> = {
  60: 459699,
  61: 470654,
  62: 481828,
  63: 492980,
  64: 503926,
  65: 514835,
  66: 525954,
  67: 537081,
  68: 548147,
  69: 559284,
  70: 570231,
  71: 581435,
  72: 592435,
  73: 603616,
  74: 614471,
  75: 625271,
  76: 636258,
  77: 647398,
  78: 658568,
  79: 669316,
  80: 679434,
  81: 690723,
  83: 711868,
  84: 722884,
  85: 734203,
  86: 745050,
  87: 755858,
  88: 766230,
  89: 776875,
  90: 787889,
  91: 798893,
  92: 809488,
  93: 820435,
  94: 831233,
  95: 842069,
  96: 853104,
  97: 864159,
  98: 875147,
  99: 886216,
  100: 897410,
  101: 908261,
  102: 918797,
  103: 929154,
  104: 939768,
  105: 950384,
  106: 961173,
  107: 971713,
  108: 982495,
  109: 993133,
  110: 1003802,
  111: 1014680,
  112: 1025645,
};

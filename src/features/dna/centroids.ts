/**
 * DNA V3 — the 20 archetype centroids + weighted-distance election (M1).
 *
 * Each archetype is a CENTROID: a target profile over the 14-axis user vector
 * (axes.ts, everything in [0,1] percentile space) plus a per-axis weight mask.
 * Only an archetype's SIGNATURE axes carry weight — a centroid does not fight
 * over axes it doesn't care about, which is what makes balance a placement
 * property instead of an emergent accident of 20 interacting scorers
 * (FEATURE_ARCHETYPES_V2.md).
 *
 * Election = weighted-RMS-distance argmin. margin = d(runnerUp) − d(best).
 * Below V3_LEAN_MARGIN the reveal renders "X with a Y lean" via the existing
 * livingArchetype plumbing (challenger + leaning on DnaArchetype).
 *
 * Percentile-space calibration notes (baked from the real catalog norms —
 * see axisNorms.ts + the M1 replay fixture):
 *   - Zero-signal accord axes land at their tied-block MIDPOINT, not 0:
 *     darkness ≈ 0.43, spice ≈ 0.33, greenness ≈ 0.30, florality ≈ 0.23,
 *     sweetness ≈ 0.32. "High" targets must clear those floors.
 *   - adventurousness is nearly constant (~0) for picker-pool picks — the pool
 *     is all-popular by design — so no centroid may DEPEND on it to fire.
 *     It stays lightly weighted only where it genuinely separates (search
 *     picks, M4+).
 *   - breadth/loyalty are evidence-damped to 0.5 for 1-pick users.
 *
 * Centroid placement/weights are TUNED against the replay + simulation gates
 * (M1/M2 CI); tune placements, never the gate thresholds.
 */

import type { DnaAxis } from './axisNorms';
import type { ArchetypeKey } from './types';
import type { UserAxisVector } from './axes';
import type { ArchetypeScore } from './archetype';

/** The 20 electable V3 keys — crowd_pleaser (retired) and rebel (legacy scorer only) excluded. */
export const V3_ARCHETYPE_KEYS = [
  'the_executive',
  'the_seducer',
  'the_connoisseur',
  'the_signature_wearer',
  'the_purist',
  'the_showstopper',
  'the_smart_shopper',
  'the_romantic',
  'the_explorer',
  'the_classicist',
  'the_gourmand',
  'the_minimalist',
  'the_naturalist',
  'the_trendsetter',
  'the_old_soul',
  'the_maximalist',
  'the_night_owl',
  'the_spice_trader',
  'the_daybreaker',
  'the_soft_focus',
] as const;

export type V3ArchetypeKey = (typeof V3_ARCHETYPE_KEYS)[number];

/** target `t` (where the archetype lives on the axis) + weight `w` (how much it cares). */
export type CentroidProfile = Partial<Record<DnaAxis, { t: number; w: number }>>;

/**
 * The roster. Signatures follow FEATURE_ARCHETYPES_V2.md; numbers are tuned
 * against the real replay fixture (31 prod streams) so the space tiles.
 */
export const CENTROIDS: Record<V3ArchetypeKey, CentroidProfile> = {
  // office+luxury, fresh/woody — polished, not loud, not dark
  the_executive: {
    warmth: { t: 0.45, w: 1 },
    luxury: { t: 0.8, w: 1 },
    presence: { t: 0.6, w: 0.6 },
    darkness: { t: 0.43, w: 0.7 },
    sweetness: { t: 0.45, w: 0.6 },
    spice: { t: 0.35, w: 0.5 },
    genderLean: { t: 0.3, w: 0.5 },
  },
  // REQUIRES warmth+darkness (not just outcome columns)
  the_seducer: {
    warmth: { t: 0.9, w: 1.2 },
    darkness: { t: 0.62, w: 1 },
    presence: { t: 0.85, w: 0.8 },
    sweetness: { t: 0.65, w: 0.5 },
  },
  // luxury + anti-popularity + breadth
  the_connoisseur: {
    luxury: { t: 0.92, w: 1.2 },
    breadth: { t: 0.75, w: 0.8 },
    darkness: { t: 0.62, w: 0.6 },
  },
  // loyalty↑ breadth↓
  the_signature_wearer: {
    loyalty: { t: 0.85, w: 1.2 },
    breadth: { t: 0.05, w: 1 },
  },
  // clean musk, presence↓
  the_purist: {
    presence: { t: 0.35, w: 1.2 },
    warmth: { t: 0.4, w: 0.7 },
    sweetness: { t: 0.35, w: 0.7 },
    darkness: { t: 0.43, w: 0.5 },
  },
  // presence top-decile
  the_showstopper: {
    presence: { t: 0.97, w: 1.4 },
    warmth: { t: 0.75, w: 0.5 },
    luxury: { t: 0.75, w: 0.4 },
  },
  // the value axis (dupe signal dropped — pool has zero dupes)
  the_smart_shopper: {
    value: { t: 0.75, w: 1.4 },
    luxury: { t: 0.3, w: 0.8 },
  },
  // florality soft
  the_romantic: {
    florality: { t: 0.75, w: 1.2 },
    genderLean: { t: 0.8, w: 0.7 },
    presence: { t: 0.6, w: 0.4 },
    darkness: { t: 0.43, w: 0.4 },
  },
  // breadth↑ adventurousness↑
  the_explorer: {
    breadth: { t: 1.0, w: 1.4 },
    loyalty: { t: 0.15, w: 0.6 },
  },
  // era↓ luxury↑ — heritage icons (price-anchored, vs Old Soul)
  the_classicist: {
    era: { t: 0.2, w: 1.2 },
    luxury: { t: 0.85, w: 1 },
    darkness: { t: 0.55, w: 0.4 },
  },
  // ── the 10 new ──
  // sweetness↑
  the_gourmand: {
    sweetness: { t: 0.95, w: 1.4 },
    warmth: { t: 0.6, w: 0.5 },
    presence: { t: 0.75, w: 0.4 },
  },
  // fresh + presence↓ + tight set
  the_minimalist: {
    warmth: { t: 0.3, w: 0.9 },
    presence: { t: 0.45, w: 1 },
    breadth: { t: 0.3, w: 0.6 },
    sweetness: { t: 0.4, w: 0.5 },
  },
  // greenness↑
  the_naturalist: {
    greenness: { t: 0.85, w: 1.4 },
    warmth: { t: 0.45, w: 0.5 },
    presence: { t: 0.55, w: 0.3 },
  },
  // era↑ 2020+ + popularity↑
  the_trendsetter: {
    era: { t: 0.85, w: 1.4 },
    presence: { t: 0.7, w: 0.5 },
    sweetness: { t: 0.65, w: 0.4 },
  },
  // era↓↓ any price — distinct from Classicist (price-anchored)
  the_old_soul: {
    era: { t: 0.05, w: 1.6 },
    luxury: { t: 0.5, w: 0.2 },
  },
  // presence↑ + breadth↑ + longevity↑
  the_maximalist: {
    presence: { t: 0.85, w: 1 },
    breadth: { t: 0.85, w: 1 },
    warmth: { t: 0.7, w: 0.4 },
  },
  // darkness↑ office-safe↓ — dark/smoky, vs Seducer's warm-sweet
  the_night_owl: {
    darkness: { t: 0.95, w: 1.4 },
    sweetness: { t: 0.5, w: 0.5 },
    warmth: { t: 0.5, w: 0.5 },
  },
  // spice↑
  the_spice_trader: {
    spice: { t: 0.92, w: 1.4 },
    warmth: { t: 0.8, w: 0.6 },
    greenness: { t: 0.55, w: 0.3 },
  },
  // citrus/aquatic morning-fresh
  the_daybreaker: {
    warmth: { t: 0.15, w: 1.4 },
    greenness: { t: 0.5, w: 0.5 },
    darkness: { t: 0.35, w: 0.4 },
    sweetness: { t: 0.35, w: 0.4 },
  },
  // powdery/musky skin-scent femme
  the_soft_focus: {
    florality: { t: 0.6, w: 0.9 },
    presence: { t: 0.45, w: 0.8 },
    genderLean: { t: 0.85, w: 0.9 },
    warmth: { t: 0.4, w: 0.4 },
  },
};

/**
 * Below this best-vs-runner-up distance gap the election is not decisive: the
 * reveal shows "X with a Y lean" (challenger + leaning on the archetype).
 */
export const V3_LEAN_MARGIN = 0.04;

/** Weighted RMS distance from a user vector to a centroid, in [0,1]. */
export function centroidDistance(axes: UserAxisVector, profile: CentroidProfile): number {
  let sum = 0;
  let wsum = 0;
  for (const [axis, spec] of Object.entries(profile) as [DnaAxis, { t: number; w: number }][]) {
    const d = axes[axis] - spec.t;
    sum += spec.w * d * d;
    wsum += spec.w;
  }
  return wsum > 0 ? Math.sqrt(sum / wsum) : 1;
}

export interface V3Election {
  /** Strongest-first, score = 1 − weighted distance (compatible with ArchetypeScore). */
  ranked: ArchetypeScore[];
  primary: V3ArchetypeKey;
  runnerUp: V3ArchetypeKey;
  /** distance gap d(runnerUp) − d(best), ≥ 0. */
  margin: number;
  /** margin < V3_LEAN_MARGIN → surface "primary with a runnerUp lean". */
  lean: boolean;
}

/**
 * Elect the V3 archetype: rank all 20 centroids by weighted distance
 * (ascending). Ties resolve deterministically by roster order. Scores are
 * exposed as 1 − distance so the existing livingArchetype lean/swap plumbing
 * (ratio-based, positive-score) consumes them unchanged.
 */
export function electArchetype(axes: UserAxisVector): V3Election {
  const scored = V3_ARCHETYPE_KEYS.map((key, i) => ({
    key: key as ArchetypeKey,
    d: centroidDistance(axes, CENTROIDS[key]),
    i,
  })).sort((a, b) => a.d - b.d || a.i - b.i);

  const ranked: ArchetypeScore[] = scored.map(({ key, d }) => ({
    key,
    score: Math.max(0, 1 - d),
  }));
  const margin = scored[1].d - scored[0].d;

  return {
    ranked,
    primary: scored[0].key as V3ArchetypeKey,
    runnerUp: scored[1].key as V3ArchetypeKey,
    margin,
    lean: margin < V3_LEAN_MARGIN,
  };
}

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
  // office+luxury, fresh/woody — polished, not loud, not dark. The floor
  // targets (darkness/spice at their zero-signal floors) are load-bearing
  // REPELLERS: they keep executive out of the dark/spicy basins — removing
  // them lets it hover near everything and thins margins across the space.
  the_executive: {
    warmth: { t: 0.45, w: 1 },
    luxury: { t: 0.8, w: 1 },
    presence: { t: 0.6, w: 0.6 },
    darkness: { t: 0.43, w: 0.7 },
    sweetness: { t: 0.45, w: 0.6 },
    spice: { t: 0.35, w: 0.5 },
    genderLean: { t: 0.3, w: 0.5 },
  },
  // Warm-sweet SENSUAL, anchored on warmth. presence is deliberately LIGHT
  // (t 0.72, w 0.5): the old t=0.8/w=0.8 sat on the real-population presence
  // mean (~0.79) and overlapped showstopper (centroid gap 0.16, the roster's
  // tightest), so on the non-uniform PROD crowd — which piles into the warm/
  // sweet/loud corner — seducer vacuumed ~2-3x its uniform-sim share (prod
  // 27%+ vs sim 6.6%). Lightening presence cedes "loud" to showstopper/
  // maximalist and lets warmth+darkness carry the identity. darkness nudged to
  // 0.57 (w 0.7) to demand genuine amber/oriental depth vs the merely-sweet
  // (gourmand) — still near the 0.43 floor so warm-sweet-loud sets don't all
  // flip to spice_trader (M2). Re-verified against both M2 gates on ship.
  the_seducer: {
    warmth: { t: 0.9, w: 1.2 },
    darkness: { t: 0.57, w: 0.7 },
    presence: { t: 0.72, w: 0.5 },
    sweetness: { t: 0.65, w: 0.75 },
  },
  // luxury + anti-popularity + breadth
  the_connoisseur: {
    luxury: { t: 0.92, w: 1.3 },
    breadth: { t: 0.75, w: 1 },
    darkness: { t: 0.62, w: 0.8 },
  },
  // loyalty↑ breadth↓ — targets where a real ⭐-anchored one-family wardrobe
  // actually lands (loyalty ≈ 0.9+ once evidence-damping releases at 4 picks).
  the_signature_wearer: {
    loyalty: { t: 0.9, w: 1.2 },
    breadth: { t: 0.03, w: 1 },
  },
  // clean musk, presence↓↓ — quiet AND clean on every loud axis. The M2 sim
  // caught the old placement (presence t=0.35 ≈ the pool median) acting as a
  // universal sink (15% share): a mid-of-the-pool centroid absorbs every
  // unremarkable set. Purist now demands near-silence + all accord floors.
  the_purist: {
    presence: { t: 0.15, w: 1.3 },
    warmth: { t: 0.38, w: 0.6 },
    sweetness: { t: 0.32, w: 0.8 },
    darkness: { t: 0.43, w: 0.6 },
    florality: { t: 0.35, w: 0.7 },
    greenness: { t: 0.3, w: 0.4 },
  },
  // presence top-decile — the t MUST stay extreme (0.97): tuning it down to
  // the pool's reachable p90 (0.88–0.93) turns showstopper into the sink for
  // real mainstream-loud prod streams (replay maxShare hit 26–32% in M2
  // tuning). Loud-average sets belong to seducer/gourmand/maximalist; this
  // label is only for the genuinely top-decile-loud wardrobe.
  the_showstopper: {
    presence: { t: 0.97, w: 1.4 },
    warmth: { t: 0.75, w: 0.2 },
    luxury: { t: 0.75, w: 0.4 },
  },
  // the value axis (dupe signal dropped — pool has zero dupes)
  the_smart_shopper: {
    value: { t: 0.75, w: 1.4 },
    luxury: { t: 0.3, w: 0.8 },
  },
  // florality-forward at any volume. presence dropped from the mask entirely:
  // real pool florals sit at presence 0.06–0.32, so the old t=0.6 pushed soft
  // floral sets to purist. genderLean targets the actual feminine value (0.89).
  the_romantic: {
    florality: { t: 0.85, w: 1.3 },
    genderLean: { t: 0.89, w: 0.6 },
    darkness: { t: 0.43, w: 0.4 },
  },
  // breadth↑ adventurousness↑ — the UNANCHORED variety-seeker. loyalty weighs
  // heavily: family entropy is near-max for ANY 4–5-pick set, so breadth alone
  // would hand explorer every multi-family wardrobe; a ⭐-anchored broad set
  // (loyalty ≈ 0.35) belongs to maximalist instead.
  the_explorer: {
    breadth: { t: 1.0, w: 1.4 },
    loyalty: { t: 0.1, w: 1.2 },
  },
  // era↓ luxury↑ — heritage icons (price-anchored, vs Old Soul)
  the_classicist: {
    era: { t: 0.2, w: 1.4 },
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
  // fresh + presence↓ + tight set — quieter and fresher than the old placement
  // (presence t=0.45 was ABOVE the pool median 0.32, so purist outbid it on
  // every genuinely quiet-fresh set and minimalist died at 0.67% in the sim).
  the_minimalist: {
    warmth: { t: 0.28, w: 0.9 },
    presence: { t: 0.22, w: 1.1 },
    breadth: { t: 0.25, w: 0.8 },
    sweetness: { t: 0.32, w: 0.6 },
  },
  // greenness↑
  the_naturalist: {
    greenness: { t: 0.88, w: 1.5 },
    warmth: { t: 0.45, w: 0.5 },
    presence: { t: 0.55, w: 0.3 },
  },
  // era↑ 2020+ + popularity↑ — era target sits at the pool's p90 (0.76), not
  // an aspirational 0.85 the catalog percentiles can barely reach.
  the_trendsetter: {
    era: { t: 0.78, w: 1.5 },
    presence: { t: 0.6, w: 0.4 },
    sweetness: { t: 0.6, w: 0.4 },
  },
  // era↓↓ any price — distinct from Classicist (price-anchored). Luxury is
  // deliberately NOT in the mask ("any price" is the spec); a vintage-era axis
  // partner keeps it a real centroid rather than a 1-axis scorer.
  the_old_soul: {
    era: { t: 0.05, w: 1.6 },
    presence: { t: 0.45, w: 0.2 },
  },
  // presence↑ + breadth↑ — the LOUD explorer: same full-breadth corner as
  // explorer, tie-broken by presence (loyalty t differs from explorer's 0.1 so
  // the two target points stay distinct/reachable). Anything narrower here
  // starves it — mid-high breadth targets lose broad sets to explorer and
  // loud sets to showstopper.
  the_maximalist: {
    presence: { t: 0.68, w: 1 },
    breadth: { t: 0.95, w: 1.2 },
    loyalty: { t: 0.25, w: 0.5 },
  },
  // darkness↑ office-safe↓ — dark/smoky, vs Seducer's warm-sweet
  the_night_owl: {
    darkness: { t: 0.95, w: 1.4 },
    sweetness: { t: 0.5, w: 0.5 },
    warmth: { t: 0.5, w: 0.5 },
  },
  // spice↑ — narrow, and NO warmth in the mask: warmth and spice are
  // correlated by construction (the warm-spicy accords feed both raw scores),
  // so weighting warmth here just re-fights the seducer over every warm set.
  the_spice_trader: {
    spice: { t: 0.95, w: 1.7 },
    sweetness: { t: 0.45, w: 0.4 },
    greenness: { t: 0.5, w: 0.3 },
    darkness: { t: 0.5, w: 0.2 },
  },
  // citrus/aquatic morning-fresh — COLD fresh (warmth near zero), vs the
  // minimalist's quiet fresh. darkness/sweetness pinned to their exact floors.
  the_daybreaker: {
    warmth: { t: 0.05, w: 1.5 },
    greenness: { t: 0.45, w: 0.4 },
    darkness: { t: 0.43, w: 0.4 },
    sweetness: { t: 0.32, w: 0.5 },
  },
  // powdery/musky skin-scent femme — the QUIET-floral corner (romantic is
  // floral-forward at any volume; soft focus is medium-floral near-silent).
  the_soft_focus: {
    florality: { t: 0.6, w: 0.8 },
    presence: { t: 0.12, w: 1.2 },
    genderLean: { t: 0.89, w: 0.7 },
    sweetness: { t: 0.4, w: 0.3 },
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

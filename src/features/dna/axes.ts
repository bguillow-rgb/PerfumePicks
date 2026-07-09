/**
 * DNA V3 — the user feature vector (M1).
 *
 * Fourteen axes, all in [0, 1]:
 *   - 12 CATALOG axes: each pick is scored by axisScore.ts and mapped to its
 *     catalog percentile (axisNorms.ts), then aggregated across picks with
 *     resolvePickWeight weighting (favorites 2.5×, want 0.6×; an explicit
 *     pick.weight — Living-DNA pool, M4 search picks at 1.5× — wins verbatim).
 *     A pick missing an axis's data is SKIPPED on that axis (its weight is
 *     excluded from that axis's denominator), never faked as neutral. An axis
 *     no pick can score resolves to neutral 0.5.
 *   - 2 USER-RELATIVE axes (no catalog norm — FEATURE_ARCHETYPES_V2.md):
 *       breadth  — family entropy across the user's picks.
 *       loyalty  — signature outcome (1 − tasteBreadth) + wardrobe tightness
 *                  (favorite anchor).
 *     Both are EVIDENCE-DAMPED toward neutral 0.5: one pick proves neither
 *     loyalty nor breadth, so tiny pick sets shouldn't slam these axes to the
 *     rails (that would funnel every 1-pick user into the same archetype).
 *
 * Pure + deterministic; unit-tested in __tests__/features/dna/axes.test.ts.
 */

import type { DnaPick } from './types';
import { CATALOG_AXES, type CatalogAxis, type DnaAxis } from './axisNorms';
import { axisPercentileOf } from './axisScore';
import { clamp01, resolvePickWeight, tasteBreadth } from './metrics';

export type UserAxisVector = Record<DnaAxis, number>;

/** Neutral value for an axis with zero usable evidence. */
export const NEUTRAL_AXIS = 0.5;

/**
 * Evidence factor for the user-relative axes: 0 at one pick (no evidence of
 * breadth OR loyalty), full strength from four picks up.
 */
function evidenceFactor(n: number): number {
  return clamp01((n - 1) / 3);
}

/** Damp a [0,1] reading toward neutral by the evidence factor. */
function dampen(raw: number, evidence: number): number {
  return NEUTRAL_AXIS + (raw - NEUTRAL_AXIS) * evidence;
}

/**
 * breadth — weighted family entropy of the picks, normalized to [0,1].
 * H = −Σ p·ln(p) over weighted family shares, divided by ln(pickCount)
 * (the max achievable entropy when every pick is a distinct family).
 */
export function familyEntropyBreadth(picks: DnaPick[]): number {
  if (picks.length <= 1) return 0;
  const shares = new Map<string, number>();
  let wsum = 0;
  for (const p of picks) {
    const fam = (p.fragrance.fragrance_family || 'unknown').toLowerCase().trim();
    const w = resolvePickWeight(p);
    shares.set(fam, (shares.get(fam) ?? 0) + w);
    wsum += w;
  }
  if (wsum <= 0) return 0;
  let h = 0;
  for (const w of shares.values()) {
    const p = w / wsum;
    if (p > 0) h -= p * Math.log(p);
  }
  return clamp01(h / Math.log(picks.length));
}

/**
 * loyalty — how much this reads like a one-signature person: taste tightness
 * (1 − tasteBreadth: families dominate, accords secondary) plus a small bump
 * when the user anchored a ⭐ favorite (an explicit "this one is mine").
 */
export function loyaltyRaw(picks: DnaPick[]): number {
  if (!picks.length) return NEUTRAL_AXIS;
  const tightness = 1 - tasteBreadth(picks);
  const hasFavorite = picks.some((p) => p.favorite);
  return clamp01(tightness + (hasFavorite ? 0.15 : 0));
}

/**
 * Build the 14-axis user feature vector from a pick set. Empty picks → every
 * axis neutral (0.5).
 */
export function deriveAxes(picks: DnaPick[]): UserAxisVector {
  const out = {} as UserAxisVector;

  for (const axis of CATALOG_AXES) {
    out[axis] = weightedAxisMean(axis, picks);
  }

  const evidence = evidenceFactor(picks.length);
  out.breadth = dampen(familyEntropyBreadth(picks), evidence);
  out.loyalty = dampen(loyaltyRaw(picks), evidence);

  return out;
}

function weightedAxisMean(axis: CatalogAxis, picks: DnaPick[]): number {
  let sum = 0;
  let wsum = 0;
  for (const p of picks) {
    const pct = axisPercentileOf(axis, p.fragrance);
    if (pct == null) continue; // NULL field → skip this pick on this axis
    const w = resolvePickWeight(p);
    sum += w * pct;
    wsum += w;
  }
  return wsum > 0 ? clamp01(sum / wsum) : NEUTRAL_AXIS;
}

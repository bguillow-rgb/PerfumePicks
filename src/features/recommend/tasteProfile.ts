/**
 * Derive a UserTasteProfile from the user's local signals.
 *
 * Inputs:
 *   - swipe likes/dislikes (Train My Nose) — strongest signal
 *   - wear logs (used = revealed preference)
 *   - wardrobe items (status = revealed intent)
 *
 * Output mirrors the v1 schema's `user_taste_profiles` table so the
 * "swap mock → Supabase" migration is a 1:1 field mapping.
 *
 * Pure function (no React, no I/O) — easy to test, easy to recompute on
 * any signal change.
 */

import type { MockFragrance } from '@/src/mock/fragrances';

export interface TasteSignal {
  fragrance: MockFragrance;
  /** +1 for like/wear, -1 for dislike. Magnitude weights the contribution. */
  weight: number;
}

export interface DerivedTasteProfile {
  liked_notes: Record<string, number>;
  disliked_notes: Record<string, number>;
  preferred_accords: Record<string, number>;
  preferred_families: Record<string, number>;
  avg_price_tier: number | null;
  longevity_preference: number | null;
  signal_count: number;
}

const EMPTY: DerivedTasteProfile = {
  liked_notes: {},
  disliked_notes: {},
  preferred_accords: {},
  preferred_families: {},
  avg_price_tier: null,
  longevity_preference: null,
  signal_count: 0,
};

export function deriveTasteProfile(signals: TasteSignal[]): DerivedTasteProfile {
  if (!signals.length) return { ...EMPTY };

  const liked: Record<string, number> = {};
  const disliked: Record<string, number> = {};
  const accords: Record<string, number> = {};
  const families: Record<string, number> = {};

  let priceSum = 0, priceCount = 0;
  let longevitySum = 0, longevityCount = 0;

  for (const { fragrance, weight } of signals) {
    const allNotes = [...fragrance.top_notes, ...fragrance.heart_notes, ...fragrance.base_notes];
    for (const n of allNotes) {
      const key = n.toLowerCase().trim();
      if (weight > 0) liked[key] = (liked[key] ?? 0) + weight;
      else            disliked[key] = (disliked[key] ?? 0) + Math.abs(weight);
    }
    for (const a of fragrance.top_accords) {
      const intensity = fragrance.accord_intensity[a] ?? 3;
      accords[a] = (accords[a] ?? 0) + weight * (intensity / 5);
    }
    if (fragrance.fragrance_family) {
      families[fragrance.fragrance_family] = (families[fragrance.fragrance_family] ?? 0) + weight;
    }
    if (weight > 0) {
      priceSum += fragrance.price_tier; priceCount++;
      longevitySum += fragrance.community_longevity; longevityCount++;
    }
  }

  return {
    liked_notes: liked,
    disliked_notes: disliked,
    preferred_accords: accords,
    preferred_families: families,
    avg_price_tier: priceCount ? priceSum / priceCount : null,
    longevity_preference: longevityCount ? longevitySum / longevityCount : null,
    signal_count: signals.length,
  };
}

/** Empty profile as a stable default reference. */
export const EMPTY_TASTE_PROFILE = EMPTY;

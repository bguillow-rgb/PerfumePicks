/**
 * deriveTraits() — the six universal cross-app buyer-psychology axes (V1.1 A2).
 *
 * These are the "passport": the SAME six keys ship in every Timberline app, so
 * they are derived here (the only consumer today) and never migrated later. All
 * 0..1. Returned wrapped in the versioned `traits` schema envelope so the axis
 * list can evolve without bumping the outer contract version.
 */

import type { DnaPick, DnaTraits } from './types';
import { TRAIT_SCHEMA_VERSION } from './types';
import {
  clamp01,
  norm5,
  normTier,
  tasteBreadth,
  weightedFraction,
  weightedMean,
} from './metrics';

export function deriveTraits(picks: DnaPick[]): DnaTraits {
  if (!picks.length) {
    return {
      schema: TRAIT_SCHEMA_VERSION,
      values: {
        luxury: null,
        adventurous: null,
        collector: null,
        valueHunter: null,
        complimentSeeking: null,
        expressive: null,
      },
    };
  }

  // luxury = price-tier mean blended with niche/luxe-accord density.
  const priceLuxe = weightedMean(picks, (f) => normTier(f.price_tier));
  const luxAccord = weightedFraction(picks, (f) => f.price_tier >= 4);
  const luxury = clamp01(0.6 * priceLuxe + 0.4 * luxAccord);

  // collector = taste breadth (distinct families/accords ÷ pick count).
  const collector = clamp01(tasteBreadth(picks));

  // adventurous = inverse mean popularity (picking the LESS obvious recognizable
  // option reads adventurous) + family/accord spread. popularity_tier optional →
  // default 3 (neutral) so mock rows without it don't skew.
  const meanPop = weightedMean(picks, (f) => normTier(f.popularity_tier ?? 3));
  const adventurous = clamp01(0.6 * (1 - meanPop) + 0.4 * tasteBreadth(picks));

  // valueHunter = dupe-affinity (picked a known dupe) blended with inverse luxury.
  // Behavioural dupe-tap signal (V1.1 A2) is unavailable in pure derivation; the
  // catalog `dupe_of` flag is the deterministic proxy we have at M1.
  const dupeAffinity = weightedFraction(picks, (f) => !!f.dupe_of);
  const valueHunter = clamp01(0.5 * dupeAffinity + 0.5 * (1 - luxury));

  // complimentSeeking = mean compliment_score (column exists).
  const complimentSeeking = clamp01(weightedMean(picks, (f) => f.compliment_score));

  // expressive = mean projection, normalized. Skin scents pull it down hard.
  const expressive = clamp01(weightedMean(picks, (f) => norm5(f.community_projection)));

  return {
    schema: TRAIT_SCHEMA_VERSION,
    values: {
      luxury,
      adventurous,
      collector,
      valueHunter,
      complimentSeeking,
      expressive,
    },
  };
}

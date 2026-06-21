/**
 * deriveTraits() — the six universal cross-app buyer-psychology axes (V1.1 A2).
 *
 * These are the "passport": the SAME six keys ship in every Timberline app, so
 * they are derived here (the only consumer today) and never migrated later. All
 * 0..1. Returned wrapped in the versioned `traits` schema envelope so the axis
 * list can evolve without bumping the outer contract version.
 */

import type { DnaCatalogFragrance, DnaPick, DnaTraits } from './types';
import { TRAIT_SCHEMA_VERSION } from './types';
import {
  clamp01,
  norm5,
  normTier,
  poolPercentile,
  tasteBreadth,
  weightedFraction,
  weightedMean,
} from './metrics';

/**
 * A reference pool below this size has no usable distribution, so we fall back
 * to absolute scoring rather than computing percentiles off a handful of rows.
 */
const MIN_POOL_FOR_RELATIVE = 8;

/**
 * @param picks         the user's seeded picks
 * @param referencePool the set the picks were chosen FROM (the onboarding picker
 *   pool). When supplied and large enough, the differentiating axes (luxury /
 *   adventurous / complimentSeeking / expressive) are scored as each pick's
 *   percentile WITHIN that pool, so picking the least-mainstream bottles on
 *   offer actually moves the archetype. Absent (Living-DNA path, unit tests) →
 *   the legacy absolute scoring runs unchanged (no-regression).
 */
export function deriveTraits(
  picks: DnaPick[],
  referencePool?: DnaCatalogFragrance[],
): DnaTraits {
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

  // When we know the pool the picks were chosen from, score the differentiating
  // axes RELATIVE to it (each pick's percentile within the pool) instead of
  // against absolute community values. Otherwise these rankers are unused and
  // the legacy absolute path runs.
  const relative = !!referencePool && referencePool.length >= MIN_POOL_FOR_RELATIVE;
  const pricePct = relative ? poolPercentile(referencePool!, (f) => f.price_tier) : null;
  const popPct = relative ? poolPercentile(referencePool!, (f) => f.popularity_tier ?? 3) : null;
  const projPct = relative ? poolPercentile(referencePool!, (f) => f.community_projection) : null;
  const compPct = relative ? poolPercentile(referencePool!, (f) => f.compliment_score) : null;

  // luxury = price-tier mean blended with niche/luxe-accord density. The mean
  // term goes relative-to-pool when available (did they reach for the pricier
  // end of what they saw?); the luxe-accord fraction stays an absolute floor.
  const priceLuxe = pricePct
    ? weightedMean(picks, (f) => pricePct(f.price_tier))
    : weightedMean(picks, (f) => normTier(f.price_tier));
  const luxAccord = weightedFraction(picks, (f) => f.price_tier >= 4);
  const luxury = clamp01(0.6 * priceLuxe + 0.4 * luxAccord);

  // collector = taste breadth (distinct families/accords ÷ pick count).
  const collector = clamp01(tasteBreadth(picks));

  // adventurous = inverse mean popularity (picking the LESS obvious recognizable
  // option reads adventurous) + family/accord spread. Relative path: low pool
  // percentile = niche-for-this-set. popularity_tier optional → default 3.
  const meanPop = popPct
    ? weightedMean(picks, (f) => popPct(f.popularity_tier ?? 3))
    : weightedMean(picks, (f) => normTier(f.popularity_tier ?? 3));
  const adventurous = clamp01(0.6 * (1 - meanPop) + 0.4 * tasteBreadth(picks));

  // valueHunter = dupe-affinity (picked a known dupe) blended with inverse luxury.
  // Behavioural dupe-tap signal (V1.1 A2) is unavailable in pure derivation; the
  // catalog `dupe_of` flag is the deterministic proxy we have at M1.
  const dupeAffinity = weightedFraction(picks, (f) => !!f.dupe_of);
  const valueHunter = clamp01(0.5 * dupeAffinity + 0.5 * (1 - luxury));

  // complimentSeeking = mean compliment_score, relative-to-pool when available
  // (did they gravitate to the crowd-favourites among what they saw?).
  const complimentSeeking = clamp01(
    compPct
      ? weightedMean(picks, (f) => compPct(f.compliment_score))
      : weightedMean(picks, (f) => f.compliment_score),
  );

  // expressive = mean projection, normalized. Skin scents pull it down hard.
  const expressive = clamp01(
    projPct
      ? weightedMean(picks, (f) => projPct(f.community_projection))
      : weightedMean(picks, (f) => norm5(f.community_projection)),
  );

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

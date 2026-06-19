/**
 * deriveOutcomes() — what the user is actually BUYING, in human language (V1.1 A2).
 *
 * Mostly direct reads of columns the catalog already has (compliment_score,
 * office_safe_score, versatility_score) — promoted from "scoring tiebreak" to
 * headline DNA axes. The derived ones (smellsLuxe / dateNight / signature) blend
 * existing columns; no new data collection. All 0..1.
 */

import type { DnaOutcomes, DnaPick } from './types';
import {
  clamp01,
  isEveningFrag,
  isLuxeFrag,
  isSweetFrag,
  norm5,
  normTier,
  tasteBreadth,
  weightedFraction,
  weightedMean,
} from './metrics';

export function deriveOutcomes(picks: DnaPick[]): DnaOutcomes {
  if (!picks.length) {
    return {
      compliments: 0,
      officeSafe: 0,
      smellsLuxe: 0,
      versatile: 0,
      dateNight: 0,
      signature: 0,
    };
  }

  const compliments = clamp01(weightedMean(picks, (f) => f.compliment_score));
  const officeSafe = clamp01(weightedMean(picks, (f) => f.office_safe_score));
  const versatile = clamp01(weightedMean(picks, (f) => f.versatility_score));

  // smellsLuxe ← price tier + luxe-accord density.
  const priceLuxe = weightedMean(picks, (f) => normTier(f.price_tier));
  const accordLuxe = weightedFraction(picks, isLuxeFrag);
  const smellsLuxe = clamp01(0.5 * priceLuxe + 0.5 * accordLuxe);

  // dateNight ← evening family + projection + sweet accord.
  const eveningFrac = weightedFraction(picks, isEveningFrag);
  const projection = weightedMean(picks, (f) => norm5(f.community_projection));
  const sweetFrac = weightedFraction(picks, isSweetFrag);
  const dateNight = clamp01(0.5 * eveningFrac + 0.3 * projection + 0.2 * sweetFrac);

  // signature ← inverse of collector breadth (one-scent person vs. wardrobe builder).
  const signature = clamp01(1 - tasteBreadth(picks));

  return { compliments, officeSafe, smellsLuxe, versatile, dateNight, signature };
}

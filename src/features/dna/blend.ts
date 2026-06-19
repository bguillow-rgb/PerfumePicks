/**
 * blendProfiles() — the MOST-USED path (Mark Z: "no hand-waving").
 *
 * `useRecommendations` / `useDailyPicks` consume a `DerivedTasteProfile` (the
 * existing passive-taste shape the rank engine already understands). This
 * function produces that shape so the engine keeps working unchanged:
 *
 *   - DNA ABSENT → return `deriveTasteProfile(signals)` verbatim. This is the
 *     pre-DNA behavior — a hard guarantee of NO REGRESSION.
 *   - DNA PRESENT → convert the DNA to the passive shape and blend it with the
 *     passive profile, weighted by `dna.confidence`. Low confidence → passive
 *     dominates (safe). High confidence → the explicit DNA leads.
 */

import type { DerivedTasteProfile } from '@/src/features/recommend/tasteProfile';
import type { FragranceDNA } from './types';

/** Convert a DNA envelope into the passive `DerivedTasteProfile` shape. */
export function dnaToTasteProfile(dna: FragranceDNA): DerivedTasteProfile {
  return {
    liked_notes: { ...dna.likedNotes },
    disliked_notes: { ...dna.dislikedNotes },
    preferred_accords: { ...dna.accords },
    preferred_families: { ...dna.families },
    avg_price_tier: dna.price.targetTier,
    longevity_preference: dna.performance.longevity,
    signal_count: dna.seeds.length,
  };
}

function blendMaps(
  a: Record<string, number>,
  b: Record<string, number>,
  wa: number,
  wb: number,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    out[k] = wa * (a[k] ?? 0) + wb * (b[k] ?? 0);
  }
  return out;
}

function blendScalar(
  a: number | null,
  b: number | null,
  wa: number,
  wb: number,
): number | null {
  if (a == null && b == null) return null;
  if (a == null) return b;
  if (b == null) return a;
  return wa * a + wb * b;
}

/**
 * @param dna      the persisted DNA, or null when none exists yet
 * @param passive  `deriveTasteProfile(signals)` — the swipe/wear/wardrobe profile
 */
export function blendProfiles(
  dna: FragranceDNA | null,
  passive: DerivedTasteProfile,
): DerivedTasteProfile {
  // No DNA → exact passive behavior. NO REGRESSION.
  if (!dna) return passive;

  const w = Math.max(0, Math.min(1, dna.confidence));
  const wp = 1 - w;
  const d = dnaToTasteProfile(dna);

  return {
    liked_notes: blendMaps(d.liked_notes, passive.liked_notes, w, wp),
    disliked_notes: blendMaps(d.disliked_notes, passive.disliked_notes, w, wp),
    preferred_accords: blendMaps(d.preferred_accords, passive.preferred_accords, w, wp),
    preferred_families: blendMaps(d.preferred_families, passive.preferred_families, w, wp),
    avg_price_tier: blendScalar(d.avg_price_tier, passive.avg_price_tier, w, wp),
    longevity_preference: blendScalar(d.longevity_preference, passive.longevity_preference, w, wp),
    signal_count: d.signal_count + passive.signal_count,
  };
}

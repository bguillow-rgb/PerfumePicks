/**
 * Shared numeric helpers + pick-derived metrics used by the trait, outcome,
 * archetype, and aggregation logic. Pure, deterministic, no I/O.
 */

import type { DnaCatalogFragrance, DnaPick, SeedRelation } from './types';

export const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

export const clamp = (n: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, n));

/** Normalise a 1..5 tier to 0..1. */
export const normTier = (tier: number): number => clamp01((tier - 1) / 4);

/** Normalise a 0..5 community score to 0..1. */
export const norm5 = (v: number): number => clamp01(v / 5);

/**
 * Per-pick weight. own = 1.0, want is down-weighted (aspiration must not be
 * blended at parity or every DNA drifts artificially luxe — V1.1 A4). The
 * ⭐favorite anchor multiplies on top (≈2.5×, V1.1 A4).
 */
export const WANT_WEIGHT = 0.6;
export const FAVORITE_MULTIPLIER = 2.5;

export function pickWeight(relation: SeedRelation, favorite: boolean): number {
  const base = relation === 'want' ? WANT_WEIGHT : 1;
  return favorite ? base * FAVORITE_MULTIPLIER : base;
}

/**
 * The single weight chokepoint every derivation helper reads. A Living DNA pool
 * pick carries a pre-resolved `weight` (base × deliberate × recency); a plain
 * onboarding pick has none → falls back to `pickWeight`, keeping the legacy
 * derivation byte-identical (the no-regression guarantee).
 */
export function resolvePickWeight(p: DnaPick): number {
  return p.weight ?? pickWeight(p.relation, p.favorite);
}

/** Accords that read as "expensive/luxe" — used for smellsLuxe + luxury. */
const LUXE_ACCORDS = ['oud', 'amber', 'leather', 'incense', 'resin', 'saffron', 'oudh'];
/** Families/accords that read as evening / date-night. */
const EVENING_FAMILIES = ['oriental', 'amber', 'gourmand', 'woody oriental'];
const SWEET_ACCORDS = ['vanilla', 'sweet', 'gourmand', 'caramel', 'honey', 'tonka', 'sugar'];
/** Accords/families that lean warm-weather. */
const WARM_ACCORDS = ['fresh', 'citrus', 'aquatic', 'green', 'marine', 'aromatic'];
/** Accords/families that lean cold-weather. */
const COLD_ACCORDS = ['gourmand', 'amber', 'spicy', 'woody', 'oriental', 'vanilla', 'oud'];

const lc = (s: string) => s.toLowerCase().trim();

const hasAny = (haystack: string[], needles: string[]): boolean => {
  const set = haystack.map(lc);
  return needles.some((n) => set.some((h) => h.includes(n)));
};

export const isLuxeFrag = (f: DnaCatalogFragrance): boolean =>
  hasAny(f.top_accords, LUXE_ACCORDS);

export const isEveningFrag = (f: DnaCatalogFragrance): boolean =>
  hasAny([f.fragrance_family], EVENING_FAMILIES) || hasAny(f.top_accords, EVENING_FAMILIES);

export const isSweetFrag = (f: DnaCatalogFragrance): boolean =>
  hasAny(f.top_accords, SWEET_ACCORDS);

export const isWarmFrag = (f: DnaCatalogFragrance): boolean =>
  hasAny(f.top_accords, WARM_ACCORDS);

export const isColdFrag = (f: DnaCatalogFragrance): boolean =>
  hasAny(f.top_accords, COLD_ACCORDS) || hasAny([f.fragrance_family], EVENING_FAMILIES);

/**
 * Build a percentile function over a reference pool for a numeric accessor.
 *
 * Returns a fn mapping a raw value → its midrank percentile (0..1) within the
 * pool: fraction strictly below, plus half the ties. A value at the pool's low
 * end → ~0, the high end → ~1, the median → ~0.5. This is the lever that makes
 * the DNA respond to WHICH bottles a user picked from the set they were shown:
 * the onboarding picker only ever offers popular bottles, so absolute popularity
 * is near-constant across users and can't differentiate them — but picking the
 * least-popular / priciest / loudest bottle *on offer* reads high here. Missing
 * values and an empty pool both resolve to the neutral 0.5.
 */
export function poolPercentile(
  pool: DnaCatalogFragrance[],
  get: (f: DnaCatalogFragrance) => number | null | undefined,
): (raw: number | null | undefined) => number {
  const vals = pool
    .map(get)
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
    .sort((a, b) => a - b);
  return (raw) => {
    if (typeof raw !== 'number' || !Number.isFinite(raw) || vals.length === 0) return 0.5;
    let below = 0;
    let equal = 0;
    for (const v of vals) {
      if (v < raw) below++;
      else if (v === raw) equal++;
    }
    return (below + equal / 2) / vals.length;
  };
}

/** Weighted mean of a per-fragrance accessor across picks (0 when no weight). */
export function weightedMean(
  picks: DnaPick[],
  get: (f: DnaCatalogFragrance) => number,
): number {
  let sum = 0;
  let wsum = 0;
  for (const p of picks) {
    const w = resolvePickWeight(p);
    sum += w * get(p.fragrance);
    wsum += w;
  }
  return wsum ? sum / wsum : 0;
}

/** Weighted fraction of picks satisfying a predicate (0..1). */
export function weightedFraction(
  picks: DnaPick[],
  pred: (f: DnaCatalogFragrance) => boolean,
): number {
  let hit = 0;
  let wsum = 0;
  for (const p of picks) {
    const w = resolvePickWeight(p);
    if (pred(p.fragrance)) hit += w;
    wsum += w;
  }
  return wsum ? hit / wsum : 0;
}

/**
 * Taste breadth (0..1): how WIDELY a user's picks spread across families/accords.
 * Wide spread → collector; one tight cluster → low. Family spread dominates
 * (different families is the real "wardrobe builder" signal); accord variety is
 * a softer secondary term. A single pick reads low breadth by construction.
 */
export function tasteBreadth(picks: DnaPick[]): number {
  if (!picks.length) return 0;
  const families = new Set<string>();
  const accords = new Set<string>();
  for (const p of picks) {
    if (p.fragrance.fragrance_family) families.add(lc(p.fragrance.fragrance_family));
    for (const a of p.fragrance.top_accords) accords.add(lc(a));
  }
  // familySpread is 0 when every pick shares a family, → 1 as families diverge.
  const familySpread = clamp01((families.size - 1) / Math.max(1, picks.length));
  const accordSpread = clamp01(accords.size / (picks.length * 3));
  return clamp01(0.6 * familySpread + 0.4 * accordSpread);
}

/** Modal (most-weighted) gender across picks. */
export function modalGender(picks: DnaPick[]): 'masculine' | 'feminine' | 'unisex' {
  const tally: Record<string, number> = {};
  for (const p of picks) {
    const w = resolvePickWeight(p);
    tally[p.fragrance.gender] = (tally[p.fragrance.gender] ?? 0) + w;
  }
  let best: 'masculine' | 'feminine' | 'unisex' = 'unisex';
  let bestW = -1;
  // Stable order so ties resolve deterministically.
  for (const g of ['unisex', 'feminine', 'masculine'] as const) {
    if ((tally[g] ?? 0) > bestW) {
      bestW = tally[g] ?? 0;
      best = g;
    }
  }
  return best;
}

/**
 * scoreFragranceDNA() + rankWithRelaxation() — the DNA-driven scorer (spec Part 8).
 *
 * RENAMED from the spec's `scoreFragrance` to avoid the collision with the
 * existing passive-taste scorer at `src/features/recommend/score.ts:154`
 * (the Mark Z footgun). Returns `{ score, reasons[] } | null` — null when a
 * HARD RAIL excludes the fragrance.
 *
 * Rail-relaxation: rails can empty the pool. `rankWithRelaxation` relaxes in
 * priority order (price ceiling → projection cap → gender hard→soft) until at
 * least one displayable rec exists. There is never "no recommendation."
 */

import type { DnaCatalogFragrance, FragranceDNA } from './types';

export interface DnaScore {
  score: number;
  reasons: string[];
}

const lc = (s: string) => s.toLowerCase().trim();

/**
 * Score one fragrance against the DNA. Returns null on a hard-rail exclusion.
 * Rails (in order): gender.hard, projectionCap, price.ceilingCents.
 */
export function scoreFragranceDNA(
  frag: DnaCatalogFragrance,
  dna: FragranceDNA,
): DnaScore | null {
  // ── HARD RAILS (return null) ──
  if (
    dna.gender.hard &&
    frag.gender !== dna.gender.lean &&
    frag.gender !== 'unisex'
  ) {
    return null;
  }
  if (dna.projectionCap != null && frag.community_projection > dna.projectionCap) {
    return null;
  }
  if (dna.price.ceilingCents != null && frag.retail_msrp_usd_cents > dna.price.ceilingCents) {
    return null;
  }

  // ── ADDITIVE SCORE + REASONS ──
  let score = 0;
  const accordReasons: { accord: string; weight: number }[] = [];

  // Accord match (PRIMARY, weighted).
  for (const a of frag.top_accords) {
    const key = lc(a);
    const pref = dna.accords[key];
    if (pref && pref > 0) {
      const intensity = frag.accord_intensity[a] ?? 3;
      const contrib = pref * (intensity / 5) * 2;
      score += contrib;
      accordReasons.push({ accord: key, weight: contrib });
    }
  }
  const reasons: string[] = [];
  const topAccords = accordReasons.sort((a, b) => b.weight - a.weight).slice(0, 2);
  if (topAccords.length) {
    reasons.push(`Hits your ${topAccords.map((a) => a.accord).join(' + ')}`);
  }

  // Family lean.
  const fam = lc(frag.fragrance_family);
  if (dna.families[fam]) {
    score += dna.families[fam];
    reasons.push(`A ${fam}, one of your top families`);
  }

  // Note match (secondary) + disliked penalty.
  const allNotes = [...frag.top_notes, ...frag.heart_notes, ...frag.base_notes].map(lc);
  let likedHits = 0;
  for (const n of allNotes) {
    if (dna.likedNotes[n]) {
      score += 0.2 * dna.likedNotes[n];
      likedHits++;
    }
    if (dna.dislikedNotes[n]) {
      score -= 0.5 * dna.dislikedNotes[n];
    }
  }
  if (likedHits) {
    reasons.push('Built on notes you picked');
  }

  // Performance windows (soft).
  const longevityDelta = Math.abs(frag.community_longevity - dna.performance.longevity);
  if (longevityDelta <= 1) {
    score += 0.5;
    reasons.push('Long-lasting, the way you like');
  }

  // Price target (soft): exact tier best, ±1 mild.
  const tierDelta = Math.abs(frag.price_tier - dna.price.targetTier);
  if (tierDelta === 0) score += 0.6;
  else if (tierDelta === 1) score += 0.3;

  // Community tiebreak (monetization-blind: fit only).
  score += 0.15 * frag.compliment_score + 0.1 * frag.versatility_score;

  return { score, reasons: reasons.slice(0, 3) };
}

export interface RankedDnaRec {
  fragrance: DnaCatalogFragrance;
  score: number;
  reasons: string[];
}

export interface RankResult {
  recs: RankedDnaRec[];
  /** Which rails were relaxed to produce a non-empty pool (in order applied). */
  relaxed: ('price' | 'projection' | 'gender')[];
}

/**
 * Rank a pool against the DNA, relaxing rails only as needed to guarantee ≥1
 * displayable rec. Relaxation priority: price ceiling → projection cap →
 * gender hard→soft. Never returns an empty pool unless the input is empty.
 */
export function rankWithRelaxation(
  pool: DnaCatalogFragrance[],
  dna: FragranceDNA,
): RankResult {
  if (!pool.length) return { recs: [], relaxed: [] };

  const relaxationSteps: ('price' | 'projection' | 'gender')[] = [
    'price',
    'projection',
    'gender',
  ];

  const tryRank = (d: FragranceDNA): RankedDnaRec[] =>
    pool
      .map((f) => {
        const s = scoreFragranceDNA(f, d);
        return s ? { fragrance: f, score: s.score, reasons: s.reasons } : null;
      })
      .filter((r): r is RankedDnaRec => r !== null)
      .sort((a, b) => b.score - a.score);

  let working = dna;
  const applied: ('price' | 'projection' | 'gender')[] = [];
  let recs = tryRank(working);

  for (const step of relaxationSteps) {
    if (recs.length) break;
    working = relaxRail(working, step);
    applied.push(step);
    recs = tryRank(working);
  }

  return { recs, relaxed: applied };
}

function relaxRail(dna: FragranceDNA, step: 'price' | 'projection' | 'gender'): FragranceDNA {
  switch (step) {
    case 'price':
      return { ...dna, price: { ...dna.price, ceilingCents: null } };
    case 'projection':
      return { ...dna, projectionCap: null };
    case 'gender':
      return { ...dna, gender: { ...dna.gender, hard: false } };
  }
}

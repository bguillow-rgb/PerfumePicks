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

// ─────────────────────────────────────────────────────────────────────────────
// MONETIZATION LAYER — affiliate-first, most-expensive-first (DNA flow v2 R4/R5).
//
// This is layered ON TOP of the fit scorer above. It does NOT change any scoring
// math. It joins fit-ranked candidates to their live affiliate link and picks:
//   - a single HERO (the most expensive among the best-FIT buyable candidates),
//   - a "more matches" list (all buyable, most-expensive → cheapest).
// One pure function feeds BOTH surfaces so the hero can never disagree with the
// top of the list, and both use the SAME representative price for sort + label.
// ─────────────────────────────────────────────────────────────────────────────

/** The representative live affiliate link for a fragrance (price + destination). */
export interface BuyableLink {
  /** Representative price in cents — used for BOTH the expensive-first sort and
   *  the displayed label, so the number the user sees matches the link we open. */
  priceCents: number;
  /** Affiliate / product url the buy CTA opens. */
  url: string;
  /** Retailer name of the representative row — carried so the buy CTA can
   *  attribute the outbound click (AFFILIATE_OUTBOUND_CLICKED) and the dead-link
   *  report to the right merchant. The displayed price/url/retailer are all from
   *  the SAME row, so the label, the link, and the attribution never disagree. */
  retailer: string;
}

export interface BuyableMatch {
  fragrance: DnaCatalogFragrance;
  score: number;
  reasons: string[];
  /** The buyable link, or null ONLY in the zero-buyable fallback hero. */
  buyable: BuyableLink | null;
}

export interface BuyableRankResult {
  /** The monetizable top match: among the top-N best-FIT buyable candidates, the
   *  most expensive. Null only when the candidate pool itself is empty. */
  hero: BuyableMatch | null;
  /** Every buyable candidate sorted most-expensive → cheapest, EXCLUDING the hero
   *  (it's already surfaced). Feeds the "show me more matches" page. */
  matches: BuyableMatch[];
  /** True when NO candidate was buyable: hero is the top fit-ranked rec with a
   *  null `buyable` link. The caller shows "View details" instead of a buy CTA
   *  and logs `dna_top_match_no_buyable`. */
  fallbackUsed: boolean;
}

/** Best-FIT buyable candidates considered for the expensive-first hero tiebreak.
 *  Restricting to the top-N by fit FIRST stops a barely-matching but pricey
 *  bottle from being crowned hero. */
const HERO_FIT_POOL = 10;

/**
 * Rank candidates for monetization. Pure: same inputs → same output.
 *
 * `getBuyable` resolves a candidate to its live affiliate link (or null). The
 * caller owns the slug join — at the app level a fragrance `id` IS its slug, so
 * the closure is typically `(f) => store.getBuyable(f.id)`. Keeping the resolver
 * injected keeps this function decoupled from the retailer store and trivially
 * unit-testable.
 *
 * Contract: caller MUST await the full retailer-link load before calling this,
 * otherwise a half-loaded index silently demotes buyable bottles to the fallback.
 */
export function rankBuyableMatches(
  candidates: DnaCatalogFragrance[],
  dna: FragranceDNA,
  getBuyable: (frag: DnaCatalogFragrance) => BuyableLink | null,
  opts: { heroFitPool?: number } = {},
): BuyableRankResult {
  // Fit-rank the whole pool once, reusing the app's canonical relaxation logic
  // so this ordering matches every other DNA rec surface.
  const fitRanked = rankWithRelaxation(candidates, dna).recs; // fit desc

  // Partition to buyable, preserving fit order.
  const buyable: BuyableMatch[] = [];
  for (const r of fitRanked) {
    const link = getBuyable(r.fragrance);
    if (link) {
      buyable.push({
        fragrance: r.fragrance,
        score: r.score,
        reasons: r.reasons,
        buyable: link,
      });
    }
  }

  // Zero-buyable fallback: surface the single best FIT rec, no buy CTA.
  if (buyable.length === 0) {
    const top = fitRanked[0];
    return {
      hero: top
        ? { fragrance: top.fragrance, score: top.score, reasons: top.reasons, buyable: null }
        : null,
      matches: [],
      fallbackUsed: true,
    };
  }

  // Hero: among the top-N best-FIT buyable candidates, the most EXPENSIVE.
  const heroPool = buyable.slice(0, opts.heroFitPool ?? HERO_FIT_POOL);
  const hero = heroPool.reduce((best, m) =>
    m.buyable!.priceCents > best.buyable!.priceCents ? m : best,
  );

  // "More matches": all buyable, most-expensive → cheapest, hero removed.
  const matches = buyable
    .filter((m) => m.fragrance.id !== hero.fragrance.id)
    .sort((a, b) => b.buyable!.priceCents - a.buyable!.priceCents);

  return { hero, matches, fallbackUsed: false };
}

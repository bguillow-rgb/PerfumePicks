/**
 * aggregateFromFragrances() — picker selections → the PRIMARY taste-signal block
 * of the DNA envelope (accords/families/notes/performance/gender/price/season).
 *
 * Mirrors Pour Picks `aggregateFromBottles()` and reuses the existing
 * `deriveTasteProfile` accord math (`weight * intensity/5`). Per spec Part 7:
 *   - accords are the PRIMARY signal, intensity-weighted
 *   - ⭐favorite gets a ≈2.5× multiplier; `want` is down-weighted (no luxe drift)
 *   - avoided picks SUBTRACT from accords and seed dislikedNotes
 *   - NO hard rails from picks: projectionCap / price.ceilingCents / gender.hard
 *     all stay null/false. Picks are positive preference only.
 */

import type { DnaCatalogFragrance, DnaPick } from './types';
import { modalGender, resolvePickWeight } from './metrics';

export interface AggregateResult {
  accords: Record<string, number>;
  families: Record<string, number>;
  likedNotes: Record<string, number>;
  dislikedNotes: Record<string, number>;
  performance: { longevity: number; projection: number };
  gender: { lean: 'masculine' | 'feminine' | 'unisex'; hard: false };
  season: Record<string, number>;
  price: { targetTier: number; ceilingCents: null };
  /** distinct accords captured — feeds computeConfidence coverage. */
  weights: Record<string, number>;
}

const lc = (s: string) => s.toLowerCase().trim();

// Accord buckets that lean to a season — kept local; light-touch derived signal.
const SUMMER_ACCORDS = ['fresh', 'citrus', 'aquatic', 'marine', 'green', 'aromatic'];
const WINTER_ACCORDS = ['gourmand', 'amber', 'spicy', 'woody', 'oriental', 'vanilla', 'oud', 'leather'];

const EMPTY: AggregateResult = {
  accords: {},
  families: {},
  likedNotes: {},
  dislikedNotes: {},
  performance: { longevity: 0, projection: 0 },
  gender: { lean: 'unisex', hard: false },
  season: { summer: 0, winter: 0 },
  price: { targetTier: 3, ceilingCents: null },
  weights: {},
};

export function aggregateFromFragrances(
  picks: DnaPick[],
  avoided: DnaCatalogFragrance[] = [],
): AggregateResult {
  if (!picks.length) {
    // Avoidance with zero positive picks still seeds dislikes — honour it.
    const out: AggregateResult = {
      ...EMPTY,
      accords: {},
      families: {},
      likedNotes: {},
      dislikedNotes: {},
      season: { summer: 0, winter: 0 },
      weights: {},
    };
    applyAvoided(out, avoided);
    return out;
  }

  const accords: Record<string, number> = {};
  const families: Record<string, number> = {};
  const likedNotes: Record<string, number> = {};
  const dislikedNotes: Record<string, number> = {};
  const season: Record<string, number> = { summer: 0, winter: 0 };

  let longevitySum = 0;
  let projectionSum = 0;
  let wsum = 0;

  for (const p of picks) {
    const f = p.fragrance;
    const w = resolvePickWeight(p);
    wsum += w;

    for (const a of f.top_accords) {
      const key = lc(a);
      const intensity = f.accord_intensity[a] ?? 3;
      accords[key] = (accords[key] ?? 0) + w * (intensity / 5);
      if (SUMMER_ACCORDS.includes(key)) season.summer += w * (intensity / 5);
      if (WINTER_ACCORDS.includes(key)) season.winter += w * (intensity / 5);
    }

    if (f.fragrance_family) {
      const fam = lc(f.fragrance_family);
      families[fam] = (families[fam] ?? 0) + w;
    }

    for (const n of [...f.top_notes, ...f.heart_notes, ...f.base_notes]) {
      const key = lc(n);
      likedNotes[key] = (likedNotes[key] ?? 0) + w;
    }

    longevitySum += w * f.community_longevity;
    projectionSum += w * f.community_projection;
  }

  const result: AggregateResult = {
    accords,
    families,
    likedNotes,
    dislikedNotes,
    performance: {
      longevity: wsum ? longevitySum / wsum : 0,
      projection: wsum ? projectionSum / wsum : 0,
    },
    gender: { lean: modalGender(picks), hard: false },
    season,
    price: { targetTier: weightedTargetTier(picks), ceilingCents: null },
    weights: accords,
  };

  applyAvoided(result, avoided);
  return result;
}

function weightedTargetTier(picks: DnaPick[]): number {
  let sum = 0;
  let wsum = 0;
  for (const p of picks) {
    const w = resolvePickWeight(p);
    sum += w * p.fragrance.price_tier;
    wsum += w;
  }
  if (!wsum) return 3;
  return Math.max(1, Math.min(5, Math.round(sum / wsum)));
}

/**
 * Subtract avoided accords (floored at 0) and seed dislikedNotes. Recoil is a
 * stronger signal than mild attraction — but we never let it drive the accord
 * map negative.
 */
function applyAvoided(result: AggregateResult, avoided: DnaCatalogFragrance[]): void {
  for (const f of avoided) {
    for (const a of f.top_accords) {
      const key = lc(a);
      const intensity = f.accord_intensity[a] ?? 3;
      const next = (result.accords[key] ?? 0) - intensity / 5;
      // Floor at 0, and never manufacture a useless 0-valued key for an accord
      // the user never expressed positively.
      if (next > 0) result.accords[key] = next;
      else delete result.accords[key];
    }
    for (const n of [...f.top_notes, ...f.heart_notes, ...f.base_notes]) {
      const key = lc(n);
      result.dislikedNotes[key] = (result.dislikedNotes[key] ?? 0) + 1;
    }
  }
  result.weights = result.accords;
}

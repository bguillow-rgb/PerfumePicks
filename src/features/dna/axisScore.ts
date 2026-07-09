/**
 * DNA V3 — per-bottle raw axis scores (the CANONICAL formula definitions).
 *
 * One raw score per catalog-derived axis per bottle. The engine maps each raw
 * score to a catalog percentile via `axisPercentile()` (axisNorms.ts, generated
 * by scripts/build-axis-norms.mjs). THIS FILE is the source of truth for the
 * formulas — build-axis-norms.mjs mirrors them in plain JS for the generator
 * run and must be kept byte-for-byte in sync (its header says so). If a formula
 * changes here, change it there and regenerate axisNorms.ts in the same commit.
 *
 * NULL handling (M1 contract): a bottle missing the field(s) an axis needs
 * returns `null` for that axis, and the aggregator (axes.ts) SKIPS that
 * bottle's contribution to that axis instead of polluting the mean with a fake
 * neutral. Two pool bottles still carry residual NULLs (one release_year, one
 * community_* trio) — this is what keeps them from distorting era/presence.
 */

import type { DnaCatalogFragrance } from './types';
import type { CatalogAxis } from './axisNorms';
import { axisPercentile } from './axisNorms';

// ── accord keyword sets (must match build-axis-norms.mjs) ────────────────────
export const WARM_ACCORDS = ['amber', 'spicy', 'warm-spicy', 'vanilla'] as const;
export const FRESH_ACCORDS = ['fresh', 'citrus', 'aquatic'] as const;
export const SWEET_ACCORDS = ['sweet', 'vanilla', 'gourmand'] as const;
export const FLORAL_ACCORDS = ['floral', 'rose', 'jasmine', 'powdery', 'white-floral'] as const;
export const GREEN_ACCORDS = ['green', 'earthy', 'aromatic'] as const;
export const DARK_ACCORDS = ['leather', 'tobacco', 'oud', 'smoky'] as const;
export const SPICE_ACCORDS = ['spicy', 'warm-spicy'] as const;

/**
 * Median retail MSRP (usd cents) per price_tier across the is_active catalog —
 * the imputation table for bottles missing retail_msrp_usd_cents. Computed the
 * same way build-axis-norms.mjs computes its dynamic `tierMedian` (2026-07-09,
 * 10,481 rows); refresh alongside axisNorms.ts when norms are regenerated.
 */
export const LUXURY_TIER_MEDIAN_CENTS: Record<number, number> = {
  1: 1795,
  2: 4895,
  3: 10395,
  4: 18995,
  5: 33695,
};

const norm = (s: string): string => String(s).trim().toLowerCase();

/**
 * Per-accord weights for a bottle: accord_intensity values (1–5) when the map
 * is non-empty, else top_accords position (first ≈ 4, decaying 0.5/slot,
 * floor 1). `null` when the bottle has no accord data at all.
 */
export function accordWeights(f: DnaCatalogFragrance): Record<string, number> | null {
  const ai = f.accord_intensity ?? {};
  const aiKeys = Object.keys(ai);
  if (aiKeys.length > 0) {
    const w: Record<string, number> = {};
    for (const [k, v] of Object.entries(ai)) {
      if (typeof v === 'number') w[norm(k)] = v;
    }
    return w;
  }
  const ta = f.top_accords ?? [];
  if (ta.length > 0) {
    const w: Record<string, number> = {};
    ta.forEach((k, i) => {
      w[norm(k)] = Math.max(1, 4 - i * 0.5);
    });
    return w;
  }
  return null;
}

const sumOf = (w: Record<string, number>, keys: readonly string[]): number =>
  keys.reduce((s, k) => s + (w[k] ?? 0), 0);

const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

/** retail msrp, imputed from the tier median when missing. null when neither exists. */
export function luxuryRaw(f: DnaCatalogFragrance): number | null {
  if (f.retail_msrp_usd_cents != null) return f.retail_msrp_usd_cents;
  if (f.price_tier != null && LUXURY_TIER_MEDIAN_CENTS[f.price_tier] != null) {
    return LUXURY_TIER_MEDIAN_CENTS[f.price_tier];
  }
  return null;
}

/**
 * Raw (un-normalized) score of one bottle on one catalog axis, or `null` when
 * the bottle is missing the data that axis needs. Formula table mirrors the
 * axis table in FEATURE_ARCHETYPES_V2.md and build-axis-norms.mjs.
 */
export function rawAxisScore(axis: CatalogAxis, f: DnaCatalogFragrance): number | null {
  switch (axis) {
    case 'warmth': {
      const w = accordWeights(f);
      return w ? sumOf(w, WARM_ACCORDS) - sumOf(w, FRESH_ACCORDS) : null;
    }
    case 'sweetness': {
      const w = accordWeights(f);
      return w ? sumOf(w, SWEET_ACCORDS) + (f.fragrance_family === 'gourmand' ? 2 : 0) : null;
    }
    case 'florality': {
      const w = accordWeights(f);
      return w ? sumOf(w, FLORAL_ACCORDS) + (f.fragrance_family === 'floral' ? 2 : 0) : null;
    }
    case 'presence': {
      const parts: number[] = [];
      if (f.community_projection != null) parts.push(f.community_projection);
      if (f.community_sillage != null) parts.push(f.community_sillage);
      const aiVals = Object.values(f.accord_intensity ?? {}).filter(
        (v): v is number => typeof v === 'number',
      );
      if (aiVals.length) parts.push(mean(aiVals));
      return parts.length ? mean(parts) : null;
    }
    case 'luxury':
      return luxuryRaw(f);
    case 'adventurousness':
      return f.popularity_tier != null ? 6 - f.popularity_tier : null;
    case 'era':
      return f.release_year != null ? f.release_year : null;
    case 'greenness': {
      const w = accordWeights(f);
      return w ? sumOf(w, GREEN_ACCORDS) : null;
    }
    case 'darkness': {
      const w = accordWeights(f);
      return w ? sumOf(w, DARK_ACCORDS) : null;
    }
    case 'spice': {
      const w = accordWeights(f);
      return w ? sumOf(w, SPICE_ACCORDS) : null;
    }
    case 'value': {
      const lux = luxuryRaw(f);
      if (lux == null || f.versatility_score == null) return null;
      return (1 - axisPercentile('luxury', lux)) * f.versatility_score;
    }
    case 'genderLean': {
      if (f.gender === 'masculine') return 0;
      if (f.gender === 'unisex') return 0.5;
      if (f.gender === 'feminine') return 1;
      return null;
    }
  }
}

/**
 * One bottle's catalog percentile on one axis, or `null` when the bottle can't
 * be scored on that axis. This is the value the user feature vector aggregates.
 */
export function axisPercentileOf(axis: CatalogAxis, f: DnaCatalogFragrance): number | null {
  const raw = rawAxisScore(axis, f);
  return raw == null ? null : axisPercentile(axis, raw);
}

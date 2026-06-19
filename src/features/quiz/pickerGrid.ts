/**
 * Picker grid logic (DNA spec Part 6) — recognizability-first, coverage-spread,
 * deterministic. Pure: the screen owns selection STATE, this owns selection LOGIC.
 *
 * Build order of concerns:
 *   1. Recognizability is a GATE — grid 1 pulls `popularity_tier >= 4`, reshuffles
 *      never drop below 3. There is no path to a tier ≤ 2 obscure bottle.
 *   2. Within the gated pool, greedy least-filled-cell coverage across
 *      (family lane × gender × projection band × price tier) — spread before
 *      doubling up, exactly like the bourbon greedy fill.
 *   3. Quiet tiebreak: higher popularity, then `compliment_score`.
 *
 * Reshuffle pivots the LANE the rejected grid over-represented (by pre-loading
 * those cells as "already filled"), excludes already-shown ids, and stays above
 * the fame floor — it changes the style, never lowers the fame.
 */

import {
  GRID1_TIER_FLOOR,
  RESHUFFLE_TIER_FLOOR,
  isPickerEligible,
  resolvePopularityTier,
} from './popularity';

export const PICKER_GRID_SIZE = 12;
export const PICKER_RESHUFFLE_CAP = 3;

/** Structural shape a tile needs — a subset of MockFragrance. */
export interface PickerCandidate {
  id: string;
  brand: string;
  name: string;
  image_url: string;
  fragrance_family: string;
  gender: 'feminine' | 'masculine' | 'unisex';
  top_accords: string[];
  community_projection: number; // 0..5
  compliment_score: number; // 0..1
  popularity_tier?: number;
}

interface BuildOptions {
  size?: number;
  /** Recognizability floor for this grid (4 for grid 1, 3 for reshuffles). */
  minTier?: number;
  /** Ids to exclude (already shown / already picked). */
  excludeIds?: Set<string>;
  /** Pre-loaded cell occupancy — used by reshuffle to pivot away from a lane. */
  seedCells?: Map<string, number>;
  /** Deterministic RNG seed (reshuffle count) so successive grids differ. */
  rngSeed?: number;
}

// How heavily a repeated brand is penalised relative to a filled coverage cell.
const BRAND_PENALTY = 0.5;

const clampProj = (p: number): number => (Number.isFinite(p) ? p : 3);

/** Projection band: intimate/office · moderate · loud ("beast"). */
function projBand(p: number): 'low' | 'mid' | 'high' {
  const v = clampProj(p);
  if (v < 2.5) return 'low';
  if (v <= 3.5) return 'mid';
  return 'high';
}

/** Coverage cell key: family lane × gender × projection band × price-ish tier. */
function cellKey(c: PickerCandidate): string {
  return `${(c.fragrance_family || 'other').toLowerCase()}|${c.gender}|${projBand(
    c.community_projection,
  )}`;
}

// Small deterministic PRNG so reshuffles are reproducible per seed.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Greedy coverage fill over a recognizability-gated pool. Deterministic for a
 * given (pool, options): the rng seed only perturbs the base ordering so a
 * reshuffle surfaces different-but-still-recognizable bottles.
 */
export function buildPickerGrid(catalog: PickerCandidate[], opts: BuildOptions = {}): PickerCandidate[] {
  const size = opts.size ?? PICKER_GRID_SIZE;
  const minTier = opts.minTier ?? GRID1_TIER_FLOOR;
  const exclude = opts.excludeIds ?? new Set<string>();
  const rng = mulberry32(opts.rngSeed ?? 0);

  // Gate: eligible, above the fame floor, not excluded.
  const pool = catalog.filter(
    (c) => !exclude.has(c.id) && isPickerEligible(c) && resolvePopularityTier(c) >= minTier,
  );

  // Stable base order: popularity desc, compliment desc, then a seeded jitter so
  // reshuffles vary, then id for full determinism.
  const jitter = new Map<string, number>();
  for (const c of pool) jitter.set(c.id, rng());
  pool.sort((a, b) => {
    const ta = resolvePopularityTier(a);
    const tb = resolvePopularityTier(b);
    if (tb !== ta) return tb - ta;
    if (b.compliment_score !== a.compliment_score) return b.compliment_score - a.compliment_score;
    const ja = jitter.get(a.id)!;
    const jb = jitter.get(b.id)!;
    if (ja !== jb) return ja - jb;
    return a.id < b.id ? -1 : 1;
  });

  const cellCount = new Map<string, number>(opts.seedCells ?? []);
  const brandCount = new Map<string, number>();
  const grid: PickerCandidate[] = [];
  const used = new Set<string>();

  while (grid.length < size) {
    let best: PickerCandidate | null = null;
    let bestCost = Infinity;
    let bestIdx = Infinity;

    for (let i = 0; i < pool.length; i++) {
      const c = pool[i];
      if (used.has(c.id)) continue;
      const cell = cellKey(c);
      const cost =
        (cellCount.get(cell) ?? 0) + BRAND_PENALTY * (brandCount.get(c.brand) ?? 0);
      // Lower cost wins; the pool is pre-sorted by recognizability so the first
      // candidate at a given (cost) is the most recognizable / highest compliment.
      if (cost < bestCost - 1e-9 || (Math.abs(cost - bestCost) <= 1e-9 && i < bestIdx)) {
        best = c;
        bestCost = cost;
        bestIdx = i;
      }
    }

    if (!best) break; // pool exhausted
    grid.push(best);
    used.add(best.id);
    const cell = cellKey(best);
    cellCount.set(cell, (cellCount.get(cell) ?? 0) + 1);
    brandCount.set(best.brand, (brandCount.get(best.brand) ?? 0) + 1);
  }

  return grid;
}

/**
 * Reshuffle: "show me different ones." Excludes everything shown so far, floors
 * the recognizability at tier 3, and pre-loads the cells the shown grid
 * over-represented so the next grid pivots the lane (gender / projection / family
 * spread) without lowering the fame. `reshuffleCount` seeds the jitter so each
 * press yields a fresh set. Returns `[]` only when the recognizable pool is dry —
 * the caller routes an empty reshuffle (or the cap) to the question fallback.
 */
export function reshufflePickerGrid(
  catalog: PickerCandidate[],
  shown: PickerCandidate[],
  reshuffleCount: number,
  size: number = PICKER_GRID_SIZE,
): PickerCandidate[] {
  const excludeIds = new Set(shown.map((c) => c.id));
  // Pre-load the lanes the rejected grid leaned on so the greedy fill steps away.
  const seedCells = new Map<string, number>();
  for (const c of shown) {
    const cell = cellKey(c);
    seedCells.set(cell, (seedCells.get(cell) ?? 0) + 1);
  }
  return buildPickerGrid(catalog, {
    size,
    minTier: RESHUFFLE_TIER_FLOOR,
    excludeIds,
    seedCells,
    rngSeed: reshuffleCount * 1009 + 17,
  });
}

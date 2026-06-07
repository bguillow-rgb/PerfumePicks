import type { Occasion, WearLog } from '@/src/stores/useWearLogStore';
import type { WardrobeItem } from '@/src/stores/useWardrobeStore';

/**
 * Perfume Wrapped stat computation (PRD §7 / M3b).
 *
 * Pure, side-effect-free so it's unit-testable and so the screen stays a thin
 * render layer. Computed CLIENT-SIDE from the local wear log (keyed by slug,
 * same as the catalog) on a rolling trailing-12-months window — no December
 * dead-stub, no RPC UUID/slug mismatch.
 */

export const SEASONS = ['Winter', 'Spring', 'Summer', 'Fall'] as const;
export type Season = (typeof SEASONS)[number];

export interface WrappedStats {
  totalWears: number;
  uniqueFragrances: number;
  topFragranceId: string | null;
  topFragranceCount: number;
  topBrand: string | null;
  topOccasion: Occasion | null;
  seasonal: Record<Season, number>;
  pctCollectionWorn: number | null;
  longestStreak: number;
}

/** Map a 0-indexed month to its meteorological season. */
export function seasonForMonth(month: number): Season {
  if (month <= 1 || month === 11) return 'Winter';
  if (month <= 4) return 'Spring';
  if (month <= 7) return 'Summer';
  return 'Fall';
}

/** The key with the highest count, or null if the map is empty / all zero. */
export function topKey<T extends string>(counts: Record<T, number>): T | null {
  let best: T | null = null;
  let bestN = 0;
  for (const k in counts) {
    if (counts[k] > bestN) { bestN = counts[k]; best = k as T; }
  }
  return best;
}

/**
 * Compute Wrapped stats over the trailing 12 months.
 *
 * @param logs       all wear logs (filtered to the window internally)
 * @param wardrobe   wardrobe items (used for "% of collection worn")
 * @param getBrand   resolves a fragrance_id → brand name (catalog lookup)
 * @param now        injectable clock for deterministic tests; defaults to today
 */
export function computeWrappedStats(
  logs: WearLog[],
  wardrobe: WardrobeItem[],
  getBrand: (fragranceId: string) => string | undefined,
  now: Date = new Date(),
): WrappedStats {
  const cutoff = new Date(now);
  cutoff.setFullYear(cutoff.getFullYear() - 1);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const window = logs.filter((l) => l.worn_on >= cutoffStr);

  const fragCounts: Record<string, number> = {};
  const occCounts: Record<string, number> = {};
  const brandCounts: Record<string, number> = {};
  const seasonal: Record<Season, number> = { Winter: 0, Spring: 0, Summer: 0, Fall: 0 };
  const days = new Set<string>();

  for (const l of window) {
    fragCounts[l.fragrance_id] = (fragCounts[l.fragrance_id] ?? 0) + 1;
    if (l.occasion) occCounts[l.occasion] = (occCounts[l.occasion] ?? 0) + 1;
    const m = Number(l.worn_on.slice(5, 7)) - 1;
    if (m >= 0 && m <= 11) seasonal[seasonForMonth(m)]++;
    days.add(l.worn_on);
    const brand = getBrand(l.fragrance_id);
    if (brand) brandCounts[brand] = (brandCounts[brand] ?? 0) + 1;
  }

  const topFragranceId = topKey(fragCounts);

  // Longest streak of consecutive calendar days with at least one wear.
  const sortedDays = [...days].sort();
  let longestStreak = sortedDays.length > 0 ? 1 : 0;
  let run = longestStreak;
  for (let i = 1; i < sortedDays.length; i++) {
    const prev = new Date(sortedDays[i - 1] + 'T00:00:00');
    const cur = new Date(sortedDays[i] + 'T00:00:00');
    const diff = Math.round((cur.getTime() - prev.getTime()) / 86_400_000);
    if (diff === 1) { run++; longestStreak = Math.max(longestStreak, run); }
    else run = 1;
  }

  // % of "have" collection worn in the window.
  const haveIds = wardrobe.filter((i) => i.status === 'have').map((i) => i.fragrance_id);
  const wornHave = haveIds.filter((id) => fragCounts[id] > 0).length;
  const pctCollectionWorn = haveIds.length > 0
    ? Math.round((wornHave / haveIds.length) * 100)
    : null;

  return {
    totalWears: window.length,
    uniqueFragrances: Object.keys(fragCounts).length,
    topFragranceId,
    topFragranceCount: topFragranceId ? fragCounts[topFragranceId] : 0,
    topBrand: topKey(brandCounts),
    topOccasion: topKey(occCounts) as Occasion | null,
    seasonal,
    pctCollectionWorn,
    longestStreak,
  };
}

/**
 * Picker search — "bring your own bottle" (FEATURE_PICKER_SEARCH.md, V3 M4).
 *
 * Pure logic for the picker's catalog search: the completeness gate, the
 * deliberate-weight composition, and the pick-list builder the screen's
 * startCompute uses. No I/O, no React — the screen and PickerSearch component
 * own the async search call (useCatalogStore.search) and the view state.
 */

import type { PickerCandidate } from '@/src/features/quiz/pickerGrid';
import type { DnaCatalogFragrance, DnaPick } from './types';
import { FAVORITE_MULTIPLIER } from './metrics';

/**
 * A search-sourced pick is a DELIBERATE signal — the user typed a bottle they
 * own instead of tapping a famous tile we offered. It outweighs a grid pick
 * (1.5×) and composes with the ⭐ favorite anchor multiplicatively:
 * `1.5 * (favorite ? 2.5 : 1)`. Applied as an explicit `pick.weight`, which
 * resolvePickWeight (metrics.ts) uses verbatim.
 */
export const SEARCH_DELIBERATE_WEIGHT = 1.5;

/** Result shelf stays short + horizontal — never hundreds of tiles. */
export const SEARCH_RESULT_LIMIT = 12;

/** Debounce on the search field before hitting the catalog. */
export const SEARCH_DEBOUNCE_MS = 250;

/** Effective weight for a search-sourced pick. */
export function searchPickWeight(favorite: boolean): number {
  return SEARCH_DELIBERATE_WEIGHT * (favorite ? FAVORITE_MULTIPLIER : 1);
}

/**
 * Completeness gate: a result can only feed the DNA when the axes can read it —
 * fragrance_family present AND top_accords non-empty. Incomplete rows render
 * dimmed ("Details coming soon") and tapping them enqueues enrich-on-demand
 * instead of docking. (Note: rowToFragrance defaults a NULL family to 'floral',
 * so in practice the accords check is the live half of the gate — kept both
 * per spec so a future raw-row path stays gated.)
 */
export function isSearchResultComplete(
  f: Pick<PickerCandidate, 'fragrance_family' | 'top_accords'>,
): boolean {
  return !!f.fragrance_family && Array.isArray(f.top_accords) && f.top_accords.length > 0;
}

/**
 * Build the DnaPick list for compute from the picker's selection state.
 * Extracted from the screen so the weight composition + cache-merge behavior
 * is unit-testable:
 *   - every pick is relation 'like' (taste signal, never wardrobe),
 *   - the ⭐ favorite flag rides on its pick,
 *   - search-sourced picks (ids in searchPickedIds) carry the explicit
 *     deliberate weight; grid picks carry NO weight → legacy pickWeight path.
 * Ids missing from byId are dropped (byId must already merge searchPickCache —
 * the compute-lookup trap fixed in M1).
 */
export function buildDnaPicks(args: {
  selectedIds: string[];
  favoriteId: string | null;
  searchPickedIds: string[];
  byId: Map<string, PickerCandidate>;
}): DnaPick[] {
  const searchPicked = new Set(args.searchPickedIds);
  return args.selectedIds
    .map((id) => args.byId.get(id))
    .filter((f): f is PickerCandidate => !!f)
    .map((f) => {
      const favorite = args.favoriteId === f.id;
      const pick: DnaPick = {
        fragrance: f as unknown as DnaCatalogFragrance,
        relation: 'like',
        favorite,
      };
      if (searchPicked.has(f.id)) pick.weight = searchPickWeight(favorite);
      return pick;
    });
}

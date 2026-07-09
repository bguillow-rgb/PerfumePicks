import { create } from 'zustand';
import { MAX_PICKS, type PickerCandidate } from '@/src/features/quiz/pickerGrid';

/**
 * In-memory capture of what the user does in the DNA picker (M2). Holds the
 * picker selections — positive picks, hard-nos, the ⭐ favorite anchor, and the
 * own/want relation per pick — so M3 can compute the DNA and M4 can persist it.
 *
 * Deliberately NOT persisted: the picker is the front door of a fresh install,
 * runs once, and feeds compute immediately. Persistence of the resulting
 * `FragranceDNA` lands in M4, not the raw picker state.
 */

// 'like' = drawn to the scent, but neither owned nor wanted → feeds DNA, never
// seeds the wardrobe. Mirrors SeedRelation in features/dna/types.
export type PickRelation = 'own' | 'want' | 'like';

interface DnaPickerState {
  /** Positively selected fragrance ids (the picks). */
  selectedIds: string[];
  /** Long-pressed "not for me" ids — never re-shown, seed avoided. */
  hardNoIds: string[];
  /** The single ⭐ favorite anchor (one of selectedIds), or null. */
  favoriteId: string | null;
  /** Per-pick own/want relation. Defaults to 'own' when unset. */
  relations: Record<string, PickRelation>;
  /**
   * Catalog rows for picks made OUTSIDE the offered pool (picker search, M4).
   * Compute merges this into its id→fragrance lookup so a non-pool pick
   * survives to the DNA instead of being silently dropped (the old
   * pool-only-byId trap). Empty until the search picker populates it.
   */
  searchPickCache: Record<string, PickerCandidate>;
  /**
   * Ids picked VIA SEARCH this session (M4) — the deliberate-signal marker.
   * Drives the gold "brought-in" ring and the SEARCH_DELIBERATE_WEIGHT at
   * compute. Sticky for the session: deselecting a gold tile keeps its id here
   * (re-selecting restores the ring + weight); only reset() clears it.
   */
  searchPickedIds: string[];
  /**
   * Search-docked tiles pinned to the head of the grid (M4). Prepended to the
   * visible list, NEVER subject to greedy fill or lazy-reveal drops. A
   * deselected pinned tile stays here (greyed) for the session.
   */
  pinned: PickerCandidate[];

  toggleSelect: (id: string) => void;
  addHardNo: (id: string) => void;
  setFavorite: (id: string | null) => void;
  setRelation: (id: string, rel: PickRelation) => void;
  /** Cache the catalog row behind a search-sourced pick (M4). */
  cacheSearchPick: (f: PickerCandidate) => void;
  /**
   * A search result was tapped (M4). `inGrid` = the bottle already exists in
   * the offered grid list. Outcomes:
   *   'max'      — cap guard fired (new pick past MAX_PICKS); nothing changed.
   *   'docked'   — new bottle pinned to slot 0, selected, marked search-picked.
   *   'promoted' — grid tile (or an already-selected pick): selected + promoted
   *                to deliberate weight; NO duplicate tile is pinned.
   *   'noop'     — already selected AND already search-picked.
   * The screen owns haptics/toasts/scrolling per outcome.
   */
  pickFromSearch: (f: PickerCandidate, inGrid: boolean) => 'docked' | 'promoted' | 'max' | 'noop';
  reset: () => void;
}

export const useDnaPickerStore = create<DnaPickerState>()((set, get) => ({
  selectedIds: [],
  hardNoIds: [],
  favoriteId: null,
  relations: {},
  searchPickCache: {},
  searchPickedIds: [],
  pinned: [],

  toggleSelect: (id) =>
    set((s) => {
      const has = s.selectedIds.includes(id);
      if (has) {
        // De-selecting clears its favorite/relation too.
        const relations = { ...s.relations };
        delete relations[id];
        return {
          selectedIds: s.selectedIds.filter((x) => x !== id),
          favoriteId: s.favoriteId === id ? null : s.favoriteId,
          relations,
        };
      }
      return { selectedIds: [...s.selectedIds, id] };
    }),

  addHardNo: (id) =>
    set((s) => ({
      hardNoIds: s.hardNoIds.includes(id) ? s.hardNoIds : [...s.hardNoIds, id],
      // A hard-no can't also be a positive pick.
      selectedIds: s.selectedIds.filter((x) => x !== id),
      favoriteId: s.favoriteId === id ? null : s.favoriteId,
    })),

  setFavorite: (id) => set({ favoriteId: id }),

  setRelation: (id, rel) => set((s) => ({ relations: { ...s.relations, [id]: rel } })),

  cacheSearchPick: (f) =>
    set((s) => ({ searchPickCache: { ...s.searchPickCache, [f.id]: f } })),

  pickFromSearch: (f, inGrid) => {
    const s = get();
    const selected = s.selectedIds.includes(f.id);
    const searchPicked = s.searchPickedIds.includes(f.id);

    // Nothing left to do — already selected AND already carrying the gold ring.
    if (selected && searchPicked) return 'noop';

    // Single cap guard, same rule as handleTap: only a NEW pick past the
    // ceiling is blocked; promoting an already-selected tile always works.
    if (!selected && s.selectedIds.length >= MAX_PICKS) return 'max';

    if (inGrid || selected) {
      // Dupe of a grid tile (or an already-selected pick): no second tile —
      // select it (if needed) and promote it to deliberate weight.
      set({
        selectedIds: selected ? s.selectedIds : [...s.selectedIds, f.id],
        searchPickedIds: searchPicked ? s.searchPickedIds : [...s.searchPickedIds, f.id],
      });
      return 'promoted';
    }

    // New bottle from the catalog: cache the row for compute (the byId merge),
    // pin it to slot 0, select it, and mark it search-picked.
    set({
      searchPickCache: { ...s.searchPickCache, [f.id]: f },
      pinned: s.pinned.some((p) => p.id === f.id) ? s.pinned : [f, ...s.pinned],
      selectedIds: [...s.selectedIds, f.id],
      searchPickedIds: searchPicked ? s.searchPickedIds : [...s.searchPickedIds, f.id],
    });
    return 'docked';
  },

  reset: () =>
    set({
      selectedIds: [],
      hardNoIds: [],
      favoriteId: null,
      relations: {},
      searchPickCache: {},
      searchPickedIds: [],
      pinned: [],
    }),
}));

import { create } from 'zustand';
import type { PickerCandidate } from '@/src/features/quiz/pickerGrid';

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

  toggleSelect: (id: string) => void;
  addHardNo: (id: string) => void;
  setFavorite: (id: string | null) => void;
  setRelation: (id: string, rel: PickRelation) => void;
  /** Cache the catalog row behind a search-sourced pick (M4). */
  cacheSearchPick: (f: PickerCandidate) => void;
  reset: () => void;
}

export const useDnaPickerStore = create<DnaPickerState>()((set) => ({
  selectedIds: [],
  hardNoIds: [],
  favoriteId: null,
  relations: {},
  searchPickCache: {},

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

  reset: () =>
    set({ selectedIds: [], hardNoIds: [], favoriteId: null, relations: {}, searchPickCache: {} }),
}));

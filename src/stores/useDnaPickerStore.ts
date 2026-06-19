import { create } from 'zustand';

/**
 * In-memory capture of what the user does in the DNA picker (M2). Holds the
 * picker selections — positive picks, hard-nos, the ⭐ favorite anchor, and the
 * own/want relation per pick — so M3 can compute the DNA and M4 can persist it.
 *
 * Deliberately NOT persisted: the picker is the front door of a fresh install,
 * runs once, and feeds compute immediately. Persistence of the resulting
 * `FragranceDNA` lands in M4, not the raw picker state.
 */

export type PickRelation = 'own' | 'want';

interface DnaPickerState {
  /** Positively selected fragrance ids (the picks). */
  selectedIds: string[];
  /** Long-pressed "not for me" ids — never re-shown, seed avoided. */
  hardNoIds: string[];
  /** The single ⭐ favorite anchor (one of selectedIds), or null. */
  favoriteId: string | null;
  /** Per-pick own/want relation. Defaults to 'own' when unset. */
  relations: Record<string, PickRelation>;

  toggleSelect: (id: string) => void;
  addHardNo: (id: string) => void;
  setFavorite: (id: string | null) => void;
  setRelation: (id: string, rel: PickRelation) => void;
  reset: () => void;
}

export const useDnaPickerStore = create<DnaPickerState>()((set) => ({
  selectedIds: [],
  hardNoIds: [],
  favoriteId: null,
  relations: {},

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

  reset: () => set({ selectedIds: [], hardNoIds: [], favoriteId: null, relations: {} }),
}));

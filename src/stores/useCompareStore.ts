import { create } from 'zustand';

/**
 * Compare tray — the 2–3 fragrances a user has picked to view side-by-side
 * (PRD §7.5). Transient (not persisted): a comparison is a per-session task,
 * not durable state. Holds app-level fragrance IDs (slugs / custom IDs).
 */

export const COMPARE_MAX = 3;

interface CompareState {
  ids: string[];
  has: (id: string) => boolean;
  /** Add/remove an ID. Returns false if adding would exceed COMPARE_MAX. */
  toggle: (id: string) => boolean;
  remove: (id: string) => void;
  clear: () => void;
}

export const useCompareStore = create<CompareState>((set, get) => ({
  ids: [],

  has: (id) => get().ids.includes(id),

  toggle: (id) => {
    const { ids } = get();
    if (ids.includes(id)) {
      set({ ids: ids.filter((x) => x !== id) });
      return true;
    }
    if (ids.length >= COMPARE_MAX) return false;
    set({ ids: [...ids, id] });
    return true;
  },

  remove: (id) => set((s) => ({ ids: s.ids.filter((x) => x !== id) })),

  clear: () => set({ ids: [] }),
}));

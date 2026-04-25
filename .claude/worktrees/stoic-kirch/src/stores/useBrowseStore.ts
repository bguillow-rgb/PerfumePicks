// In-memory session store for Browse-tab search state.
//
// Rationale: the Browse screen owns useState for query/results, and tabs
// + cigar detail both cause the Browse component to fully unmount. On
// return the user would see an empty search bar — the user's complaint
// "back from results should return to the search page" really means
// "don't wipe my in-progress search just because I tapped a result."
//
// We deliberately skip AsyncStorage persistence here. Search is
// session-scoped — the user doesn't expect Tuesday's search to still be
// there on Thursday. Zustand without persist() gives us a module-level
// cache that survives remounts within an app session but clears on app
// cold start, which matches the right mental model.
//
// `includeCubans` is also cached because the toggle would otherwise reset
// whenever the user taps away and back.

import { create } from 'zustand';
import type { Cigar } from '@/src/types/cigar';

interface BrowseState {
  query: string;
  cigars: Cigar[];
  hasSearched: boolean;
  activeBrand: string | null;
  includeCubans: boolean;

  setState: (patch: Partial<Omit<BrowseState, 'setState' | 'reset'>>) => void;
  reset: () => void;
}

export const useBrowseStore = create<BrowseState>((set) => ({
  query: '',
  cigars: [],
  hasSearched: false,
  activeBrand: null,
  includeCubans: false,

  setState: (patch) => set(patch),
  reset: () =>
    set({
      query: '',
      cigars: [],
      hasSearched: false,
      activeBrand: null,
      includeCubans: false,
    }),
}));

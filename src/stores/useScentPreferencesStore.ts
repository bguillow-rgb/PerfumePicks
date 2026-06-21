import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '@/src/lib/storageKeys';
import type { RecContext } from '@/src/features/recommend/score';

/**
 * Scent Preferences — the user's *stated constraints*, the third taste layer
 * alongside Fragrance DNA (identity) and Train Your Nose (learned taste). These
 * are things we can't infer from behaviour: a hard avoid list, a spend ceiling,
 * and the occasion/season they mostly wear for.
 *
 * The rec engine reads these directly (see useRecommendations): avoid + budget
 * become scoring constraints, occasion + season pin the context. Persisted so
 * they survive app kills and apply on every launch.
 */
export type PrefOccasion = NonNullable<RecContext['occasion']>;
export type PrefSeason = NonNullable<RecContext['season']>;

interface ScentPreferencesState {
  /** Avoid-group ids (see AVOID_GROUPS in constants/accords). */
  avoid: string[];
  /** Max price tier 1..5 the user will consider; null = no ceiling. */
  budget: number | null;
  /** Primary occasion to bias toward; null = no preference. */
  occasion: PrefOccasion | null;
  /** Season to bias toward; null = all year. */
  season: PrefSeason | null;

  toggleAvoid: (id: string) => void;
  setBudget: (tier: number | null) => void;
  setOccasion: (occasion: PrefOccasion | null) => void;
  setSeason: (season: PrefSeason | null) => void;
  reset: () => void;
}

export const useScentPreferencesStore = create<ScentPreferencesState>()(
  persist(
    (set) => ({
      avoid: [],
      budget: null,
      occasion: null,
      season: null,

      toggleAvoid: (id) =>
        set((s) => ({
          avoid: s.avoid.includes(id)
            ? s.avoid.filter((x) => x !== id)
            : [...s.avoid, id],
        })),
      setBudget: (tier) => set({ budget: tier }),
      setOccasion: (occasion) => set({ occasion }),
      setSeason: (season) => set({ season }),
      reset: () => set({ avoid: [], budget: null, occasion: null, season: null }),
    }),
    {
      name: STORAGE_KEYS.scentPreferences,
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);

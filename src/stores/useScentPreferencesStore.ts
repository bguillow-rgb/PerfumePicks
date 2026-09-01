import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '@/src/lib/storageKeys';
import type { RecContext } from '@/src/features/recommend/score';
import { DEFAULT_GENDER_PREF, type GenderPref } from '@/src/lib/genderFilter';

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
  /**
   * Which audience's fragrances to show across the whole app. Unlike the fields
   * above (which bias RANKING), this one FILTERS what is visible, so it is
   * chosen in onboarding before anything is shown and is changeable in
   * Settings at any time. Defaults to 'all' so existing installs and anyone who
   * skips the question keep seeing the full catalogue — a filter must never be
   * applied to someone who never asked for one.
   */
  genderPref: GenderPref;
  /**
   * Whether the user has actually ANSWERED the audience question. Distinct from
   * genderPref, because "chose Everything" and "was never asked" both read as
   * 'all' — without this flag the onboarding step would either re-prompt people
   * who deliberately chose Everything, or never prompt at all. Existing installs
   * land on false and are NOT retro-prompted: the route guard only asks users
   * who have not completed onboarding.
   */
  audienceChosen: boolean;

  toggleAvoid: (id: string) => void;
  setBudget: (tier: number | null) => void;
  setOccasion: (occasion: PrefOccasion | null) => void;
  setSeason: (season: PrefSeason | null) => void;
  setGenderPref: (pref: GenderPref) => void;
  reset: () => void;
}

export const useScentPreferencesStore = create<ScentPreferencesState>()(
  persist(
    (set) => ({
      avoid: [],
      budget: null,
      occasion: null,
      season: null,
      genderPref: DEFAULT_GENDER_PREF,
      audienceChosen: false,

      toggleAvoid: (id) =>
        set((s) => ({
          avoid: s.avoid.includes(id)
            ? s.avoid.filter((x) => x !== id)
            : [...s.avoid, id],
        })),
      setBudget: (tier) => set({ budget: tier }),
      setOccasion: (occasion) => set({ occasion }),
      setSeason: (season) => set({ season }),
      setGenderPref: (genderPref) => set({ genderPref, audienceChosen: true }),
      // NOTE: genderPref is deliberately NOT reset — it is an accessibility-ish
      // display choice the user made about themselves, not a taste constraint,
      // and silently reverting it to "everything" would be a surprise.
      reset: () => set({ avoid: [], budget: null, occasion: null, season: null }),
    }),
    {
      name: STORAGE_KEYS.scentPreferences,
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);

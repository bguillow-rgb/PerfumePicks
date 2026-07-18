import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * What the Scent of the Day ACTUALLY SHOWED, per local day.
 *
 * Why this exists: SOTD rotation used to depend entirely on wear RECENCY, which
 * reads lastWorn from wear_logs. Almost nobody logs wears (11 logs across the whole
 * user base), so every bottle looked "never worn", every bottle got the same
 * recency bonus, and the ranking collapsed to a static fit score. With only a
 * ±0.02 day jitter to separate them, the single best-fitting bottle won every day
 * forever — one user saw the same pick for a week with 37 bottles in their wardrobe.
 *
 * The fix is to stop depending on the user logging anything: the app already knows
 * what it put on screen. Recording that here lets the engine demote what it showed
 * recently and rotate through the wardrobe on its own.
 *
 * Device-local on purpose — it mirrors what THIS device displayed, needs no
 * network, and is worthless to anyone else.
 */

/** One day's shown pick. `date` is a local YYYY-MM-DD. */
export interface SotdShown {
  fragranceId: string;
  date: string;
}

/** Keep a rolling fortnight — the penalty decays to zero after 7 days, so older
 *  entries can't affect scoring and would just grow the payload. */
const MAX_ENTRIES = 14;

interface SotdHistoryState {
  shown: SotdShown[];
  /** Record (or overwrite) the pick shown on `date`. One entry per local day. */
  record: (fragranceId: string, date: string) => void;
}

export const useSotdHistoryStore = create<SotdHistoryState>()(
  persist(
    (set) => ({
      shown: [],
      record: (fragranceId, date) =>
        set((s) => {
          const existing = s.shown.find((e) => e.date === date);
          // Idempotent: re-rendering the same day must not churn the list, and the
          // day's pick is locked, so an existing entry for today wins.
          if (existing) {
            if (existing.fragranceId === fragranceId) return s;
            return {
              shown: s.shown.map((e) => (e.date === date ? { fragranceId, date } : e)),
            };
          }
          const next = [...s.shown, { fragranceId, date }];
          next.sort((a, b) => (a.date < b.date ? 1 : -1)); // newest first
          return { shown: next.slice(0, MAX_ENTRIES) };
        }),
    }),
    {
      name: 'pp.sotdHistory',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ shown: s.shown }),
    },
  ),
);

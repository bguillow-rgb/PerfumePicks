import { STORAGE_KEYS } from '@/src/lib/storageKeys';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Persisted swipe history from "Train My Nose".
 *
 * Mirrors the v1 schema's `swipe_feedback` table. Each row is the user's
 * latest decision on a single fragrance — a re-swipe overwrites the prior
 * action so the taste profile reflects the user's CURRENT preference, not
 * a pile of contradictory historical signals.
 */

export type SwipeAction = 'love' | 'like' | 'dislike' | 'skip';

export interface SwipeRecord {
  fragrance_id: string;
  action: SwipeAction;
  created_at: string;
}

/** Free tier daily swipe cap. */
export const FREE_DAILY_SWIPE_LIMIT = 10;

interface SwipeState {
  /** Map fragrance_id → latest swipe (so re-swipes replace cleanly). */
  swipes: Record<string, SwipeRecord>;
  /** Number of swipes recorded today (resets on date change). */
  dailySwipeCount: number;
  /** ISO local date "YYYY-MM-DD" of the last swipe — used to detect day rollover. */
  dailySwipeDate: string;
  record: (fragrance_id: string, action: SwipeAction) => void;
  clear: () => void;
  /** All swipes as an array, newest first. */
  list: () => SwipeRecord[];
  /** Fragrance ids the user loved OR liked (for quick filters). */
  likedIds: () => string[];
  /** Fragrance ids the user loved (right swipe only). */
  lovedIds: () => string[];
  dislikedIds: () => string[];
}

export const useSwipeStore = create<SwipeState>()(
  persist(
    (set, get) => ({
      swipes: {},
      dailySwipeCount: 0,
      dailySwipeDate: '',
      record: (fragrance_id, action) => {
        const today = new Date().toLocaleDateString('en-CA');
        set((s) => {
          const isNewDay = s.dailySwipeDate !== today;
          return {
            swipes: {
              ...s.swipes,
              [fragrance_id]: { fragrance_id, action, created_at: new Date().toISOString() },
            },
            dailySwipeCount: isNewDay ? 1 : s.dailySwipeCount + 1,
            dailySwipeDate: today,
          };
        });
      },
      clear: () => set({ swipes: {}, dailySwipeCount: 0, dailySwipeDate: '' }),
      list: () =>
        Object.values(get().swipes).sort((a, b) => b.created_at.localeCompare(a.created_at)),
      likedIds: () =>
        Object.values(get().swipes)
          .filter((s) => s.action === 'love' || s.action === 'like')
          .map((s) => s.fragrance_id),
      lovedIds: () =>
        Object.values(get().swipes).filter((s) => s.action === 'love').map((s) => s.fragrance_id),
      dislikedIds: () =>
        Object.values(get().swipes).filter((s) => s.action === 'dislike').map((s) => s.fragrance_id),
    }),
    {
      name: STORAGE_KEYS.swipes,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        swipes: s.swipes,
        dailySwipeCount: s.dailySwipeCount,
        dailySwipeDate: s.dailySwipeDate,
      }),
    },
  ),
);

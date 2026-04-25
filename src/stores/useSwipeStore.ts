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

export type SwipeAction = 'like' | 'dislike' | 'skip';

export interface SwipeRecord {
  fragrance_id: string;
  action: SwipeAction;
  created_at: string;
}

interface SwipeState {
  /** Map fragrance_id → latest swipe (so re-swipes replace cleanly). */
  swipes: Record<string, SwipeRecord>;
  record: (fragrance_id: string, action: SwipeAction) => void;
  clear: () => void;
  /** All swipes as an array, newest first. */
  list: () => SwipeRecord[];
  /** Just the liked fragrance ids (for quick filters). */
  likedIds: () => string[];
  dislikedIds: () => string[];
}

export const useSwipeStore = create<SwipeState>()(
  persist(
    (set, get) => ({
      swipes: {},
      record: (fragrance_id, action) =>
        set((s) => ({
          swipes: {
            ...s.swipes,
            [fragrance_id]: { fragrance_id, action, created_at: new Date().toISOString() },
          },
        })),
      clear: () => set({ swipes: {} }),
      list: () =>
        Object.values(get().swipes).sort((a, b) => b.created_at.localeCompare(a.created_at)),
      likedIds: () =>
        Object.values(get().swipes).filter((s) => s.action === 'like').map((s) => s.fragrance_id),
      dislikedIds: () =>
        Object.values(get().swipes).filter((s) => s.action === 'dislike').map((s) => s.fragrance_id),
    }),
    {
      name: 'perfumepicks-swipes',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ swipes: s.swipes }),
    },
  ),
);

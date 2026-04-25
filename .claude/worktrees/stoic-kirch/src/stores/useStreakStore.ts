// Zustand store that mirrors the server `user_streaks` rows for offline-
// tolerant UI. The server is authoritative — this cache exists solely so
// the profile surface doesn't flash empty on cold start or network jank.
//
// Persistence follows the same pattern as `useProStore`:
//   - Persist `streaks` + `lastPulledAt` (the data + a freshness sentinel)
//   - `hasHydrated` is runtime-only (don't serialize; flip true in
//     onRehydrateStorage so UI can gate on it)
//
// Mutation entry points:
//   - apply(state): called by tickStreak's caller with the RPC response
//     so we pick up increments immediately without waiting for pullAll
//   - hydrate(rows): called by _layout's pullAllStreaks hook on sign-in
//     and on app-active transitions
//   - reset(): called on sign-out so the next user doesn't see stale data

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { StreakState, StreakType } from '@/src/features/streaks/streaksService';

interface StreakStoreState {
  streaks: Partial<Record<StreakType, StreakState>>;
  lastPulledAt: number | null;
  hasHydrated: boolean;

  apply: (s: StreakState) => void;
  hydrate: (rows: StreakState[]) => void;
  reset: () => void;
  setHasHydrated: (v: boolean) => void;
}

export const useStreakStore = create<StreakStoreState>()(
  persist(
    (set) => ({
      streaks: {},
      lastPulledAt: null,
      hasHydrated: false,

      apply: (s) =>
        set((prev) => ({
          streaks: { ...prev.streaks, [s.streak_type]: s },
        })),

      hydrate: (rows) =>
        set(() => {
          const next: Partial<Record<StreakType, StreakState>> = {};
          for (const r of rows) next[r.streak_type] = r;
          return { streaks: next, lastPulledAt: Date.now() };
        }),

      reset: () => set({ streaks: {}, lastPulledAt: null }),

      setHasHydrated: (v) => set({ hasHydrated: v }),
    }),
    {
      name: 'stick-picks-streaks',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ streaks: s.streaks, lastPulledAt: s.lastPulledAt }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);
